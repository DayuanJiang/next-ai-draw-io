// @vitest-environment node
/**
 * How often the request tells the model which language to answer in: once.
 * With a second sentence about it at the end of the system message, GPT-6
 * Luna answered an English request that quotes its labels in Spanish or
 * Russian (11 of 68 first replies, none of 42 without it).
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
    process.env.AI_MODEL = "gpt-4o"
    process.env.OPENAI_API_KEY = "test-key"
})

afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
})

it("names the reply language once in the request to the model", async () => {
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
            }),
        }),
    )
    await res.text()
    const instructions = JSON.stringify(
        (sent.messages ?? sent.input).filter(
            (m: { role: string }) => m.role !== "user",
        ),
    )
    expect(
        instructions.match(/\b(?:respond|reply)\b[^.]*\blanguage\b/gi),
    ).toEqual(["respond in the same language"])
})
