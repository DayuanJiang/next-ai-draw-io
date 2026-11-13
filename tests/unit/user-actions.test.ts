import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { STORAGE_KEYS } from "@/lib/storage"

// Each test loads the modules fresh: they keep the actions of one page load
async function load() {
    vi.resetModules()
    return {
        ...(await import("@/lib/user-actions")),
        ...(await import("@/lib/usage-log")),
    }
}

// Whether the server keeps a usage log, as /api/config says
let usageLog = true
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(init?.method === "POST" ? { logged: true } : { usageLog }),
)
const posts = () =>
    fetchMock.mock.calls
        .filter(([, init]) => init?.method === "POST")
        .map(([url, init]) => ({ url, ...JSON.parse(String(init?.body)) }))
const names = (post: { actions: { name: string }[] }) =>
    post.actions.map((action) => action.name)
// The server's answer about the usage log has arrived
const configAnswered = () => new Promise((resolve) => setTimeout(resolve))
const leavePage = () => window.dispatchEvent(new Event("pagehide"))

beforeEach(() => {
    usageLog = true
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
    localStorage.setItem(STORAGE_KEYS.sessionId, "chat-1")
})

afterEach(async () => {
    // The module of this test still listens on the window: it sends what
    // it holds now, so nothing of it reaches the next test
    await configAnswered()
    leavePage()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
})

describe("recent actions", () => {
    it("keeps the last ten, oldest first, with how long ago", async () => {
        const { noteAction, recentActions } = await load()
        for (let i = 1; i <= 12; i++) noteAction(`action ${i}`)
        const actions = recentActions(Date.now() + 5000)
        expect(actions).toHaveLength(10)
        expect(actions[0]).toBe("action 3 (5s ago)")
        expect(actions[9]).toBe("action 12 (5s ago)")
    })

    it("notes an action that repeats once per run", async () => {
        const { noteAction, noteActionOnce, recentActions } = await load()
        noteActionOnce("edit by hand")
        noteActionOnce("edit by hand")
        noteAction("send")
        noteActionOnce("edit by hand")
        expect(recentActions()).toEqual([
            "edit by hand (0s ago)",
            "send (0s ago)",
            "edit by hand (0s ago)",
        ])
    })
})

describe("usage log", () => {
    it("sends the actions when the page is left, in the chat's session", async () => {
        const { noteAction, startUsageLog } = await load()
        startUsageLog()
        await configAnswered()
        noteAction("send")
        expect(posts()).toEqual([])
        leavePage()
        expect(posts()).toHaveLength(1)
        expect(posts()[0]).toMatchObject({
            url: "/api/log-actions",
            sessionId: "chat-1",
            page: "/",
        })
        expect(names(posts()[0])).toEqual(["page open", "send"])
        expect(posts()[0].actions[0].ago).toBeGreaterThanOrEqual(0)
        // Nothing new since: nothing more to send
        leavePage()
        expect(posts()).toHaveLength(1)
    })

    it("sends them when the page is hidden", async () => {
        const { startUsageLog } = await load()
        startUsageLog()
        await configAnswered()
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
        document.dispatchEvent(new Event("visibilitychange"))
        expect(posts()).toHaveLength(1)
    })

    it("sends nothing to a server that keeps no usage log", async () => {
        usageLog = false
        const { noteAction, startUsageLog } = await load()
        startUsageLog()
        await configAnswered()
        for (let i = 0; i < 40; i++) noteAction("send")
        leavePage()
        expect(posts()).toEqual([])
    })

    it("sends nothing before the editor has opened", async () => {
        const { noteAction } = await load()
        for (let i = 0; i < 40; i++) noteAction("send")
        leavePage()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("notes the page as opened once per page load", async () => {
        const { startUsageLog, recentActions } = await load()
        startUsageLog()
        startUsageLog()
        expect(recentActions()).toEqual(["page open (0s ago)"])
    })

    it("sends every thirty actions without waiting for the page to go", async () => {
        const { noteAction, startUsageLog } = await load()
        startUsageLog()
        await configAnswered()
        for (let i = 0; i < 29; i++) noteAction("send")
        expect(posts()).toHaveLength(1)
        expect(posts()[0].actions).toHaveLength(30)
    })

    it("sends a chat's actions in its own session when another chat opens", async () => {
        const { noteAction, startUsageLog } = await load()
        startUsageLog()
        await configAnswered()
        noteAction("send")
        // The page stores the new chat's session after the action
        noteAction("new chat")
        localStorage.setItem(STORAGE_KEYS.sessionId, "chat-2")
        noteAction("send")
        leavePage()
        expect(posts().map((post) => [post.sessionId, names(post)])).toEqual([
            ["chat-1", ["page open", "send", "new chat"]],
            ["chat-2", ["send"]],
        ])
    })
})
