// @vitest-environment node
/**
 * Where the diagram goes in the request to the model: with the user
 * messages, never in the system message, and the same text for the same
 * message in every request, so the history stays cacheable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async () => false,
}))

import { POST as chat } from "@/app/api/chat/route"
import { diagramForMessage } from "@/lib/diagram-context"

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

const page = (cells: string) =>
    `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
const BOXES = page(
    '<mxCell id="2" value="Kickoff42" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>',
)
const EDITED = page(
    '<mxCell id="2" value="Moved by hand" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="300" y="40" width="120" height="60" as="geometry"/></mxCell>',
)

const userMessage = (id: string, text: string, metadata?: unknown) => ({
    id,
    role: "user",
    parts: [{ type: "text", text }],
    ...(metadata !== undefined && { metadata }),
})
const drawing = (id: string) => ({
    id,
    role: "assistant",
    parts: [
        {
            type: "tool-display_diagram",
            toolCallId: `call-${id}`,
            state: "output-available",
            input: {
                xml: '<mxCell id="2" value="Start" x="40" y="40" w="120" h="60"/>',
            },
            output: "Successfully displayed the diagram.",
        },
    ],
})

/** The messages the provider receives for one chat request */
async function promptFor(body: Record<string, unknown>) {
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
            body: JSON.stringify(body),
        }),
    )
    await res.text()
    const items: any[] = sent?.messages ?? sent?.input ?? []
    const textOf = (item: any): string =>
        typeof item.content === "string"
            ? item.content
            : (item.content ?? []).map((c: any) => c.text ?? "").join("\n")
    return items.map((item) => ({
        role: item.role,
        text: textOf(item),
        raw: item,
    }))
}

describe("the diagram in the request to the model", () => {
    it("keeps the system message free of the diagram", async () => {
        const prompt = await promptFor({
            messages: [
                userMessage("u1", "Draw a box", {
                    diagram: { xml: BOXES, pageId: null },
                }),
            ],
            xml: BOXES,
        })
        const system = prompt.filter(
            (m) => m.role === "system" || m.role === "developer",
        )
        expect(system).toHaveLength(1)
        expect(system[0].text).not.toContain("Moved by hand")
        expect(system[0].text).not.toContain('value="Kickoff42"')
        const last = prompt[prompt.length - 1]
        expect(last.role).toBe("user")
        expect(last.text).toContain("[Canvas when this message was sent")
        expect(last.text).toContain('value="Kickoff42"')
    })

    it("sends a short note when the canvas is unchanged", async () => {
        const prompt = await promptFor({
            messages: [
                userMessage("u1", "Draw a box", {
                    diagram: { xml: "", pageId: null },
                }),
                drawing("a1"),
                userMessage("u2", "Make it blue", {
                    diagram: { unchanged: true },
                }),
            ],
            xml: BOXES,
        })
        const users = prompt.filter((m) => m.role === "user")
        expect(users[0].text).toContain(
            "[Canvas: empty when this message was sent.]",
        )
        expect(users[1].text).toContain("[Canvas: unchanged")
        expect(users[1].text).not.toContain('value="Kickoff42"')
    })

    it("puts a canvas sent earlier back into its own message", async () => {
        const prompt = await promptFor({
            messages: [
                userMessage("u1", "Draw a box", {
                    diagram: { xml: "", pageId: null },
                }),
                drawing("a1"),
                userMessage("u2", "I moved it, add a label", {
                    diagram: { xml: EDITED, pageId: null },
                }),
                {
                    id: "a2",
                    role: "assistant",
                    parts: [{ type: "text", text: "Done." }],
                },
                userMessage("u3", "Thanks", { diagram: { unchanged: true } }),
            ],
            xml: EDITED,
        })
        const users = prompt.filter((m) => m.role === "user")
        expect(users[1].text).toContain('value="Moved by hand"')
        expect(users[2].text).toContain("[Canvas: unchanged")
    })

    it("gives the same history in consecutive requests", async () => {
        const turn = [
            userMessage("u1", "Draw a box", {
                diagram: { xml: "", pageId: null },
            }),
            drawing("a1"),
            userMessage("u2", "I moved it", {
                diagram: { xml: EDITED, pageId: null },
            }),
            {
                id: "a2",
                role: "assistant",
                parts: [{ type: "text", text: "OK." }],
            },
        ]
        const first = await promptFor({
            messages: [
                ...turn,
                userMessage("u3", "Next", { diagram: { unchanged: true } }),
            ],
            xml: EDITED,
        })
        const second = await promptFor({
            messages: [
                ...turn,
                userMessage("u3", "Next", { diagram: { unchanged: true } }),
                {
                    id: "a3",
                    role: "assistant",
                    parts: [{ type: "text", text: "Sure." }],
                },
                userMessage("u4", "And more", { diagram: { unchanged: true } }),
            ],
            // The request's own canvas plays no part in earlier messages
            xml: BOXES,
        })
        // The whole first request, its newest message included
        expect(
            JSON.stringify(second.slice(0, first.length).map((m) => m.raw)),
        ).toBe(JSON.stringify(first.map((m) => m.raw)))
    })

    it("starts each note on a new paragraph, also where text parts are joined", async () => {
        const prompt = await promptFor({
            messages: [
                userMessage("u1", "Make it blue", {
                    diagram: { unchanged: true },
                    selectedCells: [{ id: "2", label: "Kickoff42" }],
                }),
            ],
            xml: BOXES,
        })
        const newest = prompt[prompt.length - 1]
        expect(newest.text).toMatch(/Make it blue\n\n\n\[Canvas: unchanged/)
        expect(newest.text).toMatch(/\]\n\n\n\S/)
    })

    it("keeps each note with its own message next to an empty one", async () => {
        const prompt = await promptFor({
            messages: [
                { id: "u0", role: "user", parts: [{ type: "text", text: "" }] },
                userMessage("u1", "Draw a box", {
                    diagram: { xml: EDITED, pageId: null },
                }),
                drawing("a1"),
                userMessage("u2", "Make it blue", {
                    diagram: { unchanged: true },
                }),
            ],
            xml: BOXES,
        })
        const users = prompt.filter((m) => m.role === "user")
        expect(users.at(-2)?.text).toContain('value="Moved by hand"')
        expect(users.at(-1)?.text).toContain("[Canvas: unchanged")
    })

    it("falls back to the canvas from the request for an older client", async () => {
        const prompt = await promptFor({
            messages: [drawing("a0"), userMessage("u1", "Make it blue")].slice(
                1,
            ),
            xml: BOXES,
        })
        const last = prompt[prompt.length - 1]
        expect(last.text).toContain('value="Kickoff42"')
    })

    it("keeps the selected shapes with the message they were sent with", async () => {
        const selected = [{ id: "2", label: "Kickoff42" }]
        const prompt = await promptFor({
            messages: [
                userMessage("u1", "Draw a box", {
                    diagram: { xml: "", pageId: null },
                }),
                drawing("a1"),
                userMessage("u2", "Make it blue", {
                    diagram: { unchanged: true },
                    selectedCells: selected,
                }),
                {
                    id: "a2",
                    role: "assistant",
                    parts: [{ type: "text", text: "Done." }],
                },
                userMessage("u3", "Thanks", { diagram: { unchanged: true } }),
            ],
            xml: BOXES,
        })
        const users = prompt.filter((m) => m.role === "user")
        expect(users[0].text).not.toContain("selected these shapes")
        expect(users[1].text).toContain('id="2" (Kickoff42)')
        expect(users[2].text).not.toContain("selected these shapes")

        // An older client sends the newest selection in the body only
        const older = await promptFor({
            messages: [userMessage("u1", "Make it blue")],
            xml: BOXES,
            selectedCells: selected,
        })
        expect(older[older.length - 1].text).toContain('id="2" (Kickoff42)')
    })

    it("shows pictures as references in every message", async () => {
        const data = "Q".repeat(25000)
        const withImage = page(
            `<mxCell id="9" value="Pic" style="shape=image;image=data:image/png,${data};" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="80" as="geometry"/></mxCell>`,
        )
        // As the client keeps it: the picture as its reference
        const diagram = diagramForMessage({
            history: [],
            pageXml: withImage,
            pageId: null,
            states: new Map(),
        })
        const messages = [
            userMessage("u1", "Here is my picture", { diagram }),
            {
                id: "a1",
                role: "assistant",
                parts: [{ type: "text", text: "Nice." }],
            },
            userMessage("u2", "Again", { diagram }),
        ]
        const users = (await promptFor({ messages, xml: withImage })).filter(
            (m) => m.role === "user",
        )
        for (const user of users) {
            expect(user.text).toContain("data:image/png,embedded-image-")
            expect(user.text).toContain("Keep a reference exactly as written")
            expect(user.text).not.toContain(data)
        }
    })

    it("sends attached documents and images with their own turn only", async () => {
        const withDocs = {
            ...userMessage("u1", "", { diagram: { xml: "", pageId: null } }),
            parts: [
                {
                    type: "text",
                    text: "Draw this\n\n[PDF: spec.pdf]\nSPEC-BODY-TEXT\n\n[URL: https://example.test/a]\nTitle: A\n\nPAGE-BODY-TEXT\n\n[File: notes [v2].txt]\nNAMED-BODY-TEXT",
                },
                {
                    type: "file",
                    mediaType: "image/png",
                    url: "data:image/png;base64,iVBORw0KGgo=",
                },
            ],
        }
        const firstUser = async (messages: unknown[]) => {
            const prompt = await promptFor({ messages, xml: BOXES })
            const user = prompt.find((m) => m.role === "user")
            return { text: user?.text ?? "", raw: JSON.stringify(user?.raw) }
        }

        // Its turn, the requests after a tool result included
        for (const messages of [[withDocs], [withDocs, drawing("a1")]]) {
            const first = await firstUser(messages)
            expect(first.text).toContain("SPEC-BODY-TEXT")
            expect(first.text).toContain("PAGE-BODY-TEXT")
            expect(first.raw).toContain("iVBORw0KGgo")
        }

        // After the next user message: the names stay, the text and the
        // image go
        const { text: first, raw } = await firstUser([
            withDocs,
            drawing("a1"),
            userMessage("u2", "Make it blue", { diagram: { unchanged: true } }),
        ])
        expect(raw).not.toContain("iVBORw0KGgo")
        expect(first).toContain("Draw this")
        expect(first).toContain("[PDF: spec.pdf]")
        expect(first).not.toContain("NAMED-BODY-TEXT")
        expect(first).toContain("[File: notes [v2].txt]")
        expect(first).toContain("[URL: https://example.test/a]")
        expect(first).not.toContain("SPEC-BODY-TEXT")
        expect(first).not.toContain("PAGE-BODY-TEXT")
    })
})
