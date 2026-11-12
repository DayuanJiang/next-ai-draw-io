// @vitest-environment node
/**
 * What the request tells the model about the language to answer in.
 *
 * In the system message. GPT-6 Luna (model ids that contain gpt-6-luna):
 * once, in the system prompt. With a second sentence about it at the end of
 * the system message it answers an English request that quotes its labels in
 * Spanish or Russian about ten times as often (24 of 228 first replies, 4 of
 * 432 without it). Every other model: twice, the second time in the last
 * sentence of the system message. Each user message ends with canvas notes
 * in English, and without that sentence DeepSeek V3.2 answers Japanese and
 * Korean requests to edit a diagram with English labels in English about
 * three times as often (217 of 400 replies, 74 of 400 with it).
 *
 * After a user message: a note that names what the user wrote it in, always
 * when that is not Latin script, and for Latin script once the chat has had
 * another one. A chat in Latin script alone gets no such note.
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

/** The messages the provider gets for a chat of these user texts on this model */
async function sentMessages(model: string, texts: string[]): Promise<any[]> {
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
                // Each user message but the last has its answer
                messages: texts.flatMap((text, i) => [
                    {
                        id: `u${i}`,
                        role: "user",
                        parts: [{ type: "text", text }],
                        metadata: { diagram: { xml: "", pageId: null } },
                    },
                    ...(i < texts.length - 1
                        ? [
                              {
                                  id: `a${i}`,
                                  role: "assistant",
                                  parts: [{ type: "text", text: "Done." }],
                              },
                          ]
                        : []),
                ]),
                xml: "",
                customSystemMessage: "Use blue boxes.",
            }),
        }),
    )
    await res.text()
    return sent.messages ?? sent.input
}

/** The system message of a request that runs on this model */
async function systemMessageFor(model: string): Promise<string> {
    const [system] = (await sentMessages(model, ["Draw a box"])).filter(
        (m: { role: string }) => m.role !== "user",
    )
    return system.content
}

/** What the model reads as each user message of a chat of these texts */
async function userMessages(...texts: string[]): Promise<string[]> {
    return (await sentMessages("gpt-6", texts))
        .filter((m: { role: string }) => m.role === "user")
        .map(({ content }: { content: string | { text?: string }[] }) =>
            typeof content === "string"
                ? content
                : content.map((part) => part.text ?? "").join(""),
        )
}

/** What the note after each user message says the message is written in */
async function writtenIn(...texts: string[]) {
    return (await userMessages(...texts)).map(
        (text) => text.match(/\[The user wrote this message in (.*?)\.\]/)?.[1],
    )
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

it("names what a message is written in when that is not Latin script", async () => {
    expect(await userMessages("Check password を赤にして")).toEqual([
        "Check password を赤にして\n\n[The user wrote this message in Japanese.]\n\n[Canvas: empty when this message was sent.]",
    ])
    for (const [text, script] of [
        ["Check password를 빨간색으로 바꿔줘", "Korean"],
        ["把 Check password 改成红色", "Chinese"],
        ["「Check password」を赤にして", "Japanese"],
        ["Сделай блок Check password красным", "Cyrillic script"],
        ["اجعل مربع Check password أحمر", "Arabic script"],
    ]) {
        expect([text, await writtenIn(text)]).toEqual([text, [script]])
    }
})

it("says nothing about a chat in Latin script", async () => {
    expect(
        await userMessages(
            "Draw a flowchart of a coffee order",
            "Dessine un organigramme à trois niveaux",
        ),
    ).toEqual([
        "Draw a flowchart of a coffee order\n\n[Canvas: empty when this message was sent.]",
        "Dessine un organigramme à trois niveaux\n\n[Canvas: empty when this message was sent.]",
    ])
})

it("goes by the user's own words, not by quoted labels or attached files", async () => {
    expect(
        await writtenIn(
            "Rename the box '登录' to 'Login'",
            "Draw this file as a flowchart\n\n[File: 流程.txt]\n用户登录，然后进入首页",
        ),
    ).toEqual([undefined, undefined])
})

it("names Latin script once the chat has had another script", async () => {
    expect(
        await writtenIn(
            "Draw a login flow",
            "把判断框改成橙色",
            // Its apostrophes are not quotes
            "Don't move it, it's fine",
            // Too short to tell a language
            "OK",
            "タイトルを消して",
            "Make the title bold again",
        ),
    ).toEqual([
        undefined,
        "Chinese",
        "Latin script, not in Chinese",
        undefined,
        "Japanese",
        "Latin script, not in Japanese",
    ])
})
