import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const stored = new Map<string, any>()
// Each write waits for the test to let it finish
let pendingWrites: (() => void)[] = []
// Reads wait for this
let readGate: Promise<void> = Promise.resolve()

vi.mock("@/hooks/use-dictionary", () => ({
    useDictionary: () => ({ errors: { sessionSaveFailed: "Not saved" } }),
}))

vi.mock("@/lib/session-storage", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/session-storage")>()
    return {
        createEmptySession: actual.createEmptySession,
        extractTitle: actual.extractTitle,
        isIndexedDBAvailable: () => true,
        migrateFromLocalStorage: async () => null,
        readSessionCount: async () => stored.size,
        enforceSessionLimit: async () => {},
        getSession: async (id: string) => {
            await readGate
            return stored.get(id) ?? null
        },
        deleteSession: async (id: string) => {
            stored.delete(id)
        },
        getAllSessionMetadata: async () =>
            [...stored.values()].map((s) => ({ id: s.id, title: s.title })),
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

import { useSessionManager } from "@/hooks/use-session-manager"

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

    it("drops a save scheduled before New Chat", async () => {
        const { result } = await setup()
        const scheduled = result.current.getChatGeneration()
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
        const scheduled = result.current.getChatGeneration()
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
