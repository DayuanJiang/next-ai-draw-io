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
        fetchMock.mockImplementationOnce(async () =>
            Response.json({ enabled: false }),
        )
        const { recordError } = await load()
        await recordError({ kind: "crash", message: "a" })
        expect(posts()).toEqual([])
    })
})

describe("toastUnexpectedError", () => {
    it("records the name of the error behind the toast", async () => {
        const { toastUnexpectedError } = await load()
        // What IndexedDB rejects a save with; the toast's text is the same
        // for every cause. Chrome's full storage has a name and no text.
        const full = new Error("")
        full.name = "QuotaExceededError"
        const lost = new Error("Connection to Indexed Database server lost.")
        lost.name = "UnknownError"
        toastUnexpectedError("Could not save this chat.", "Report", full)
        toastUnexpectedError("Could not save this chat.", "Report", lost)
        await vi.waitFor(() => expect(posts()).toHaveLength(2))
        expect(posts().map((body) => body.message)).toEqual([
            "Could not save this chat.\nQuotaExceededError",
            "Could not save this chat.\nUnknownError: Connection to Indexed Database server lost.",
        ])
        expect(posts()[0].kind).toBe("toast")
    })
})

describe("reloadForMissingChunk", () => {
    const reload = vi.fn()
    // As Turbopack throws it when a script chunk does not load
    const gone = new Error(
        "Failed to load chunk /_next/static/chunks/a.js from module 64893",
    )
    gone.name = "ChunkLoadError"

    beforeEach(() => {
        reload.mockClear()
        sessionStorage.clear()
        vi.stubGlobal("location", { reload })
    })

    it("reloads the page for a script chunk that failed to load", async () => {
        const { reloadForMissingChunk } = await load()
        expect(reloadForMissingChunk(gone)).toBe(true)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it("leaves other errors to the crash screen", async () => {
        const { reloadForMissingChunk } = await load()
        expect(reloadForMissingChunk(new TypeError("boom"))).toBe(false)
        expect(reload).not.toHaveBeenCalled()
    })

    it("does not reload again when the chunk still fails after the reload", async () => {
        vi.useFakeTimers()
        try {
            const { reloadForMissingChunk } = await load()
            reloadForMissingChunk(gone)
            // The page that loaded next: same tab, so the same
            // sessionStorage. Its chunks are asked for twice, and each
            // request hangs until a proxy gives up on it; the error names
            // whichever chunk failed first.
            vi.advanceTimersByTime(4 * 60_000)
            const next = await load()
            const other = new Error(
                "Failed to load chunk /_next/static/chunks/b.js from module 64893",
            )
            other.name = "ChunkLoadError"
            expect(next.reloadForMissingChunk(other)).toBe(false)
            expect(reload).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it("reloads again for a later deployment", async () => {
        vi.useFakeTimers()
        try {
            const { reloadForMissingChunk } = await load()
            reloadForMissingChunk(gone)
            vi.advanceTimersByTime(16 * 60_000)
            expect(reloadForMissingChunk(gone)).toBe(true)
            expect(reload).toHaveBeenCalledTimes(2)
        } finally {
            vi.useRealTimers()
        }
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

describe("recent actions", () => {
    it("go with every report and into the GitHub issue", async () => {
        const { sendErrorReport, githubIssueUrl } = await load()
        const { noteAction } = await import("@/lib/user-actions")
        noteAction("send")
        noteAction("answer failed")
        const report = {
            kind: "chat-error" as const,
            message: "Server error",
            code: "server_error",
            model: "openai/gpt-5.5",
        }
        await sendErrorReport(report)
        expect(posts()[0]).toMatchObject({
            code: "server_error",
            model: "openai/gpt-5.5",
            actions: ["send (0s ago)", "answer failed (0s ago)"],
        })
        const body =
            new URL(githubIssueUrl(report)).searchParams.get("body") ?? ""
        expect(body).toContain("send (0s ago)\nanswer failed (0s ago)")
        expect(body).toContain("Code: server_error")
        expect(body).toContain("Model: openai/gpt-5.5")
    })
})

describe("actions at the time of the error", () => {
    it("are taken when the error is recorded, not when it is sent", async () => {
        const { recordError } = await load()
        const { noteAction } = await import("@/lib/user-actions")
        noteAction("send")
        const pending = recordError({ kind: "chat-error", message: "boom" })
        noteAction("new chat")
        await pending
        expect(posts()[0].actions).toEqual(["send (0s ago)"])
    })

    it("go with a report made later from them", async () => {
        const { sendErrorReport } = await load()
        await sendErrorReport({
            kind: "chat-error",
            message: "boom",
            note: "",
            actions: ["send (4s ago)"],
        })
        expect(posts()[0].actions).toEqual(["send (4s ago)"])
    })
})

describe("isNetworkFailure", () => {
    it("knows the browsers' texts for a fetch that never got through", async () => {
        const { isNetworkFailure } = await load()
        expect(isNetworkFailure("Failed to fetch")).toBe(true)
        expect(
            isNetworkFailure("NetworkError when attempting to fetch resource."),
        ).toBe(true)
        expect(isNetworkFailure("Load failed")).toBe(true)
        expect(isNetworkFailure("Internal server error")).toBe(false)
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
