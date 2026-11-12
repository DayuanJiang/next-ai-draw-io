import { beforeEach, expect, it, vi } from "vitest"

// IndexedDB whose first connection gets lost, as Safari does with a page left
// in the background: every request on that connection fails from then on
let opened = 0
let lost = false
const rows = new Map<string, any>()

vi.mock("idb", () => ({
    openDB: vi.fn(async () => {
        const first = ++opened === 1
        const check = () => {
            if (lost && first) {
                throw new Error(
                    "Connection to Indexed Database server lost. Refresh the page to try again",
                )
            }
        }
        return {
            getAll: async () => {
                check()
                return [...rows.values()]
            },
            get: async (_store: string, id: string) => {
                check()
                return rows.get(id)
            },
            count: async () => {
                check()
                return rows.size
            },
            put: async (_store: string, value: any) => {
                check()
                rows.set(value.id, value)
            },
        }
    }),
}))

beforeEach(() => {
    vi.resetModules()
    vi.spyOn(console, "error").mockImplementation(() => {})
    ;(window as any).indexedDB = {}
    opened = 0
    lost = false
    rows.clear()
})

it("saved prompts are listed again after the connection was lost", async () => {
    const storage = await import("@/lib/template-storage")
    await storage.createTemplate({ prompt: "Draw an AWS setup", title: "AWS" })
    lost = true
    // The call that finds the connection lost fails; the next one reopens it
    expect(await storage.getAllTemplates()).toEqual([])
    expect((await storage.getAllTemplates()).map((t) => t.title)).toEqual([
        "AWS",
    ])
    expect(
        await storage.createTemplate({ prompt: "Another one" }),
    ).toMatchObject({ prompt: "Another one" })
    expect(opened).toBe(2)
})

it("saved diagrams are read again after the connection was lost", async () => {
    const storage = await import("@/lib/session-storage")
    await storage.saveSession({
        ...storage.createEmptySession(),
        id: "x",
        title: "X",
    })
    lost = true
    expect(await storage.getSession("x")).toBeNull()
    expect((await storage.getSession("x"))?.title).toBe("X")
    expect(await storage.readSessionCount()).toBe(1)
    expect(opened).toBe(2)
})
