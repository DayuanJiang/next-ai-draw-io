import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const stored = new Map<string, any>()
// Each write waits for the test to let it finish
let pendingWrites: (() => void)[] = []
// Reads wait for this
let readGate: Promise<void> = Promise.resolve()
// Titles of the chats the limit deletes when a save creates a session
let deletedByLimit: string[] = []
// What storage rejected the latest save with
const storageError = new Error("The quota has been exceeded.")
// A rename finds the chat, and storage refuses the renamed copy
let renameWriteFails = false

vi.mock("@/hooks/use-dictionary", () => ({
    useDictionary: () => ({
        errors: { sessionSaveFailed: "Not saved" },
        report: { button: "Report" },
        sessionHistory: { limitDeleted: "Keeps {max}, deleted {title}" },
        workspace: { untitled: "Untitled diagram" },
    }),
}))

vi.mock("@/lib/client-error-report", () => ({
    toastUnexpectedError: vi.fn(),
}))

vi.mock("@/lib/session-storage", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/session-storage")>()
    return {
        createEmptySession: actual.createEmptySession,
        extractTitle: actual.extractTitle,
        isIndexedDBAvailable: () => true,
        lastSaveError: () => storageError,
        readSessionCount: async () => stored.size,
        MAX_SESSIONS: actual.MAX_SESSIONS,
        enforceSessionLimit: async () => deletedByLimit,
        getSession: async (id: string) => {
            await readGate
            return stored.get(id) ?? null
        },
        deleteSession: async (id: string) => {
            stored.delete(id)
        },
        getAllSessionMetadata: async () =>
            [...stored.values()]
                .map((s) => ({
                    id: s.id,
                    title: s.title,
                    updatedAt: s.updatedAt,
                }))
                .sort((a, b) => b.updatedAt - a.updatedAt),
        renameSession: async (id: string, title: string) => {
            const session = stored.get(id)
            if (!session) return null
            if (renameWriteFails) return false
            const updated = { ...session, title, updatedAt: Date.now() }
            stored.set(id, updated)
            return updated
        },
        saveSession: vi.fn(
            (session: any) =>
                new Promise<boolean>((resolve) => {
                    pendingWrites.push(() => {
                        stored.set(session.id, session)
                        resolve(true)
                    })
                }),
        ),
    }
})

import { toast } from "sonner"
import { useSessionManager } from "@/hooks/use-session-manager"
import { toastUnexpectedError } from "@/lib/client-error-report"
import { saveSession } from "@/lib/session-storage"

const data = {
    messages: [
        {
            id: "m1",
            role: "user" as const,
            parts: [{ type: "text", text: "Draw a cat" }],
        },
    ],
    xmlSnapshots: [] as [number, string][],
    diagramXml: "",
}

// Let every write waiting now (and those it leads to) finish
async function finishWrites() {
    for (let i = 0; i < 10; i++) {
        await act(async () => {
            const writes = pendingWrites
            pendingWrites = []
            for (const finish of writes) finish()
            await new Promise((r) => setTimeout(r, 0))
        })
    }
}

async function setup() {
    const hook = renderHook(() => useSessionManager())
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    return hook
}

describe("saving the chat on screen", () => {
    beforeEach(() => {
        stored.clear()
        pendingWrites = []
    })

    it("creates one session when two saves of a new chat overlap", async () => {
        const { result } = await setup()
        let saves!: Promise<boolean[]>
        act(() => {
            saves = Promise.all([
                result.current.saveCurrentSession(data),
                result.current.saveCurrentSession(data),
            ])
        })
        await finishWrites()
        expect(await saves).toEqual([true, true])
        expect(stored.size).toBe(1)
        expect(result.current.currentSessionId).toBe([...stored.keys()][0])
    })

    it("names the chats the limit deleted to make room for a new one", async () => {
        deletedByLimit = ["Old flowchart", "New Chat"]
        const info = vi.spyOn(toast, "info")
        const { result } = await setup()
        let save!: Promise<boolean>
        act(() => {
            save = result.current.saveCurrentSession(data)
        })
        await finishWrites()
        deletedByLimit = []
        expect(await save).toBe(true)
        expect(info.mock.calls.map((call) => call[0])).toEqual([
            "Keeps 50, deleted Old flowchart",
            "Keeps 50, deleted Untitled diagram",
        ])
    })

    it("gives the toast of a failed save the storage error, for its record", async () => {
        vi.mocked(saveSession).mockResolvedValueOnce(false)
        const { result } = await setup()
        let save!: Promise<boolean>
        act(() => {
            save = result.current.saveCurrentSession(data)
        })
        expect(await save).toBe(false)
        expect(toastUnexpectedError).toHaveBeenCalledWith(
            "Not saved",
            "Report",
            storageError,
            { id: "session-save-failed" },
        )
    })

    it("drops a save scheduled before New Chat", async () => {
        const { result } = await setup()
        const scheduled = result.current.getSaveTicket()
        act(() => result.current.clearCurrentSession())
        let save!: Promise<boolean>
        act(() => {
            save = result.current.saveCurrentSession(data, scheduled)
        })
        await finishWrites()
        expect(await save).toBe(true)
        expect(stored.size).toBe(0)
    })

    it("drops a save of the old chat waiting behind New Chat's save", async () => {
        const { result } = await setup()
        // The auto-save is scheduled, then New Chat saves and clears
        const scheduled = result.current.getSaveTicket()
        let newChatSave!: Promise<boolean>
        let autoSave!: Promise<boolean>
        act(() => {
            newChatSave = result.current.saveCurrentSession(data)
            autoSave = result.current.saveCurrentSession(data, scheduled)
        })
        await act(async () => {
            await waitFor(() => expect(pendingWrites).toHaveLength(1))
            pendingWrites.shift()?.()
            await newChatSave
            result.current.clearCurrentSession()
        })
        await finishWrites()
        await autoSave
        expect(stored.size).toBe(1)
        expect(result.current.currentSessionId).toBeNull()
    })

    it("keeps the new blank chat when a save of the old one ends later", async () => {
        const { result } = await setup()
        let save!: Promise<boolean>
        act(() => {
            save = result.current.saveCurrentSession(data)
        })
        await waitFor(() => expect(pendingWrites).toHaveLength(1))
        // New Chat while the write runs
        act(() => result.current.clearCurrentSession())
        await finishWrites()
        await save
        expect(stored.size).toBe(1)
        expect(result.current.currentSessionId).toBeNull()
        expect(result.current.currentSession).toBeNull()
    })

    it("keeps New Chat when the URL's chat finishes loading after it", async () => {
        stored.set("s1", { id: "s1", title: "Old", messages: [] })
        const hook = renderHook(
            ({ id }: { id: string | null }) =>
                useSessionManager({ initialSessionId: id }),
            { initialProps: { id: null as string | null } },
        )
        await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
        // The new chat's id reaches the URL; reading it takes a moment
        let release!: () => void
        readGate = new Promise((r) => {
            release = r
        })
        hook.rerender({ id: "s1" })
        act(() => hook.result.current.clearCurrentSession())
        await act(async () => {
            release()
            await new Promise((r) => setTimeout(r, 0))
        })
        readGate = Promise.resolve()
        expect(hook.result.current.currentSessionId).toBeNull()
    })
})

describe("save tickets", () => {
    beforeEach(() => {
        stored.clear()
        pendingWrites = []
    })
    const textOf = (session: any) => session?.messages[0].parts[0].text
    const said = (text: string) => ({
        ...data,
        messages: [{ ...data.messages[0], parts: [{ type: "text", text }] }],
    })

    it("never put an older copy of a chat over a newer one", async () => {
        const { result } = await setup()
        let first!: Promise<boolean>
        act(() => {
            first = result.current.saveCurrentSession(said("first"))
        })
        await finishWrites()
        await first
        // An auto-save read its data, then waits for its thumbnail; a save
        // without a thumbnail reads newer data and is done first
        const older = result.current.getSaveTicket()
        const newer = result.current.getSaveTicket()
        let saves!: Promise<boolean[]>
        act(() => {
            saves = Promise.all([
                result.current.saveCurrentSession(said("newer"), newer),
                result.current.saveCurrentSession(said("older"), older),
            ])
        })
        await finishWrites()
        await saves
        expect(textOf([...stored.values()][0])).toBe("newer")
    })

    it("keep a chat read before a switch out of the chat switched to", async () => {
        stored.set("other", {
            ...said("other chat"),
            id: "other",
            title: "Other",
        })
        const { result } = await setup()
        // New Chat reads this chat, then waits for its thumbnail
        const ticket = result.current.getSaveTicket()
        // Meanwhile the user opens the other chat
        let open!: Promise<unknown>
        act(() => {
            open = result.current.switchSession("other")
        })
        await finishWrites()
        await open
        let late!: Promise<boolean>
        act(() => {
            late = result.current.saveCurrentSession(said("this chat"), ticket)
        })
        await finishWrites()
        await late
        expect(textOf(stored.get("other"))).toBe("other chat")
        expect(stored.size).toBe(1)
    })
})

describe("a chat that was only opened", () => {
    beforeEach(() => {
        stored.clear()
        pendingWrites = []
    })
    const chat = (id: string, updatedAt: number, texts: string[]) => ({
        id,
        title: id,
        createdAt: 1000,
        updatedAt,
        messages: texts.map((text, i) => ({
            id: `${id}-${i}`,
            role: "user" as const,
            parts: [{ type: "text", text }],
        })),
        xmlSnapshots: [],
        diagramXml: "",
    })

    it("is not written again when another chat is opened", async () => {
        stored.set("X", chat("X", 1000, ["first"]))
        stored.set("Y", chat("Y", 500, ["other"]))
        const { result } = renderHook(() =>
            useSessionManager({ initialSessionId: "X" }),
        )
        await waitFor(() => expect(result.current.currentSessionId).toBe("X"))
        // Another tab saves a newer copy of X
        stored.set("X", chat("X", 2000, ["first", "second"]))
        let open!: Promise<unknown>
        act(() => {
            open = result.current.switchSession("Y")
        })
        await finishWrites()
        await open
        expect(result.current.currentSessionId).toBe("Y")
        expect(stored.get("X").messages).toHaveLength(2)
        expect(stored.get("X").updatedAt).toBe(2000)
    })
})

describe("the chat list", () => {
    beforeEach(() => {
        stored.clear()
        pendingWrites = []
    })
    const chat = (id: string, updatedAt: number) => ({
        id,
        title: id,
        createdAt: 1000,
        updatedAt,
        messages: data.messages,
        xmlSnapshots: [],
        diagramXml: "",
    })
    const order = (result: { current: { sessions: { id: string }[] } }) =>
        result.current.sessions.map((s) => s.id)

    it("puts a chat first once it is saved", async () => {
        stored.set("old", chat("old", 1000))
        stored.set("new", chat("new", 2000))
        const { result } = renderHook(() =>
            useSessionManager({ initialSessionId: "old" }),
        )
        await waitFor(() => expect(result.current.currentSessionId).toBe("old"))
        expect(order(result)).toEqual(["new", "old"])
        let save!: Promise<boolean>
        act(() => {
            save = result.current.saveCurrentSession(data)
        })
        await finishWrites()
        await save
        expect(order(result)).toEqual(["old", "new"])
    })

    it("shows a renamed chat first, with the time storage gave it", async () => {
        stored.set("old", chat("old", 1000))
        stored.set("new", chat("new", 2000))
        const { result } = renderHook(() =>
            useSessionManager({ initialSessionId: "old" }),
        )
        await waitFor(() => expect(result.current.currentSessionId).toBe("old"))
        await act(() => result.current.renameSession("old", "Renamed"))
        expect(order(result)).toEqual(["old", "new"])
        expect(result.current.sessions[0]).toMatchObject({
            title: "Renamed",
            updatedAt: stored.get("old").updatedAt,
        })
    })
})

describe("renaming the chat on screen", () => {
    beforeEach(() => {
        stored.clear()
        pendingWrites = []
        vi.mocked(toastUnexpectedError).mockClear()
    })

    it("writes it again when storage no longer holds it", async () => {
        stored.set("X", {
            id: "X",
            title: "Old name",
            createdAt: 1000,
            updatedAt: 1000,
            messages: data.messages,
            xmlSnapshots: [],
            diagramXml: "",
        })
        const { result } = renderHook(() =>
            useSessionManager({ initialSessionId: "X" }),
        )
        await waitFor(() => expect(result.current.currentSessionId).toBe("X"))
        // The site's data is cleared while the chat is open
        stored.clear()
        let rename!: Promise<void>
        act(() => {
            rename = result.current.renameSession("X", "New name")
        })
        await finishWrites()
        await rename
        expect(stored.get("X")).toMatchObject({
            title: "New name",
            messages: data.messages,
        })
        expect(result.current.sessions.map((s) => s.title)).toEqual([
            "New name",
        ])
        expect(toastUnexpectedError).not.toHaveBeenCalled()
    })

    it("leaves the stored copy alone when the rename could not be written", async () => {
        const chat = {
            id: "X",
            title: "Old name",
            createdAt: 1000,
            updatedAt: 1000,
            messages: data.messages,
            xmlSnapshots: [],
            diagramXml: "",
        }
        stored.set("X", chat)
        const { result } = renderHook(() =>
            useSessionManager({ initialSessionId: "X" }),
        )
        await waitFor(() => expect(result.current.currentSessionId).toBe("X"))
        // Another tab saves two more messages; storage is full
        const newer = {
            ...chat,
            updatedAt: 2000,
            messages: [...data.messages, ...data.messages, ...data.messages],
        }
        stored.set("X", newer)
        renameWriteFails = true
        vi.mocked(saveSession).mockClear()
        let rename!: Promise<void>
        act(() => {
            rename = result.current.renameSession("X", "New name")
        })
        await finishWrites()
        await rename
        renameWriteFails = false
        // This page's smaller copy was not written over the newer one
        expect(saveSession).not.toHaveBeenCalled()
        expect(stored.get("X")).toBe(newer)
        expect(toastUnexpectedError).toHaveBeenCalledTimes(1)
    })
})
