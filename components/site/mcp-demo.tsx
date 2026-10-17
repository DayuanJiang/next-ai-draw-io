"use client"

import { RotateCcw } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { SERVERLESS_SVG, withOwnId } from "./serverless-diagram"

/*
 * A scripted demo of the MCP server for the docs: in a terminal, the user asks
 * Claude Code for a diagram, the agent reads the project and calls the drawio
 * tools; the browser preview next to it opens and the diagram appears shape by
 * shape. Nothing calls an AI.
 */

export type McpDemoTexts = {
    prompt: string
    /** What the agent says before reading the project */
    intro: string
    /** Its last message */
    done: string
    replay: string
}

type Line = { kind: "prompt" | "say" | "tool" | "result"; text: string }

const SHAPES = ["cloud", "users", "apigw", "cognito", "lambda", "dynamo", "s3"]
const EDGES = ["e1", "e2", "e3", "e4", "e5"]
// Cells of the AI's later change, which this demo does not show
const UNUSED = ["cache", "e6"]
const PREVIEW_URL = "localhost:6002/shell/?mcp=mcp-mvb2k1"

class Stopped extends Error {}

export function McpDemo({ texts }: { texts: McpDemoTexts }) {
    const frame = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLDivElement>(null)
    const runId = useRef(0)
    const markup = withOwnId(
        SERVERLESS_SVG,
        useId().replace(/[^a-zA-Z0-9]/g, ""),
    )
    const [typed, setTyped] = useState("")
    const [lines, setLines] = useState<Line[]>([])
    const [working, setWorking] = useState(false)
    const [preview, setPreview] = useState(false)
    const [finished, setFinished] = useState(false)

    const cell = useCallback(
        (id: string) =>
            canvas.current?.querySelector<SVGGElement>(
                `[data-cell-id="${id}"]`,
            ) ?? null,
        [],
    )
    const line = useCallback(
        (id: string) => cell(id)?.querySelector("g")?.querySelector("path"),
        [cell],
    )

    const play = useCallback(async () => {
        const id = ++runId.current
        const alive = () => runId.current === id
        const reduced = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches
        const wait = (ms: number) =>
            reduced
                ? Promise.resolve()
                : new Promise<void>((resolve, reject) =>
                      setTimeout(
                          () => (alive() ? resolve() : reject(new Stopped())),
                          ms,
                      ),
                  )
        const add = async (next: Line, ms = 380) => {
            setLines((all) => [...all, next])
            await wait(ms)
        }

        // Start from an empty terminal and a closed preview
        setTyped("")
        setLines([])
        setWorking(false)
        setPreview(false)
        setFinished(false)
        for (const c of [...SHAPES, ...EDGES, ...UNUSED]) {
            cell(c)?.classList.remove("on")
        }
        for (const e of EDGES) {
            const path = line(e)
            if (!path) continue
            const length = Math.ceil(path.getTotalLength())
            path.style.strokeDasharray = `${length}`
            path.style.strokeDashoffset = `${length}`
        }

        try {
            await wait(400)
            if (reduced) setTyped(texts.prompt)
            else {
                for (const ch of texts.prompt) {
                    setTyped((s) => s + ch)
                    await wait(/[\u2e80-\uffef]/.test(ch) ? 70 : 34)
                }
            }
            await wait(350)
            setTyped("")
            await add({ kind: "prompt", text: texts.prompt }, 450)
            setWorking(true)
            await add({ kind: "say", text: texts.intro }, 500)
            await add({ kind: "tool", text: "Read(template.yaml)" })
            await add({ kind: "tool", text: "Read(src/handlers/api.ts)" }, 450)
            await add(
                { kind: "tool", text: "drawio - start_session (MCP)" },
                250,
            )
            setPreview(true)
            await add({
                kind: "result",
                text: "Session started successfully!",
            })
            await add({
                kind: "tool",
                text: "drawio - create_new_diagram (MCP)",
            })
            // The diagram appears in the preview as the call runs
            for (const s of SHAPES) {
                cell(s)?.classList.add("on")
                await wait(170)
            }
            for (const e of EDGES) {
                cell(e)?.classList.add("on")
                const path = line(e)
                if (path) path.style.strokeDashoffset = "0"
                await wait(220)
            }
            await add({
                kind: "result",
                text: "Diagram content set successfully!",
            })
            setWorking(false)
            await add({ kind: "say", text: texts.done }, 0)
            setFinished(true)
        } catch (error) {
            if (!(error instanceof Stopped)) throw error
        }
    }, [cell, line, texts])

    // Starts when it scrolls into view
    useEffect(() => {
        const seen = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return
                seen.disconnect()
                play()
            },
            { threshold: 0.4 },
        )
        if (frame.current) seen.observe(frame.current)
        return () => {
            seen.disconnect()
            runId.current++
        }
    }, [play])

    return (
        <div
            ref={frame}
            className="relative grid grid-rows-[250px_230px] gap-3 md:h-[400px] md:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)] md:grid-rows-1"
            data-demo-mcp
        >
            {/* The terminal */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-[#14181d] text-[#e6e6e6] shadow-[0_24px_60px_-36px_rgba(20,24,29,0.6)]">
                <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
                    <span className="size-2.5 rounded-full bg-white/20" />
                    <span className="size-2.5 rounded-full bg-white/20" />
                    <span className="size-2.5 rounded-full bg-white/20" />
                    <span className="ml-2 font-mono text-[11.5px] text-white/50">
                        claude
                    </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden p-3 font-mono text-[12px] leading-relaxed [font-variant-ligatures:none] [mask-image:linear-gradient(to_bottom,transparent,#000_40px)]">
                    {lines.map((l, i) =>
                        l.kind === "prompt" ? (
                            <p
                                key={i}
                                className="lp-msg rounded-md bg-white/[0.06] px-2 py-1 text-white"
                            >
                                <span className="text-white/40">&gt; </span>
                                {l.text}
                            </p>
                        ) : l.kind === "result" ? (
                            <p key={i} className="lp-msg pl-5 text-white/55">
                                ⎿ {l.text}
                            </p>
                        ) : (
                            <p
                                key={i}
                                className={`lp-msg flex gap-2 ${l.kind === "tool" ? "text-[#9fd3a8]" : ""}`}
                            >
                                <span
                                    className={
                                        l.kind === "tool"
                                            ? "text-[#9fd3a8]"
                                            : "text-white/70"
                                    }
                                >
                                    ●
                                </span>
                                <span className="min-w-0">{l.text}</span>
                            </p>
                        ),
                    )}
                    {working && (
                        <p className="text-[#f5b13d]">
                            <span className="lp-caret" />
                        </p>
                    )}
                </div>
                <div className="border-t border-white/10 px-3 py-2.5 font-mono text-[12px]">
                    <span className="text-white/40">&gt; </span>
                    {typed}
                    <span className="lp-caret" />
                </div>
            </div>

            {/* The browser with the preview */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_60px_-36px_rgba(20,24,29,0.6)]">
                <div className="flex items-center gap-2 border-b border-border bg-canvas px-3 py-2">
                    <span className="min-w-0 flex-1 truncate rounded-md bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                        {preview ? PREVIEW_URL : ""}
                    </span>
                </div>
                <div
                    className={`lp-grid relative flex flex-1 items-center justify-center px-2 transition-opacity duration-300 ${preview ? "opacity-100" : "opacity-0"}`}
                >
                    <div ref={canvas} className="lp-demo w-full">
                        <div dangerouslySetInnerHTML={{ __html: markup }} />
                    </div>
                </div>
            </div>

            {finished && (
                <button
                    type="button"
                    onClick={() => play()}
                    className="absolute right-2.5 bottom-2.5 z-[3] flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px] font-medium shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <RotateCcw className="size-3.5" />
                    {texts.replay}
                </button>
            )}
        </div>
    )
}
