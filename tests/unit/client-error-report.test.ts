import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Each test loads the module fresh: it remembers per page load whether
// reports are kept and which errors it already sent
async function load() {
    vi.resetModules()
    return import("@/lib/client-error-report")
}

const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(
        init?.method === "POST" ? { logged: true } : { enabled: true },
    ),
)
const posts = () =>
    fetchMock.mock.calls
        .filter(([, init]) => init?.method === "POST")
        .map(([, init]) => JSON.parse(String(init?.body)))

beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

function errorWithStack(stack: string, name = "TypeError") {
    const error = new Error("boom")
    error.name = name
    error.stack = stack
    return error
}

describe("isAppError", () => {
    it("takes errors thrown in the app's own scripts", async () => {
        const { isAppError } = await load()
        const chrome = errorWithStack(
            "TypeError: boom\n    at render (http://localhost:6002/_next/static/chunks/app.js:10:5)",
        )
        const safari = errorWithStack(
            "render@https://next-ai-drawio.jiang.jp/_next/static/chunks/app.js:10:5",
        )
        expect(isAppError(chrome)).toBe(true)
        expect(isAppError(safari)).toBe(true)
    })

    it("leaves out extensions, aborted requests and thrown values", async () => {
        const { isAppError } = await load()
        const extension = errorWithStack(
            "TypeError: boom\n    at x (chrome-extension://abc/content.js:1:2)\n    at y (http://localhost/_next/static/chunks/app.js:1:2)",
        )
        const abort = errorWithStack(
            "AbortError: boom\n    at f (http://localhost/_next/static/chunks/app.js:1:2)",
            "AbortError",
        )
        expect(isAppError(extension)).toBe(false)
        expect(isAppError(abort)).toBe(false)
        expect(isAppError("boom")).toBe(false)
        expect(isAppError(new Error("no stack line"))).toBe(false)
    })
})

describe("recordError", () => {
    it("sends each error once and at most five per page load", async () => {
        const { recordError } = await load()
        await recordError({ kind: "uncaught", message: "a" })
        await recordError({ kind: "uncaught", message: "a" })
        // The same message seen another way (a crash) is not sent again
        await recordError({ kind: "crash", message: "a" })
        for (const message of ["b", "c", "d", "e", "f", "g"]) {
            await recordError({ kind: "uncaught", message })
        }
        expect(posts().map((body) => body.message)).toEqual([
            "a",
            "b",
            "c",
            "d",
            "e",
        ])
        // Asked once whether reports are kept
        expect(
            fetchMock.mock.calls.filter(([, init]) => !init?.method),
        ).toHaveLength(1)
    })

    it("cuts a long message short", async () => {
        const { recordError } = await load()
        await recordError({ kind: "toast", message: "x".repeat(3000) })
        expect(posts()[0].message).toHaveLength(500)
    })

    it("sends nothing when the server keeps no reports", async () => {
        fetchMock.mockImplementation(async () =>
            Response.json({ enabled: false }),
        )
        const { recordError } = await load()
        await recordError({ kind: "crash", message: "a" })
        expect(posts()).toEqual([])
    })
})

describe("githubIssueUrl", () => {
    it("fills in the error, the note and the version", async () => {
        const { githubIssueUrl } = await load()
        const url = new URL(
            githubIssueUrl({
                kind: "crash",
                message: "Cannot read x\nmore",
                note: "opened a file",
            }),
        )
        expect(url.searchParams.get("title")).toBe("Error: Cannot read x")
        const body = url.searchParams.get("body") ?? ""
        expect(body).toContain("opened a file")
        expect(body).toContain("Cannot read x")
        expect(body).toContain("Version:")
    })

    it("stays short enough for GitHub with a long Chinese note", async () => {
        const { githubIssueUrl } = await load()
        const url = githubIssueUrl({
            kind: "toast",
            message: "错误".repeat(500),
            note: "我在画图".repeat(500),
        })
        expect(url.length).toBeLessThan(8000)
    })

    it("shortens the note first and keeps the error and the browser", async () => {
        const { githubIssueUrl } = await load()
        const body =
            new URL(
                githubIssueUrl({
                    kind: "chat-error",
                    message: "Server error\nsecond line",
                    note: "界".repeat(2000),
                }),
            ).searchParams.get("body") ?? ""
        expect(body).toContain("Server error\nsecond line")
        expect(body).toContain("Version:")
        expect(body).toContain("Browser:")
    })

    it("never cuts an emoji in half", async () => {
        const { githubIssueUrl } = await load()
        expect(() =>
            githubIssueUrl({
                kind: "crash",
                message: "boom",
                note: "😀".repeat(800),
            }),
        ).not.toThrow()
    })
})

describe("sendErrorReport", () => {
    it("sends the stack's call lines without the message line", async () => {
        const { sendErrorReport } = await load()
        await sendErrorReport({
            kind: "uncaught",
            message: "short",
            stack: "Error: PRIVATE long message\n    at f (http://localhost/_next/static/chunks/a.js:1:2)",
        })
        expect(posts()[0].stack).toBe(
            "    at f (http://localhost/_next/static/chunks/a.js:1:2)",
        )
    })

    it("drops message lines that only look like call lines", async () => {
        const { sendErrorReport } = await load()
        await sendErrorReport({
            kind: "uncaught",
            message: "short",
            stack: "Error: x\nat PRIVATE text\n    at f (http://localhost/_next/a.js:1:2)\ng@http://localhost/_next/b.js:3:4",
        })
        expect(posts()[0].stack).toBe(
            "    at f (http://localhost/_next/a.js:1:2)\ng@http://localhost/_next/b.js:3:4",
        )
    })
})
