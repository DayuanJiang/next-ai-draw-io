/**
 * Export job queue test: drives the patched export protocol the way the real
 * pieces interact — MCP tool calls (enqueue + waitForExportJob) on one side,
 * the browser bridge (GET /api/state poll -> POST result by job id) on the
 * other — against the real HTTP server.
 *
 * Covers the races the old single-slot protocol had:
 *   - concurrent exports overwriting each other's request,
 *   - the single response consumed by the wrong caller,
 *   - late/stale responses poisoning the next export,
 *   - a failed/timed-out head blocking the queue.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
    completeExportJob,
    currentExportJob,
    enqueueExport,
    failExportJob,
    getState,
    isBrowserConnected,
    setState,
    shutdown,
    startHttpServer,
    touchBrowserHeartbeat,
    waitForExportJob,
} from "../src/http-server.js"

const SESSION = "mcp-export-queue-test"

let port = 0
let base = ""

type StateResponse = {
    xml: string | null
    version: number
    syncRequested: boolean
    exportJob: { id: number; format: string; xml: string | null } | null
}

async function browserPoll(): Promise<StateResponse> {
    const r = await fetch(`${base}/api/state?sessionId=${SESSION}`)
    expect(r.status).toBe(200)
    return r.json()
}

async function browserPost(body: Record<string, unknown>) {
    const r = await fetch(`${base}/api/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, ...body }),
    })
    return r.json()
}

beforeAll(async () => {
    port = await startHttpServer(6070)
    base = `http://127.0.0.1:${port}`
    setState(SESSION, "<mxfile/>")
    touchBrowserHeartbeat(SESSION)
})

afterAll(() => {
    shutdown()
})

describe("export job queue", () => {
    it("serializes concurrent enqueues and routes results by job id", async () => {
        const j1 = enqueueExport(SESSION, "png")
        const j2 = enqueueExport(SESSION, "png", "<mxfile>pageB</mxfile>")
        const j3 = enqueueExport(SESSION, "svg")
        expect(j1 && j2 && j3).toBeTruthy()
        expect([j1!.id, j2!.id, j3!.id]).toEqual([1, 2, 3])

        const p1 = waitForExportJob(SESSION, j1!.id, 5000)
        const p2 = waitForExportJob(SESSION, j2!.id, 5000)
        const p3 = waitForExportJob(SESSION, j3!.id, 5000)

        // Browser sees only the head of the queue.
        const s1 = await browserPoll()
        expect(s1.exportJob).toBeTruthy()
        expect(s1.exportJob!.id).toBe(1)
        expect(s1.exportJob!.format).toBe("png")
        expect(s1.exportJob!.xml).toBeNull()

        // Job 1 renders first; job 2's waiter must not resolve yet.
        let resolved2 = false
        void p2.then(() => {
            resolved2 = true
        })
        await browserPost({ exportJobId: 1, exportData: "data:image/png;base64,AAAAjob1" })
        expect(await p1).toBe("data:image/png;base64,AAAAjob1")
        await new Promise((r) => setTimeout(r, 150))
        expect(resolved2).toBe(false)

        // Queue advanced; job 2 carries its own projection.
        const s2 = await browserPoll()
        expect(s2.exportJob!.id).toBe(2)
        expect(s2.exportJob!.xml).toBe("<mxfile>pageB</mxfile>")
        await browserPost({ exportJobId: 2, exportData: "data:image/png;base64,BBBBjob2" })
        expect(await p2).toBe("data:image/png;base64,BBBBjob2")

        const s3 = await browserPoll()
        expect(s3.exportJob!.id).toBe(3)
        expect(s3.exportJob!.format).toBe("svg")
        await browserPost({ exportJobId: 3, exportData: "data:image/svg+xml;base64,CCCCjob3" })
        expect(await p3).toBe("data:image/svg+xml;base64,CCCCjob3")

        const s4 = await browserPoll()
        expect(s4.exportJob).toBeNull()
    })

    it("ignores stale/late results for already-completed job ids", async () => {
        const r = await browserPost({ exportJobId: 1, exportData: "data:image/png;base64,LATE" })
        expect(r.success).toBe(true)
        expect(currentExportJob(SESSION)).toBeUndefined()
    })

    it("fails a browser-reported job fast and advances the queue", async () => {
        const j4 = enqueueExport(SESSION, "png")
        const j5 = enqueueExport(SESSION, "png")
        const p4 = waitForExportJob(SESSION, j4!.id, 5000)
        const p5 = waitForExportJob(SESSION, j5!.id, 5000)

        const s = await browserPoll()
        expect(s.exportJob!.id).toBe(j4!.id)
        await browserPost({ exportJobId: j4!.id, exportFailed: true })

        expect(await p4).toBeNull()
        const s2 = await browserPoll()
        expect(s2.exportJob!.id).toBe(j5!.id)
        await browserPost({ exportJobId: j5!.id, exportData: "data:image/png;base64,DDDDjob5" })
        expect(await p5).toBe("data:image/png;base64,DDDDjob5")
    })

    it("removes a timed-out head so successors are not blocked", async () => {
        const j6 = enqueueExport(SESSION, "png")
        const j7 = enqueueExport(SESSION, "png")
        const t0 = Date.now()
        expect(await waitForExportJob(SESSION, j6!.id, 300)).toBeNull()
        expect(Date.now() - t0).toBeLessThan(1500)
        expect(currentExportJob(SESSION)?.id).toBe(j7!.id)

        const p7 = waitForExportJob(SESSION, j7!.id, 5000)
        expect(completeExportJob(SESSION, j7!.id, "data:image/png;base64,EEEEjob7")).toBe(true)
        expect(await p7).toBe("data:image/png;base64,EEEEjob7")
    })

    it("returns null from enqueue for unknown sessions", () => {
        expect(enqueueExport("mcp-nope", "png")).toBeNull()
        expect(currentExportJob("mcp-nope")).toBeUndefined()
        expect(completeExportJob("mcp-nope", 1, "x")).toBe(false)
        expect(failExportJob("mcp-nope", 1)).toBe(false)
    })

    it("keeps non-export state paths working (autosave push)", async () => {
        const push = await browserPost({ xml: "<mxfile pushed='1'/>", svg: "" })
        expect(push.success).toBe(true)
        expect(push.version).toBeGreaterThan(0)
        expect(getState(SESSION)!.xml).toContain("pushed")
        const s = await browserPoll()
        expect(s.version).toBe(push.version)
        expect(s.exportJob).toBeNull()
    })

    it("treats the session as connected while the heartbeat is fresh", () => {
        touchBrowserHeartbeat(SESSION)
        expect(isBrowserConnected(SESSION)).toBe(true)
    })
})
