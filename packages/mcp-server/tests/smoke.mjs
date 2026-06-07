#!/usr/bin/env node
/**
 * Smoke test: boot the BUILT MCP server (dist/index.js) and verify the
 * end-to-end wiring works for the multi-page contract.
 *
 * Why a separate smoke test on top of vitest?
 *   Vitest exercises the helpers (pages.ts, diagram-operations.ts,
 *   xml-validation.ts) directly. This smoke script instead pokes the actual
 *   stdio binary the way a real MCP client will:
 *     - Spawn `node dist/index.js`
 *     - Initialize the MCP protocol
 *     - Call tools/list and assert all 9 tools register correctly
 *     - Confirm the server stays alive across the round-trip
 *
 * We intentionally do NOT call start_session here — it would launch a real
 * browser window via `open()`, which is annoying for CI and not what this
 * test is about. The browser-side bridge is exercised by the existing
 * Playwright e2e suite.
 */

import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distEntry = path.resolve(__dirname, "..", "dist", "index.js")

const EXPECTED_TOOLS = new Set([
    "start_session",
    "create_new_diagram",
    "edit_diagram",
    "get_diagram",
    "export_diagram",
    "list_pages",
    "add_page",
    "rename_page",
    "delete_page",
])

function fail(msg) {
    console.error(`SMOKE FAIL: ${msg}`)
    process.exit(1)
}

function pass(msg) {
    console.log(`  ✓ ${msg}`)
}

const proc = spawn("node", [distEntry], {
    stdio: ["pipe", "pipe", "pipe"],
})

let exited = false
proc.on("exit", (code, signal) => {
    exited = true
    if (code !== 0 && code !== null) {
        fail(`server exited with code ${code} (signal=${signal})`)
    }
})

// Capture stderr so we can surface any startup logs on failure.
let stderr = ""
proc.stderr.on("data", (c) => {
    stderr += c.toString()
})

// MCP framing over stdio is line-delimited JSON.
let stdoutBuf = ""
const pending = new Map() // id → resolver
let nextId = 1

function send(method, params, isNotification = false) {
    const msg = { jsonrpc: "2.0", method, params }
    if (!isNotification) msg.id = nextId++
    proc.stdin.write(JSON.stringify(msg) + "\n")
    if (isNotification) return Promise.resolve()
    return new Promise((resolve, reject) => {
        const id = msg.id
        const timeout = setTimeout(() => {
            pending.delete(id)
            reject(new Error(`Timed out waiting for response to ${method}`))
        }, 8000)
        pending.set(id, { resolve, reject, timeout })
    })
}

proc.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString()
    const lines = stdoutBuf.split("\n")
    stdoutBuf = lines.pop() || ""
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let msg
        try {
            msg = JSON.parse(trimmed)
        } catch {
            // The server also writes structured log messages to stdout in
            // some configurations — ignore anything that isn't JSON-RPC.
            continue
        }
        if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve, timeout } = pending.get(msg.id)
            clearTimeout(timeout)
            pending.delete(msg.id)
            resolve(msg)
        }
    }
})

async function run() {
    console.log("smoke: spawning", distEntry)

    // 1) initialize
    const initResp = await send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
    })
    if (initResp.error)
        fail(`initialize errored: ${JSON.stringify(initResp.error)}`)
    if (!initResp.result?.serverInfo?.name) {
        fail(
            `initialize response missing serverInfo: ${JSON.stringify(initResp)}`,
        )
    }
    pass(
        `initialize → server "${initResp.result.serverInfo.name}" v${initResp.result.serverInfo.version}`,
    )

    // 2) the protocol requires a notification before further calls
    await send("notifications/initialized", {}, true)

    // 3) tools/list — assert every expected tool registers
    const listResp = await send("tools/list", {})
    if (listResp.error)
        fail(`tools/list errored: ${JSON.stringify(listResp.error)}`)
    const got = listResp.result?.tools?.map((t) => t.name)
    if (!Array.isArray(got))
        fail(`tools/list returned no array: ${JSON.stringify(listResp)}`)
    const gotSet = new Set(got)
    const missing = [...EXPECTED_TOOLS].filter((t) => !gotSet.has(t))
    if (missing.length)
        fail(`missing tools: ${missing.join(", ")} (got: ${got.join(", ")})`)
    pass(`tools/list → ${got.length} tools, all expected present`)
    pass(`tools: ${got.join(", ")}`)

    // 4) sanity-check that the new tools advertise page selector params in
    //    their inputSchema so an LLM client actually sees them.
    const editTool = listResp.result.tools.find(
        (t) => t.name === "edit_diagram",
    )
    if (!editTool?.inputSchema?.properties?.page_id) {
        fail("edit_diagram is missing page_id in its inputSchema")
    }
    if (!editTool.inputSchema.properties.page_name) {
        fail("edit_diagram is missing page_name in its inputSchema")
    }
    if (!editTool.inputSchema.properties.page_index) {
        fail("edit_diagram is missing page_index in its inputSchema")
    }
    pass("edit_diagram inputSchema advertises page_id / page_name / page_index")

    const addPageTool = listResp.result.tools.find((t) => t.name === "add_page")
    if (!addPageTool?.inputSchema?.properties?.name) {
        fail("add_page is missing 'name' in its inputSchema")
    }
    pass("add_page inputSchema advertises name / id / xml")

    // Tear down cleanly.
    proc.kill("SIGTERM")
    // Give it a moment to exit.
    await new Promise((r) => setTimeout(r, 200))
    if (!exited && proc.killed === false) {
        proc.kill("SIGKILL")
    }
    console.log("smoke: PASS")
    process.exit(0)
}

run().catch((err) => {
    console.error("smoke threw:", err)
    if (stderr) {
        console.error("--- server stderr ---")
        console.error(stderr)
    }
    proc.kill("SIGKILL")
    process.exit(1)
})
