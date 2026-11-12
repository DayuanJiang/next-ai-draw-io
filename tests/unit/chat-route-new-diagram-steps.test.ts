// @vitest-environment node
/**
 * What the model is told to write before it draws a new diagram: a short
 * plan of the layout, or nothing for Claude Haiku 5.5. After a sentence of
 * its own, that model writes the diagram's XML into the reply and often
 * never calls the tool.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async () => false,
}))

import { POST as chat } from "@/app/api/chat/route"

const ENV = [
    "AI_PROVIDER",
    "AI_MODEL",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "ACCESS_CODE_LIST",
]
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    for (const k of ENV) delete process.env[k]
    process.env.OPENAI_API_KEY = "test-key"
    process.env.ANTHROPIC_API_KEY = "test-key"
})

afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
})

/** The instructions the provider receives for a first message */
async function instructionsFor(provider: string, model: string) {
    process.env.AI_PROVIDER = provider
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
            }),
        }),
    )
    await res.text()
    // Anthropic takes them in a field of their own
    return JSON.stringify([
        sent.system,
        (sent.messages ?? sent.input).filter(
            (m: { role: string }) => m.role !== "user",
        ),
    ])
}

const PLAN = "briefly describe your plan"
const AT_ONCE = "call display_diagram right away, with no text before the call"

it.each([
    ["openai", "gpt-4o"],
    ["anthropic", "claude-sonnet-5-5"],
])(
    "asks %s %s for a short plan before the drawing",
    async (provider, model) => {
        const instructions = await instructionsFor(provider, model)
        expect(instructions).toContain(PLAN)
        expect(instructions).not.toContain(AT_ONCE)
    },
)

it("asks Claude Haiku 5.5 to draw at once", async () => {
    const instructions = await instructionsFor("anthropic", "claude-haiku-5-5")
    expect(instructions).toContain(AT_ONCE)
    expect(instructions).not.toContain(PLAN)
})
