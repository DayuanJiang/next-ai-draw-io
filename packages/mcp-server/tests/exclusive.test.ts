/**
 * Tests for the queue the write tools run in (index.ts registerWriteTool).
 */
import { describe, expect, it } from "vitest"
import { createExclusive } from "../src/exclusive.ts"

const extra = (signal = new AbortController().signal) => ({ signal })
const tick = () => new Promise((r) => setTimeout(r, 5))

describe("createExclusive", () => {
    it("runs the calls one at a time, in order", async () => {
        const exclusive = createExclusive()
        const events: string[] = []
        // Reads the document, waits, then writes it back
        const addPage = exclusive(async (args: { name: string }, _extra) => {
            events.push(`read ${args.name}`)
            await tick()
            events.push(`write ${args.name}`)
            return { content: [] }
        })
        await Promise.all([
            addPage({ name: "A" }, extra()),
            addPage({ name: "B" }, extra()),
        ])
        expect(events).toEqual(["read A", "write A", "read B", "write B"])
    })

    it("goes on after a call that threw", async () => {
        const exclusive = createExclusive()
        const failing = exclusive(async (_extra: unknown) => {
            throw new Error("broken")
        })
        const working = exclusive(async (_extra: unknown) => ({ content: [] }))
        const first = failing(extra())
        const second = working(extra())
        await expect(first).rejects.toThrow("broken")
        await expect(second).resolves.toEqual({ content: [] })
    })

    it("skips a call cancelled while it waited", async () => {
        const exclusive = createExclusive()
        let ran = false
        const slow = exclusive(async (_extra: unknown) => {
            await tick()
            return { content: [] }
        })
        const deletePage = exclusive(async (_extra: unknown) => {
            ran = true
            return { content: [] }
        })
        const cancel = new AbortController()
        const first = slow(extra())
        const second = deletePage(extra(cancel.signal))
        cancel.abort()
        await first
        expect(await second).toMatchObject({ isError: true })
        expect(ran).toBe(false)
    })
})
