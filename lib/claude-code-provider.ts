/**
 * Claude Code provider — wraps the locally-installed `claude` CLI as an
 * AI SDK v3 LanguageModel. Forwards conversation turns to a one-shot
 * `claude --print` subprocess, streams stdout back as text deltas, and
 * synthesizes a `display_diagram` tool call when the response contains
 * a fenced ```drawio-xml``` block.
 *
 * Auth: relies on the user's existing Claude Code login (`claude /login`)
 * or `ANTHROPIC_API_KEY`. No API key is required by this provider itself,
 * which mirrors the desktop humanizer integration that forwards prompts
 * to the local CLI.
 *
 * Runtime: Node.js only (uses `node:child_process.spawn` with an args
 * array — no shell interpolation). Only imported from server-side
 * code paths (the chat API route via `ai-providers.ts`).
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type {
    LanguageModelV3,
    LanguageModelV3CallOptions,
    LanguageModelV3Content,
    LanguageModelV3GenerateResult,
    LanguageModelV3Message,
    LanguageModelV3StreamPart,
    LanguageModelV3StreamResult,
    LanguageModelV3Usage,
    SharedV3Warning,
} from "@ai-sdk/provider"

const PROVIDER_ID = "claudecode"

const TOOL_INSTRUCTION = `
=== Claude Code provider runtime notes ===
You are running as the AI behind a draw.io diagram editor. The host
application normally exposes a \`display_diagram\` tool, but this
provider talks to you through the \`claude --print\` CLI which has no
access to that tool. Use the conventions below instead — they are
parsed by the host on your behalf:

1. When you need to draw or replace the diagram, output the mxCell
   elements inside a fenced code block tagged \`drawio-xml\`:

   \`\`\`drawio-xml
   <mxCell id="2" value="Hello" style="rounded=0;" vertex="1" parent="1">
     <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
   </mxCell>
   \`\`\`

2. Inside the block, output ONLY mxCell siblings — no <mxfile>,
   <mxGraphModel>, or <root> wrappers, and no id="0" / id="1" cells.
3. Emit at most one \`drawio-xml\` block per turn. The block contents
   replace the entire canvas.
4. For any text that is not the diagram itself (explanations, asking
   clarifying questions, etc.) write it as plain prose outside the
   fenced block.
=== End provider runtime notes ===
`.trim()

function resolveClaudeBin(override?: string): string {
    if (override && existsSync(override)) return override
    if (
        process.env.CLAUDE_CODE_BIN &&
        existsSync(process.env.CLAUDE_CODE_BIN)
    ) {
        return process.env.CLAUDE_CODE_BIN
    }
    const home = homedir()
    const candidates = [
        path.join(home, ".claude/local/claude"),
        path.join(home, ".local/bin/claude"),
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
    ]
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate
    }
    // Fall back to PATH lookup; spawn will error if not found.
    return "claude"
}

interface FlattenedPrompt {
    systemText: string
    conversation: string
}

function partsToText(
    parts: ReadonlyArray<{ type: string; [k: string]: unknown }>,
): { text: string; warnings: string[] } {
    const warnings: string[] = []
    const fragments: string[] = []
    for (const raw of parts) {
        const part = raw as unknown as Record<string, unknown>
        switch (part.type) {
            case "text":
                fragments.push(String(part.text ?? ""))
                break
            case "reasoning":
                // Skip reasoning — the CLI generates its own.
                break
            case "tool-call": {
                fragments.push(
                    `[tool call ${String(part.toolName)}(${JSON.stringify(part.input)})]`,
                )
                break
            }
            case "tool-result": {
                const output = part.output
                fragments.push(
                    `[tool result from ${String(part.toolName)}: ${
                        typeof output === "string"
                            ? output
                            : JSON.stringify(output)
                    }]`,
                )
                break
            }
            case "file":
                warnings.push(
                    "claudecode provider currently ignores file/image parts in the conversation history",
                )
                break
            default:
                break
        }
    }
    return { text: fragments.join("\n").trim(), warnings }
}

function flattenPrompt(prompt: ReadonlyArray<LanguageModelV3Message>): {
    flattened: FlattenedPrompt
    warnings: SharedV3Warning[]
} {
    const systemChunks: string[] = []
    const turns: string[] = []
    const warnings: SharedV3Warning[] = []

    for (const msg of prompt) {
        if (msg.role === "system") {
            const text = typeof msg.content === "string" ? msg.content : ""
            if (text.trim()) systemChunks.push(text.trim())
            continue
        }

        if (msg.role === "tool") {
            const { text, warnings: w } = partsToText(msg.content as never)
            for (const m of w) {
                warnings.push({ type: "other", message: m })
            }
            if (text) turns.push(`[tool]\n${text}`)
            continue
        }

        const { text, warnings: w } = partsToText(msg.content as never)
        for (const m of w) {
            warnings.push({ type: "other", message: m })
        }
        if (!text) continue
        const speaker = msg.role === "user" ? "User" : "Assistant"
        turns.push(`[${speaker}]\n${text}`)
    }

    return {
        flattened: {
            systemText: [...systemChunks, TOOL_INSTRUCTION]
                .filter(Boolean)
                .join("\n\n"),
            conversation: turns.join("\n\n"),
        },
        warnings,
    }
}

const DRAWIO_XML_BLOCK_RE = /```drawio-xml\s*\n([\s\S]*?)\n```/

function extractDiagramXml(text: string): string | null {
    const m = DRAWIO_XML_BLOCK_RE.exec(text)
    if (!m) return null
    const inner = m[1].trim()
    return inner.length > 0 ? inner : null
}

interface SpawnConfig {
    bin: string
    modelId: string
    abortSignal?: AbortSignal
}

function spawnClaude(prompt: string, config: SpawnConfig) {
    const args = ["--print", "--no-session-persistence"]
    if (config.modelId && config.modelId.toLowerCase() !== "default") {
        args.push("--model", config.modelId)
    }
    args.push(prompt)

    const proc = spawn(config.bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
    })

    config.abortSignal?.addEventListener(
        "abort",
        () => {
            try {
                proc.kill("SIGTERM")
            } catch {
                // ignore
            }
        },
        { once: true },
    )

    return proc
}

function emptyUsage(): LanguageModelV3Usage {
    return {
        inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
        },
        outputTokens: {
            total: undefined,
            text: undefined,
            reasoning: undefined,
        },
    }
}

export interface ClaudeCodeModelOptions {
    cliPath?: string
}

export function createClaudeCodeModel(
    modelId: string,
    options: ClaudeCodeModelOptions = {},
): LanguageModelV3 {
    const bin = resolveClaudeBin(options.cliPath)

    async function doStream(
        callOptions: LanguageModelV3CallOptions,
    ): Promise<LanguageModelV3StreamResult> {
        const { flattened, warnings } = flattenPrompt(callOptions.prompt)
        const fullPrompt = flattened.conversation
            ? `${flattened.systemText}\n\n${flattened.conversation}`
            : flattened.systemText

        const proc = spawnClaude(fullPrompt, {
            bin,
            modelId,
            abortSignal: callOptions.abortSignal,
        })

        const decoder = new TextDecoder()
        let stderrBuf = ""
        proc.stderr?.on("data", (chunk: Buffer) => {
            stderrBuf += decoder.decode(chunk, { stream: true })
        })

        const stream = new ReadableStream<LanguageModelV3StreamPart>({
            start(controller) {
                controller.enqueue({ type: "stream-start", warnings })

                const textId = `claudecode-text-${Date.now()}`
                let textStarted = false
                let totalText = ""
                let closed = false

                const startTextIfNeeded = () => {
                    if (textStarted) return
                    controller.enqueue({ type: "text-start", id: textId })
                    textStarted = true
                }

                const safeClose = () => {
                    if (closed) return
                    closed = true
                    controller.close()
                }

                proc.stdout?.on("data", (chunk: Buffer) => {
                    const piece = decoder.decode(chunk, { stream: true })
                    if (!piece) return
                    startTextIfNeeded()
                    totalText += piece
                    controller.enqueue({
                        type: "text-delta",
                        id: textId,
                        delta: piece,
                    })
                })

                proc.on("error", (err) => {
                    controller.enqueue({ type: "error", error: err })
                    controller.enqueue({
                        type: "finish",
                        finishReason: { unified: "error", raw: undefined },
                        usage: emptyUsage(),
                    })
                    safeClose()
                })

                proc.on("close", (code, signal) => {
                    const tail = decoder.decode()
                    if (tail) {
                        startTextIfNeeded()
                        totalText += tail
                        controller.enqueue({
                            type: "text-delta",
                            id: textId,
                            delta: tail,
                        })
                    }

                    if (textStarted) {
                        controller.enqueue({ type: "text-end", id: textId })
                    }

                    const xml = extractDiagramXml(totalText)
                    let finishUnified: "stop" | "tool-calls" | "error" = "stop"

                    if (xml) {
                        const toolCallId = `claudecode-call-${Date.now()}`
                        controller.enqueue({
                            type: "tool-call",
                            toolCallId,
                            toolName: "display_diagram",
                            input: JSON.stringify({ xml }),
                        })
                        finishUnified = "tool-calls"
                    }

                    if (code !== 0 && totalText.trim().length === 0) {
                        controller.enqueue({
                            type: "error",
                            error: new Error(
                                `claude CLI exited with code ${code}${
                                    signal ? ` (signal ${signal})` : ""
                                }: ${stderrBuf.trim() || "no stderr output"}`,
                            ),
                        })
                        finishUnified = "error"
                    }

                    controller.enqueue({
                        type: "finish",
                        finishReason: {
                            unified: finishUnified,
                            raw:
                                signal ??
                                (code !== null ? String(code) : undefined),
                        },
                        usage: emptyUsage(),
                    })

                    safeClose()
                })
            },
            cancel() {
                try {
                    proc.kill("SIGTERM")
                } catch {
                    // ignore
                }
            },
        })

        return { stream }
    }

    async function doGenerate(
        callOptions: LanguageModelV3CallOptions,
    ): Promise<LanguageModelV3GenerateResult> {
        const { stream } = await doStream(callOptions)
        const reader = stream.getReader()
        const content: LanguageModelV3Content[] = []
        let textBuffer = ""
        let textId: string | null = null
        let finishReason: LanguageModelV3GenerateResult["finishReason"] = {
            unified: "stop",
            raw: undefined,
        }
        const collectedWarnings: SharedV3Warning[] = []

        for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            switch (value.type) {
                case "stream-start":
                    collectedWarnings.push(...value.warnings)
                    break
                case "text-start":
                    textId = value.id
                    textBuffer = ""
                    break
                case "text-delta":
                    if (value.id === textId) textBuffer += value.delta
                    break
                case "text-end":
                    if (textBuffer.trim()) {
                        content.push({ type: "text", text: textBuffer })
                    }
                    textBuffer = ""
                    textId = null
                    break
                case "tool-call":
                    content.push({
                        type: "tool-call",
                        toolCallId: value.toolCallId,
                        toolName: value.toolName,
                        input: value.input,
                        providerExecuted: value.providerExecuted,
                    })
                    break
                case "finish":
                    finishReason = value.finishReason
                    break
                case "error":
                    throw value.error instanceof Error
                        ? value.error
                        : new Error(String(value.error))
                default:
                    break
            }
        }

        return {
            content,
            finishReason,
            usage: emptyUsage(),
            warnings: collectedWarnings,
        }
    }

    return {
        specificationVersion: "v3",
        provider: PROVIDER_ID,
        modelId,
        supportedUrls: {},
        doGenerate,
        doStream,
    }
}
