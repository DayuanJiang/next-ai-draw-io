// @vitest-environment node
/**
 * How often the request tells the model which language to answer in.
 *
 * GPT-6 Luna (model ids that contain gpt-6-luna): once, in the system
 * prompt. With a second sentence about it at the end of the system message
 * it answers an English request that quotes its labels in Spanish or
 * Russian about ten times as often (24 of 228 first replies, 4 of 432
 * without it).
 *
 * Every other model: twice, the second time in the last sentence of the
 * system message. Each user message ends with canvas notes in English, and
 * without that sentence DeepSeek V3.2 answers Japanese and Korean requests
 * to edit a diagram with English labels in English about three times as
 * often (217 of 400 replies, 74 of 400 with it).
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async () => false,
}))

import { POST as chat } from "@/app/api/chat/route"

const ENV = ["AI_PROVIDER", "AI_MODEL", "OPENAI_API_KEY", "ACCESS_CODE_LIST"]
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    for (const k of ENV) delete process.env[k]
    process.env.AI_PROVIDER = "openai"
    process.env.OPENAI_API_KEY = "test-key"
})

afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
})

/** The system message of a request that runs on this model */
async function systemMessageFor(model: string): Promise<string> {
    process.env.AI_MODEL = model
    let sent: any
    vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
            sent = JSON.parse(String(init?.body ?? "{}"))
            return new Response('{"error":{"message":"stop here"}}', {
                status: 400,
                headers: { "Content-Type": "application/json" },
            })
        }),
    )
    const res = await chat(
        new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [
                    {
                        id: "u1",
                        role: "user",
                        parts: [{ type: "text", text: "Draw a box" }],
                        metadata: { diagram: { xml: "", pageId: null } },
                    },
                ],
                xml: "",
                customSystemMessage: "Use blue boxes.",
            }),
        }),
    )
    await res.text()
    const [system] = (sent.messages ?? sent.input).filter(
        (m: { role: string }) => m.role !== "user",
    )
    return system.content
}

const REPLY_LANGUAGE = /\b(?:respond|reply)\b[^.]*?\blanguage\b/gi

it("names the reply language once for GPT-6 Luna", async () => {
    for (const model of ["global.openai.gpt-6-luna", "openai/GPT-6-Luna"]) {
        const system = await systemMessageFor(model)
        expect([model, system.match(REPLY_LANGUAGE)]).toEqual([
            model,
            ["respond in the same language"],
        ])
        expect(system.endsWith("## Custom Instructions\nUse blue boxes.")).toBe(
            true,
        )
    }
})

it("names it a second time, in the last sentence, for every other model", async () => {
    for (const model of [
        "deepseek.v3.2",
        "global.anthropic.claude-haiku-5-5",
        "gpt-6",
    ]) {
        const system = await systemMessageFor(model)
        expect([model, system.match(REPLY_LANGUAGE)]).toEqual([
            model,
            ["respond in the same language", "reply in the language"],
        ])
        expect(
            system.endsWith(
                "## Custom Instructions\nUse blue boxes.\n\nWrite your reply in the language of the user's own words in their latest message, not in the language of the diagram, attached files or the canvas notes in square brackets.",
            ),
        ).toBe(true)
    }
})
