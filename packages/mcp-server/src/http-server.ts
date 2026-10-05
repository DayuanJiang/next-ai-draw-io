/**
 * Embedded HTTP Server for MCP
 * Serves draw.io embed with state sync and history UI
 */

import { readFileSync } from "node:fs"
import http from "node:http"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10 MiB

function readBody(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    cb: (body: string) => void,
): void {
    // Decode once at the end: a multi-byte UTF-8 character can be split
    // across two chunks.
    const chunks: Buffer[] = []
    let size = 0
    req.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
            res.writeHead(413, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Payload too large" }))
            req.destroy()
            return
        }
        chunks.push(chunk)
    })
    req.on("end", () => cb(Buffer.concat(chunks).toString("utf8")))
}

import {
    addHistory,
    clearHistory,
    getHistory,
    getHistoryEntry,
    updateLastHistorySvg,
} from "./history.ts"
import { log } from "./logger.ts"
import { BLANK_MXFILE, hasCells } from "./pages.ts"

// Configurable draw.io embed URL for private deployments
const DRAWIO_BASE_URL =
    process.env.DRAWIO_BASE_URL || "https://embed.diagrams.net"

// Extract origin (scheme + host + port) from URL for postMessage security check
function getOrigin(url: string): string {
    try {
        const parsed = new URL(url)
        return `${parsed.protocol}//${parsed.host}`
    } catch {
        return url // Fallback if parsing fails
    }
}

const DRAWIO_ORIGIN = getOrigin(DRAWIO_BASE_URL)

// Normalize URL for iframe src - ensure no double slashes
function normalizeUrl(url: string): string {
    // Remove trailing slash to avoid double slashes
    return url.replace(/\/$/, "")
}

// Session ids look like "mcp-<base36 time>-<base36 random>" (start_session).
// Only this charset is accepted, because ids are written into the page's
// HTML and script and into the redirect Location header.
function isValidSessionId(sessionId: string): boolean {
    return /^mcp-[a-z0-9-]{1,64}$/.test(sessionId)
}

// Find the most recent active session (for auto-redirect when no sessionId provided)
function getMostRecentSessionId(): string | null {
    let mostRecent: { id: string; lastUpdated: Date } | null = null
    for (const [sessionId, state] of stateStore) {
        if (!mostRecent || state.lastUpdated > mostRecent.lastUpdated) {
            mostRecent = { id: sessionId, lastUpdated: state.lastUpdated }
        }
    }
    return mostRecent?.id || null
}

function ensureSessionStateInitialized(sessionId: string): void {
    if (!sessionId) return
    if (!isValidSessionId(sessionId)) return
    if (stateStore.has(sessionId)) return

    // The session's saved diagram, so a blank page never replaces that file.
    // Not a change worth saving: the browser fills it on its next push
    // A blank diagram keeps the draw.io spinner (spin=1) from waiting
    // forever when no load(xml) is ever sent
    const saved = savedStateLoader?.(sessionId)
    setState(sessionId, saved || BLANK_MXFILE, undefined, false, false)
}

interface SessionState {
    xml: string
    version: number
    // Version of the last write the browser did not make itself (AI edit,
    // restore). A browser push based on an older version is rejected.
    serverVersion?: number
    lastUpdated: Date
    lastPolled?: number // Last browser poll; an open tab keeps the session alive
    svg?: string // Cached SVG from last browser save
    syncRequested?: number // Timestamp when sync requested, cleared when browser responds
    exportFormat?: ExportFormat // Set by MCP tool to request browser export
    exportXml?: string // Single-page projection to load before a page-targeted export
    exportOptions?: ExportOptions // Extra draw.io export parameters (PNG only)
    exportId?: number // Number of the pending export, echoed with its result
    exportData?: string // Base64/SVG data returned by browser after export
}

/** draw.io export formats; xmlsvg is an SVG with the diagram embedded */
export type ExportFormat = "png" | "svg" | "xmlsvg"

/**
 * draw.io's PNG export takes these directly: width caps the image size
 * (never upscales), pageId renders a page other than the one on screen.
 */
export interface ExportOptions {
    width?: number
    pageId?: string
}

export const stateStore = new Map<string, SessionState>()

let server: http.Server | null = null
let serverPort = 6002
const MAX_PORT = 6020
const SESSION_TTL = 60 * 60 * 1000

export function getState(sessionId: string): SessionState | undefined {
    return stateStore.get(sessionId)
}

// Called after every state change (AI write, browser push, restore)
let stateListener: ((sessionId: string, xml: string) => void) | null = null

export function onStateChange(
    listener: (sessionId: string, xml: string) => void,
): void {
    stateListener = listener
}

// Reads a session's saved diagram when its state is created again (it
// expired, or the MCP process restarted)
let savedStateLoader: ((sessionId: string) => string | null) | null = null

export function onSessionRecreate(
    loader: (sessionId: string) => string | null,
): void {
    savedStateLoader = loader
}

export function setState(
    sessionId: string,
    xml: string,
    svg?: string,
    fromBrowser = false,
    notify = true,
): number {
    const existing = stateStore.get(sessionId)
    const newVersion = (existing?.version || 0) + 1
    stateStore.set(sessionId, {
        xml,
        version: newVersion,
        serverVersion: fromBrowser ? existing?.serverVersion : newVersion,
        lastUpdated: new Date(),
        lastPolled: existing?.lastPolled,
        svg: svg || existing?.svg, // Preserve cached SVG if not provided
        syncRequested: undefined, // Clear sync request when browser pushes state
        exportFormat: existing?.exportFormat, // Preserve pending export request
        exportXml: existing?.exportXml, // Preserve pending projection
        exportOptions: existing?.exportOptions,
        exportId: existing?.exportId,
        exportData: existing?.exportData, // Preserve export result
    })
    log.debug(`State updated: session=${sessionId}, version=${newVersion}`)
    if (notify) stateListener?.(sessionId, xml)
    return newVersion
}

/**
 * Ask the browser bridge to export the current diagram as png/svg.
 *
 * When `projectionXml` is given (a single-page <mxfile>), the bridge loads it
 * first, waits for draw.io's own load event, exports, then reloads the
 * session's real document — so a page-targeted export never mutates the
 * canonical session state and needs no fixed-delay guessing on the server.
 *
 * Returns false when the session is unknown. Callers should then poll
 * `getState(sessionId)?.exportData` for the result.
 */
export function requestExport(
    sessionId: string,
    format: ExportFormat,
    projectionXml?: string,
    options?: ExportOptions,
): boolean {
    const state = stateStore.get(sessionId)
    if (!state) return false
    state.exportData = undefined
    state.exportXml = projectionXml
    state.exportOptions = options
    state.exportFormat = format
    // The browser sends this back with the result, so a late result of an
    // export that timed out is not taken for this one
    state.exportId = ++lastExportId
    return true
}

let lastExportId = 0

export function requestSync(sessionId: string): boolean {
    const state = stateStore.get(sessionId)
    if (state) {
        state.syncRequested = Date.now()
        log.debug(`Sync requested for session=${sessionId}`)
        return true
    }
    log.debug(`Sync requested for non-existent session=${sessionId}`)
    return false
}

export async function waitForSync(
    sessionId: string,
    timeoutMs = 3000,
): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        const state = stateStore.get(sessionId)
        if (!state?.syncRequested) return true // Sync completed
        await new Promise((r) => setTimeout(r, 100))
    }
    log.warn(`Sync timeout for session=${sessionId}`)
    return false // Timeout
}

export function startHttpServer(port = 6002): Promise<number> {
    return new Promise((resolve, reject) => {
        if (server) {
            resolve(serverPort)
            return
        }

        serverPort = port
        server = http.createServer(handleRequest)

        server.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                if (port >= MAX_PORT) {
                    reject(
                        new Error(
                            `No available ports in range 6002-${MAX_PORT}`,
                        ),
                    )
                    return
                }
                log.info(`Port ${port} in use, trying ${port + 1}`)
                server = null
                startHttpServer(port + 1)
                    .then(resolve)
                    .catch(reject)
            } else {
                reject(err)
            }
        })

        server.listen(port, "127.0.0.1", () => {
            serverPort = port
            log.info(`HTTP server running on http://localhost:${port}`)
            resolve(port)
        })
    })
}

export function stopHttpServer(): void {
    if (server) {
        server.close()
        server = null
    }
}

function cleanupExpiredSessions(): void {
    const now = Date.now()
    for (const [sessionId, state] of stateStore) {
        const lastActive = Math.max(
            state.lastUpdated.getTime(),
            state.lastPolled ?? 0,
        )
        if (now - lastActive > SESSION_TTL) {
            stateStore.delete(sessionId)
            clearHistory(sessionId)
            log.info(`Cleaned up expired session: ${sessionId}`)
        }
    }
}

const cleanupIntervalId = setInterval(cleanupExpiredSessions, 5 * 60 * 1000)

export function shutdown(): void {
    clearInterval(cleanupIntervalId)
    stopHttpServer()
}

export function getServerPort(): number {
    return serverPort
}

function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): void {
    // A bad request must never take down the MCP process
    try {
        routeRequest(req, res)
    } catch (err) {
        log.error("HTTP request failed:", err)
        if (!res.headersSent) res.writeHead(500)
        res.end()
    }
}

// Serve only requests addressed to localhost, sent by a localhost page or by
// a non-browser client (no Origin header). This blocks DNS rebinding and
// scripts on other websites.
function isLocalRequest(req: http.IncomingMessage): boolean {
    const isLocalHost = (host: string) =>
        /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
    const origin = req.headers.origin
    return (
        isLocalHost(req.headers.host ?? "") &&
        (origin === undefined || isLocalHost(origin.replace(/^http:\/\//, "")))
    )
}

function routeRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): void {
    let url: URL
    try {
        url = new URL(req.url || "/", `http://localhost:${serverPort}`)
    } catch {
        // e.g. "//" is not a valid URL path
        res.writeHead(400)
        res.end("Bad Request")
        return
    }

    if (!isLocalRequest(req)) {
        res.writeHead(403)
        res.end("Forbidden")
        return
    }

    const requestOrigin = req.headers.origin
    if (requestOrigin === `http://localhost:${serverPort}`) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin)
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    }

    if (req.method === "OPTIONS") {
        res.writeHead(204)
        res.end()
        return
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
        const sessionId = url.searchParams.get("mcp") || ""
        if (sessionId && !isValidSessionId(sessionId)) {
            res.writeHead(400)
            res.end("Invalid session id")
            return
        }

        // Auto-redirect to most recent session if no sessionId provided
        if (!sessionId) {
            const recentSessionId = getMostRecentSessionId()
            if (recentSessionId) {
                res.writeHead(302, {
                    Location: `/?mcp=${encodeURIComponent(recentSessionId)}`,
                })
                res.end()
                return
            }
        }

        ensureSessionStateInitialized(sessionId)

        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(getHtmlPage(sessionId))
    } else if (url.pathname === "/api/state") {
        handleStateApi(req, res, url)
    } else if (url.pathname === "/api/history") {
        handleHistoryApi(req, res, url)
    } else if (url.pathname === "/api/restore") {
        handleRestoreApi(req, res)
    } else if (url.pathname === "/api/history-svg") {
        handleHistorySvgApi(req, res)
    } else {
        res.writeHead(404)
        res.end("Not Found")
    }
}

function handleStateApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
): void {
    if (req.method === "GET") {
        const sessionId = url.searchParams.get("sessionId")
        if (!sessionId) {
            res.writeHead(400, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "sessionId required" }))
            return
        }
        ensureSessionStateInitialized(sessionId)
        const state = stateStore.get(sessionId)
        // Polling counts as activity, so a session stays alive while its
        // tab is open
        if (state) state.lastPolled = Date.now()
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
            JSON.stringify({
                xml: state?.xml || null,
                version: state?.version || 0,
                syncRequested: !!state?.syncRequested,
                exportFormat: state?.exportFormat || null,
                exportXml: state?.exportXml || null,
                exportOptions: state?.exportOptions || null,
                exportId: state?.exportId ?? null,
            }),
        )
    } else if (req.method === "POST") {
        readBody(req, res, (body) => {
            try {
                const data = JSON.parse(body)
                const { sessionId } = data
                if (!sessionId || !isValidSessionId(sessionId)) {
                    res.writeHead(400, { "Content-Type": "application/json" })
                    res.end(
                        JSON.stringify({ error: "valid sessionId required" }),
                    )
                    return
                }

                // Browser is returning export data (png/svg)
                if (data.exportData !== undefined) {
                    const state = stateStore.get(sessionId)
                    if (state && data.exportId === state.exportId) {
                        state.exportData = data.exportData
                        state.exportFormat = undefined
                        state.exportXml = undefined
                        state.exportOptions = undefined
                        state.exportId = undefined
                        log.debug(
                            `Export data received for session=${sessionId}`,
                        )
                    } else if (state) {
                        log.debug(
                            `Ignored a late export result for session=${sessionId}`,
                        )
                    }
                    res.writeHead(200, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ success: true }))
                    return
                }

                // The browser edited a version older than the latest AI write
                // (it has not loaded that write yet). Keep the AI write; the
                // browser loads it on its next poll. A sync reply is also
                // stale after a newer write of the browser's own (a user
                // edit saved while the export ran).
                const current = stateStore.get(sessionId)
                if (
                    typeof data.baseVersion === "number" &&
                    (data.baseVersion < (current?.serverVersion ?? 0) ||
                        (data.source === "sync" &&
                            data.baseVersion < (current?.version ?? 0)))
                ) {
                    let savedToHistory = false
                    if (data.source === "sync") {
                        // A stale sync reply: the store already holds the
                        // newer AI write, so the sync is done.
                        if (current) current.syncRequested = undefined
                    } else if (typeof data.xml === "string" && data.xml) {
                        // A user edit lost the race with an AI write. Keep
                        // it in history so the user can restore it.
                        addHistory(sessionId, data.xml, data.svg || "")
                        savedToHistory = true
                    }
                    res.writeHead(409, { "Content-Type": "application/json" })
                    res.end(
                        JSON.stringify({
                            error: "Diagram changed on the server",
                            version: current?.version,
                            savedToHistory,
                        }),
                    )
                    return
                }

                if (typeof data.xml !== "string") {
                    res.writeHead(400, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ error: "xml must be a string" }))
                    return
                }
                const version = setState(sessionId, data.xml, data.svg, true)
                res.writeHead(200, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ success: true, version }))
            } catch {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Invalid JSON" }))
            }
        })
    } else {
        res.writeHead(405)
        res.end("Method Not Allowed")
    }
}

function handleHistoryApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
): void {
    if (req.method !== "GET") {
        res.writeHead(405)
        res.end("Method Not Allowed")
        return
    }

    const sessionId = url.searchParams.get("sessionId")
    if (!sessionId) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "sessionId required" }))
        return
    }

    const history = getHistory(sessionId)
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
        JSON.stringify({
            entries: history.map((entry, i) => ({
                index: i,
                id: entry.id,
                svg: entry.svg,
            })),
            count: history.length,
        }),
    )
}

function handleRestoreApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): void {
    if (req.method !== "POST") {
        res.writeHead(405)
        res.end("Method Not Allowed")
        return
    }

    readBody(req, res, (body) => {
        try {
            const { sessionId, id } = JSON.parse(body)
            if (!sessionId || typeof id !== "number") {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "sessionId and id required" }))
                return
            }

            const entry = getHistoryEntry(sessionId, id)
            if (!entry) {
                res.writeHead(404, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Entry not found" }))
                return
            }

            // Edits in the browser since the last entry are not in history
            // yet: keep them, so the restore can be undone
            const current = stateStore.get(sessionId)
            if (current && hasCells(current.xml)) {
                addHistory(sessionId, current.xml, current.svg)
            }
            const newVersion = setState(sessionId, entry.xml)
            addHistory(sessionId, entry.xml, entry.svg)

            log.info(`Restored session ${sessionId} to history entry ${id}`)

            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ success: true, newVersion }))
        } catch {
            res.writeHead(400, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Invalid JSON" }))
        }
    })
}

function handleHistorySvgApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): void {
    if (req.method !== "POST") {
        res.writeHead(405)
        res.end("Method Not Allowed")
        return
    }

    readBody(req, res, (body) => {
        try {
            const { sessionId, svg } = JSON.parse(body)
            if (!sessionId || !svg) {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "sessionId and svg required" }))
                return
            }

            updateLastHistorySvg(sessionId, svg)
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ success: true }))
        } catch {
            res.writeHead(400, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Invalid JSON" }))
        }
    })
}

// The preview page lives in src/preview (the build copies it to dist/preview)
const PREVIEW_DIR = join(dirname(fileURLToPath(import.meta.url)), "preview")
let previewTemplate: string | null = null

function loadPreviewTemplate(): string {
    if (!previewTemplate) {
        const read = (file: string) =>
            readFileSync(join(PREVIEW_DIR, file), "utf-8")
        previewTemplate = read("index.html")
            .replace("{{CSS}}", () => read("preview.css"))
            .replace("{{SCRIPT}}", () => read("preview.js"))
    }
    return previewTemplate
}

/** A JSON string literal that is safe inside a <script> element */
const scriptJson = (value: string) =>
    JSON.stringify(value).replace(/</g, "\\u003c")

function getHtmlPage(sessionId: string): string {
    return loadPreviewTemplate()
        .replace("{{SESSION_BADGE}}", () =>
            sessionId
                ? `<span class="session">${sessionId.slice(-8)}</span>`
                : "",
        )
        .replaceAll("{{DISABLED}}", sessionId ? "" : "disabled")
        .replace("{{DRAWIO_URL}}", () => normalizeUrl(DRAWIO_BASE_URL))
        .replace("{{SESSION_JSON}}", () => scriptJson(sessionId))
        .replace("{{ORIGIN_JSON}}", () => scriptJson(DRAWIO_ORIGIN))
}
