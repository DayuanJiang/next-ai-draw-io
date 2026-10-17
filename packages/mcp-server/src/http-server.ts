/**
 * Embedded HTTP Server for MCP
 * Serves draw.io embed with state sync and history UI
 */

import { randomBytes, randomUUID } from "node:crypto"
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import http from "node:http"
import { dirname, extname, join, posix, resolve, sep } from "node:path"
import { pipeline } from "node:stream"
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
    let tooLarge = false
    req.on("data", (chunk: Buffer) => {
        if (tooLarge) return
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
            // Read the rest without keeping it and answer at the end: a
            // connection closed mid-upload reaches the browser as a network
            // error, without this answer
            tooLarge = true
            chunks.length = 0
            return
        }
        chunks.push(chunk)
    })
    req.on("end", () => {
        if (tooLarge) {
            res.writeHead(413, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Payload too large" }))
            return
        }
        cb(Buffer.concat(chunks).toString("utf8"))
    })
}

import { isDrawioTheme, toDrawioLang } from "./drawio-themes.ts"
import { contentFingerprint } from "./edit-gate.ts"
import {
    addHistory,
    clearHistory,
    currentEntryId,
    firstCopyIds,
    getHistory,
    getHistoryEntry,
    updateLastHistorySvg,
} from "./history.ts"
import { log } from "./logger.ts"
import { BLANK_MXFILE } from "./pages.ts"
import { parseSelectionAnswer, type SelectionAnswer } from "./selection.ts"

// Configurable draw.io embed URL for private deployments. Set, it replaces
// the bundled copy (see drawioDir below).
export const DRAWIO_BASE_URL =
    process.env.DRAWIO_BASE_URL || "https://embed.diagrams.net"
const EXTERNAL_DRAWIO = !!process.env.DRAWIO_BASE_URL

// Every /api request must carry this token in the X-Drawio-Token header.
// The page reads it from its HTML. Another website cannot add a custom
// header without a CORS preflight, which this server never grants, so its
// requests stop here whatever Host and Origin they manage to send.
const API_TOKEN = randomBytes(16).toString("hex")

export function getApiToken(): string {
    return API_TOKEN
}

// The trimmed draw.io copy that scripts/fetch-drawio.mjs puts in dist/drawio,
// next to the compiled server; run from src with tsx, it is one level up
const HERE = dirname(fileURLToPath(import.meta.url))
let drawioDir: string | null =
    [join(HERE, "drawio"), join(HERE, "../dist/drawio")].find((dir) =>
        existsSync(join(dir, "index.html")),
    ) ?? null
let drawioVersion = readDrawioVersion(drawioDir)

/** For tests: serve draw.io from this directory (null: no bundled copy) */
export function setDrawioDir(dir: string | null): void {
    drawioDir = dir
    drawioVersion = readDrawioVersion(dir)
}

// The canvas shell (the web app's canvas without the chat), built by
// scripts/build-shell.mjs into dist/shell
let shellDir: string | null =
    [join(HERE, "shell"), join(HERE, "../dist/shell")].find((dir) =>
        existsSync(join(dir, "index.html")),
    ) ?? null

/** For tests: serve the shell from this directory (null: not built) */
export function setShellDir(dir: string | null): void {
    shellDir = dir
}

// This package's version, stamped into the shell files' ETags (see
// readDrawioVersion for why)
const PACKAGE_VERSION: string = JSON.parse(
    readFileSync(join(HERE, "../package.json"), "utf8"),
).version

/**
 * The preview page start_session opens: the canvas shell (shell/, the web
 * app's canvas), or with DRAWIO_PREVIEW_UI=classic the classic page
 * (src/preview), kept for one more release.
 */
export type PreviewUi = "classic" | "shell"

export function previewUiFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): PreviewUi {
    return (env.DRAWIO_PREVIEW_UI ?? "").toLowerCase() === "classic"
        ? "classic"
        : "shell"
}

export const PREVIEW_UI: PreviewUi = previewUiFromEnv()

/**
 * The page start_session actually opens: the classic page stands in while
 * the shell is not built (a run from the sources), as embed.diagrams.net
 * does for a missing dist/drawio
 */
export function activePreviewUi(ui: PreviewUi = PREVIEW_UI): PreviewUi {
    return ui === "shell" && shellDir === null ? "classic" : ui
}

export function previewUrl(
    port: number,
    sessionId: string,
    ui: PreviewUi = PREVIEW_UI,
): string {
    const path = activePreviewUi(ui) === "shell" ? "/shell/" : ""
    return `http://localhost:${port}${path}?mcp=${sessionId}`
}

/**
 * The draw.io version the fetch script stamps into the copy. It is part of
 * every file's ETag: an install that keeps the archive's dates (npm does
 * not) would otherwise hand out the old ETag for a changed file of the
 * same size after an upgrade.
 */
function readDrawioVersion(dir: string | null): string {
    if (!dir) return ""
    try {
        return readFileSync(join(dir, ".version"), "utf8").trim()
    } catch {
        return ""
    }
}

/**
 * Whether the preview embeds draw.io from its own origin (the bundled copy),
 * which lets the page call the editor directly. False with DRAWIO_BASE_URL,
 * or when the bundled copy is missing.
 */
export function isSameOriginDrawio(): boolean {
    return !EXTERNAL_DRAWIO && drawioDir !== null
}

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

/**
 * Give a session whose state is gone (it expired, or the MCP process
 * restarted) its auto-saved diagram back. The MCP tools call this before
 * they read the state, so they never build on an older copy and then
 * overwrite the file. Not a change worth saving again.
 */
export function restoreSavedSession(sessionId: string): void {
    if (stateStore.has(sessionId) || !isValidSessionId(sessionId)) return
    const saved = savedStateLoader?.(sessionId)
    if (saved) setState(sessionId, saved, undefined, false, false)
}

function ensureSessionStateInitialized(sessionId: string): void {
    if (!isValidSessionId(sessionId)) return
    restoreSavedSession(sessionId)
    if (stateStore.has(sessionId)) return

    // Not a change worth saving: the browser fills it on its next push
    // A blank diagram keeps the draw.io spinner (spin=1) from waiting
    // forever when no load(xml) is ever sent
    setState(sessionId, BLANK_MXFILE, undefined, false, false)
    // Nothing is known about this session: a tab that still shows it keeps
    // its diagram
    const state = stateStore.get(sessionId)
    if (state) state.blank = true
}

interface SessionState {
    xml: string
    version: number
    // Made when the state is created (first use, or again after it expired
    // or the MCP process restarted) and kept by every write. A tab tells by
    // it that the server lost what it knew, and every push names the state
    // it was based on, so one based on a lost state is refused.
    stateId: string
    // Created blank because nothing was saved; cleared by the first write
    blank?: boolean
    // Version of the last write the browser did not make itself (AI edit,
    // restore). A browser push based on an older version is rejected.
    serverVersion?: number
    // The XML of that write: what a thumbnail taken after loading it shows
    serverXml?: string
    // The browser saved a change of the user's since that write (a sync
    // reply is no change)
    userEdited?: boolean
    lastUpdated: Date
    lastPolled?: number // Last browser poll; an open tab keeps the session alive
    svg?: string // Cached SVG from last browser save
    syncRequested?: number // Timestamp when sync requested, cleared when browser responds
    exportFormat?: ExportFormat // Set by MCP tool to request browser export
    exportXml?: string // Single-page projection to load before a page-targeted export
    exportOptions?: ExportOptions // Extra draw.io export parameters
    exportId?: string // Random id of the pending export, echoed with its result
    exportData?: string // Base64/SVG data returned by browser after export
    selectionId?: string // Random id of the pending get_selection request
    selection?: SelectionAnswer // The page's answer to it
}

/** draw.io export formats; xmlsvg is an SVG with the diagram embedded */
export type ExportFormat = "png" | "svg" | "xmlsvg"

/**
 * draw.io's export takes these directly: width caps the image size (never
 * upscales), pageId renders a page other than the one on screen (both PNG
 * only), border is the margin, background the color behind a page that has
 * none, transparent leaves a PNG without any.
 */
export interface ExportOptions {
    width?: number
    pageId?: string
    border?: number
    background?: string
    transparent?: boolean
}

const stateStore = new Map<string, SessionState>()

// The file each session's diagram was opened from or last saved to
// (load_diagram, export_diagram), named in the preview's header, and
// whether the diagram changed since (the file changes only on export);
// none: a new diagram that is in no file yet
const sessionFiles = new Map<string, { path: string; changed: boolean }>()

/** changed: the diagram moved on while the file was written */
export function setSessionFile(
    sessionId: string,
    path: string | null,
    changed = false,
): void {
    if (path) sessionFiles.set(sessionId, { path, changed })
    else sessionFiles.delete(sessionId)
}

// Every change of each session's diagram (AI writes and the user's edits),
// so an export can tell whether one came in while it ran
const changeCounts = new Map<string, number>()

export function changeCount(sessionId: string): number {
    return changeCounts.get(sessionId) ?? 0
}

function markFileChanged(sessionId: string): void {
    changeCounts.set(sessionId, changeCount(sessionId) + 1)
    const file = sessionFiles.get(sessionId)
    if (file) file.changed = true
}

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
        stateId: existing?.stateId ?? randomUUID(),
        serverVersion: fromBrowser ? existing?.serverVersion : newVersion,
        serverXml: fromBrowser ? existing?.serverXml : xml,
        userEdited: fromBrowser ? existing?.userEdited : false,
        lastUpdated: new Date(),
        lastPolled: existing?.lastPolled,
        // The image of this XML, never an older one's: a write without an
        // image (AI write, sync reply) leaves none until the browser sends
        // it, unless it is the same XML
        svg:
            svg ||
            (existing && existing.xml === xml ? existing.svg : undefined),
        syncRequested: undefined, // Clear sync request when browser pushes state
        exportFormat: existing?.exportFormat, // Preserve pending export request
        exportXml: existing?.exportXml, // Preserve pending projection
        exportOptions: existing?.exportOptions,
        exportId: existing?.exportId,
        exportData: existing?.exportData, // Preserve export result
        selectionId: existing?.selectionId, // Preserve pending selection request
        selection: existing?.selection,
    })
    log.debug(`State updated: session=${sessionId}, version=${newVersion}`)
    // An AI write or a restore; the browser's pushes are told apart where
    // they arrive (a sync reply is no change)
    if (notify && !fromBrowser && existing?.xml !== xml) {
        markFileChanged(sessionId)
    }
    if (notify) stateListener?.(sessionId, xml)
    return newVersion
}

/**
 * Keep the session's diagram in History before a write replaces it.
 * Nothing to keep when the browser saved no change of the user's since the
 * last server write and History ends with that write: the state is that
 * write, or draw.io's own copy of it from a sync (other text, same diagram).
 */
export function keepInHistory(sessionId: string, xml: string, svg = ""): void {
    const state = stateStore.get(sessionId)
    const last = getHistory(sessionId).at(-1)
    if (state && !state.userEdited && last && last.xml === state.serverXml) {
        return
    }
    addHistory(sessionId, xml, svg, state?.userEdited ? "user" : undefined)
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
    // export that timed out is not taken for this one. Random rather than
    // counted: a counter restarts with the process, and the page retries a
    // result refused with 403 against the process that took over the port
    state.exportId = randomUUID()
    return true
}

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

/**
 * Ask the preview tab which cells the user has selected (the get_selection
 * tool). Answered through the poll like an export: the tab sees selectionId
 * in GET /api/state and POSTs its reading with that id. Returns false when
 * the session is unknown.
 */
export function requestSelection(sessionId: string): boolean {
    const state = stateStore.get(sessionId)
    if (!state) return false
    state.selection = undefined
    // Random, as exportId: a late answer to an earlier request, or one meant
    // for the process that had this port before, is not taken for this one
    state.selectionId = randomUUID()
    return true
}

/** The tab's answer to the pending selection request, or null in time */
export async function waitForSelection(
    sessionId: string,
    timeoutMs = 10000,
): Promise<SelectionAnswer | null> {
    const start = Date.now()
    let answer: SelectionAnswer | undefined
    while (Date.now() - start < timeoutMs) {
        // Re-read the store entry each tick: setState replaces it
        answer = stateStore.get(sessionId)?.selection
        if (answer) break
        await new Promise((r) => setTimeout(r, 100))
    }
    const state = stateStore.get(sessionId)
    if (state) {
        state.selection = undefined
        state.selectionId = undefined
    }
    if (!answer) log.warn(`Selection timeout for session=${sessionId}`)
    return answer ?? null
}

// One selection slot per session, as the export slot: overlapping
// get_selection calls take turns instead of replacing each other's request
let selectionQueue: Promise<unknown> = Promise.resolve()

/** requestSelection + waitForSelection, one call at a time; null when the
 * session is unknown or the tab does not answer in time */
export function readSelection(
    sessionId: string,
    timeoutMs = 10000,
): Promise<SelectionAnswer | null> {
    const run = selectionQueue.then(() => {
        if (!requestSelection(sessionId)) return null
        return waitForSelection(sessionId, timeoutMs)
    })
    selectionQueue = run.catch(() => {})
    return run
}

/**
 * What the version cards depend on: History's entries (their count and the
 * newest id) and the entry the canvas shows. The shell reads History again
 * only when this changes, so a hand edit (a new version, the same History)
 * costs no download of every entry
 */
function historyKeyOf(sessionId: string, state?: SessionState): string {
    const history = getHistory(sessionId)
    const current =
        state && history.length > 0
            ? currentEntryId(sessionId, state.xml)
            : null
    return `${history.length}:${history.at(-1)?.id ?? -1}:${current}`
}

/** POST /api/state with a selection: the tab's answer to requestSelection */
function handleSelectionResult(
    sessionId: string,
    data: { selectionId?: unknown; selection?: unknown },
): void {
    const state = stateStore.get(sessionId)
    // Only the pending request's answer (none pending: none is taken)
    if (!state?.selectionId || data.selectionId !== state.selectionId) {
        log.debug(`Ignored a late selection answer for session=${sessionId}`)
        return
    }
    const answer = parseSelectionAnswer(data.selection)
    if (!answer) return
    state.selection = answer
    state.selectionId = undefined
    log.debug(`Selection received for session=${sessionId}`)
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
            if (!EXTERNAL_DRAWIO && drawioDir === null) {
                log.warn(
                    "No bundled draw.io (dist/drawio missing); the preview loads it from embed.diagrams.net",
                )
            }
            if (PREVIEW_UI === "shell" && activePreviewUi() === "classic") {
                log.warn(
                    "The canvas shell is not built (dist/shell missing); start_session opens the classic page",
                )
            }
            resolve(port)
        })
    })
}

function stopHttpServer(): void {
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
            sessionFiles.delete(sessionId)
            changeCounts.delete(sessionId)
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

// Serve only requests addressed to localhost, sent by the preview page
// itself (Origin is the address it was opened at, the Host) or by a
// non-browser client (no Origin header). This blocks DNS rebinding, other
// websites, and pages on other localhost ports, whose plain text POSTs need
// no CORS preflight.
function isLocalRequest(req: http.IncomingMessage): boolean {
    const host = req.headers.host ?? ""
    const origin = req.headers.origin
    return (
        /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) &&
        (origin === undefined || origin === `http://${host}`)
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
        res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Drawio-Token",
        )
    }

    if (req.method === "OPTIONS") {
        res.writeHead(204)
        res.end()
        return
    }

    if (url.pathname.startsWith("/drawio/")) {
        serveStaticFile(
            req,
            res,
            drawioDir,
            url.pathname.slice("/drawio/".length),
            drawioVersion,
        )
        return
    }

    if (url.pathname === "/shell") {
        res.writeHead(302, { Location: `/shell/${url.search}` })
        res.end()
        return
    }
    if (url.pathname.startsWith("/shell/")) {
        const rest = url.pathname.slice("/shell/".length)
        if (rest === "" || rest === "index.html") {
            servePage(req, res, url, "/shell/", getShellPage)
        } else {
            serveStaticFile(req, res, shellDir, rest, PACKAGE_VERSION)
        }
        return
    }

    if (
        url.pathname.startsWith("/api/") &&
        req.headers["x-drawio-token"] !== API_TOKEN
    ) {
        res.writeHead(403)
        res.end("Forbidden")
        return
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
        servePage(req, res, url, "/", getHtmlPage)
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

/**
 * A preview page (the classic one at "/", the shell at "/shell/") for the
 * session in ?mcp=<id>; without one, the most recent session's.
 */
function servePage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    pagePath: string,
    render: (sessionId: string) => string | null,
): void {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405)
        res.end("Method Not Allowed")
        return
    }
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
                Location: `${pagePath}?mcp=${encodeURIComponent(recentSessionId)}`,
            })
            res.end()
            return
        }
    }

    const html = render(sessionId)
    if (html === null) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        res.end(
            "The canvas shell is not built (dist/shell is missing); run npm run build in packages/mcp-server",
        )
        return
    }
    ensureSessionStateInitialized(sessionId)

    // The page holds this process's token: never served from a cache
    res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...HTML_SECURITY_HEADERS,
    })
    res.end(req.method === "HEAD" ? undefined : html)
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
                stateId: state?.stateId ?? null,
                blank: !!state?.blank,
                syncRequested: !!state?.syncRequested,
                exportFormat: state?.exportFormat || null,
                exportXml: state?.exportXml || null,
                exportOptions: state?.exportOptions || null,
                exportId: state?.exportId ?? null,
                selectionId: state?.selectionId ?? null,
                historyKey: historyKeyOf(sessionId, state),
                file: sessionFiles.get(sessionId)?.path ?? null,
                fileChanged: sessionFiles.get(sessionId)?.changed ?? false,
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

                // The tab is answering a selection request (get_selection)
                if (data.selection !== undefined) {
                    handleSelectionResult(sessionId, data)
                    res.writeHead(200, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ success: true }))
                    return
                }

                // A push can come before the tab's first poll after a
                // restart: recover the saved file first, so it is compared
                // with that and never overwrites it unseen
                ensureSessionStateInitialized(sessionId)
                const current = stateStore.get(sessionId)

                // A tab of this version names the state its push is based
                // on. Another state (the server lost the one it knew, or
                // the tab has not polled yet): refused, and the tab's next
                // poll decides whose diagram wins.
                if (current && "stateId" in data) {
                    if (data.stateId !== current.stateId) {
                        res.writeHead(409, {
                            "Content-Type": "application/json",
                        })
                        res.end(
                            JSON.stringify({ error: "Session was recreated" }),
                        )
                        return
                    }
                    // What a recovering tab showed: kept in history only
                    if (data.source === "recover") {
                        const saved =
                            typeof data.xml === "string" &&
                            !!data.xml &&
                            data.xml !== current.xml
                        if (saved) {
                            addHistory(
                                sessionId,
                                data.xml,
                                data.svg || "",
                                "recover",
                            )
                            // Saved with the History, as after any change
                            stateListener?.(sessionId, current.xml)
                        }
                        res.writeHead(409, {
                            "Content-Type": "application/json",
                        })
                        res.end(
                            JSON.stringify({
                                error: "Diagram changed on the server",
                                savedToHistory: saved,
                            }),
                        )
                        return
                    }
                }

                // The browser edited a version older than the latest AI write
                // (it has not loaded that write yet). Keep the AI write; the
                // browser loads it on its next poll. A sync reply is also
                // stale after a newer write of the browser's own (a user
                // edit saved while the export ran).
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
                        addHistory(sessionId, data.xml, data.svg || "", "user")
                        savedToHistory = true
                        if (current) stateListener?.(sessionId, current.xml)
                    }
                    res.writeHead(409, { "Content-Type": "application/json" })
                    res.end(
                        JSON.stringify({
                            error: "Diagram changed on the server",
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
                const saved = stateStore.get(sessionId)
                if (saved && data.source !== "sync") {
                    saved.userEdited = true
                    markFileChanged(sessionId)
                }
                res.writeHead(200, { "Content-Type": "application/json" })
                res.end(
                    JSON.stringify({
                        success: true,
                        version,
                        historyKey: historyKeyOf(sessionId, saved),
                    }),
                )
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

    // The classic page reads index, id and svg; the shell's version cards
    // the rest: the document, who made it, which earlier entry it is a copy
    // of, the state the ids belong to, and the entry the canvas shows
    const history = getHistory(sessionId)
    const firstIds = firstCopyIds(sessionId)
    const state = stateStore.get(sessionId)
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
        JSON.stringify({
            entries: history.map((entry, i) => ({
                index: i,
                id: entry.id,
                svg: entry.svg,
                xml: entry.xml,
                source: entry.source ?? null,
                firstId: firstIds.get(entry.id),
            })),
            count: history.length,
            stateId: state?.stateId ?? null,
            currentId: state ? currentEntryId(sessionId, state.xml) : null,
        }),
    )
}

/**
 * Put a History entry back on the canvas (the preview page's Restore button
 * and the restore_version tool). Returns the new version, or null when the
 * entry is unknown.
 */
export function restoreHistoryEntry(
    sessionId: string,
    entryId: number,
): number | null {
    const entry = getHistoryEntry(sessionId, entryId)
    if (!entry) return null

    // Edits in the browser since the last entry are not in history
    // yet: keep them, so the restore can be undone
    // (any state besides a blank page; a cleared document with its
    // own pages counts)
    const current = stateStore.get(sessionId)
    if (
        current &&
        contentFingerprint(current.xml) !== contentFingerprint(BLANK_MXFILE)
    ) {
        keepInHistory(sessionId, current.xml, current.svg)
    }
    const newVersion = setState(sessionId, entry.xml)
    addHistory(sessionId, entry.xml, entry.svg, "restore")

    log.info(`Restored session ${sessionId} to history entry ${entryId}`)
    return newVersion
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
            const data = JSON.parse(body)
            const { sessionId, id } = data
            if (!sessionId || typeof id !== "number") {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "sessionId and id required" }))
                return
            }
            // Picked from the list of a state the server has since lost
            // (a restart reloads History under new ids), or before the tab
            // knew the state. A tab of an older version sends none.
            const current = stateStore.get(sessionId)
            if (
                current &&
                "stateId" in data &&
                data.stateId !== current.stateId
            ) {
                res.writeHead(409, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Session was recreated" }))
                return
            }

            if (restoreHistoryEntry(sessionId, id) === null) {
                res.writeHead(404, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Entry not found" }))
                return
            }

            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ success: true }))
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
            const { sessionId, svg, stateId, version } = JSON.parse(body)
            if (!sessionId || !svg) {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "sessionId and svg required" }))
                return
            }

            // The browser took it of the server write it loaded, named by
            // the state and version. One that arrives after the next server
            // write, or for a state since lost, is dropped; a browser write
            // since (a sync reply) leaves that write's image valid.
            const state = stateStore.get(sessionId)
            if (
                state &&
                state.stateId === stateId &&
                state.serverVersion === version &&
                state.serverXml !== undefined
            ) {
                updateLastHistorySvg(sessionId, svg, state.serverXml)
                if (state.xml === state.serverXml) state.svg = svg
            }
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ success: true }))
        } catch {
            res.writeHead(400, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Invalid JSON" }))
        }
    })
}

// Pages may be framed only by this origin, and nothing is content-sniffed
const HTML_SECURITY_HEADERS = {
    "Content-Security-Policy": "frame-ancestors 'self'",
    "X-Content-Type-Options": "nosniff",
}

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "text/xml; charset=utf-8",
    ".json": "application/json",
    ".ico": "image/x-icon",
    ".wasm": "application/wasm",
}

/**
 * GET /drawio/<path> or /shell/<path>: a file of the bundled draw.io copy or
 * of the built shell. `stamp` names the files' version in their ETags.
 */
function serveStaticFile(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    dir: string | null,
    rawPath: string,
    stamp: string,
): void {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405)
        res.end("Method Not Allowed")
        return
    }
    let rel: string
    try {
        rel = decodeURIComponent(rawPath)
    } catch {
        res.writeHead(400)
        res.end("Bad Request")
        return
    }
    // One normalized path inside the directory; the war's server-side parts
    // are never served, whatever was extracted
    const normalized = posix.normalize(rel)
    const file = dir ? resolve(dir, normalized) : null
    if (
        !dir ||
        !file ||
        /[\\\0]/.test(rel) ||
        /(^|\/)(WEB-INF|META-INF)(\/|$)/i.test(normalized) ||
        !file.startsWith(dir + sep)
    ) {
        res.writeHead(404)
        res.end("Not Found")
        return
    }
    let size: number
    let etag: string
    try {
        const stat = statSync(file)
        if (!stat.isFile()) throw new Error("not a file")
        size = stat.size
        etag = `"${stamp}-${size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
    } catch {
        res.writeHead(404)
        res.end("Not Found")
        return
    }
    // The file names do not change between draw.io versions, so the browser
    // may keep a copy but asks before using it (a 304 from localhost is
    // cheap); after a package upgrade the next preview gets the new files
    const cacheHeaders = {
        ETag: etag,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
    }
    if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, cacheHeaders)
        res.end()
        return
    }
    const ext = extname(file).toLowerCase()
    res.writeHead(200, {
        ...cacheHeaders,
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Content-Length": size,
        ...(ext === ".html" ? HTML_SECURITY_HEADERS : {}),
    })
    if (req.method === "HEAD") {
        res.end()
        return
    }
    // pipeline closes both ends when either fails or goes away (a tab closed
    // mid-download), so no file handle leaks and no error goes unhandled; a
    // client that left early is routine, not worth a log line
    pipeline(createReadStream(file), res, () => {})
}

/** Where the iframe loads the editor from (without its query) */
function drawioEditorUrl(): string {
    return isSameOriginDrawio()
        ? "/drawio/index.html"
        : `${normalizeUrl(DRAWIO_BASE_URL)}/`
}

// The preview page lives in src/preview (the build copies it to dist/preview)
const PREVIEW_DIR = join(HERE, "preview")
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

/** JSON that is safe inside a <script> element ("<" escaped) */
const scriptJson = (value: unknown) =>
    JSON.stringify(value).replace(/</g, "\\u003c")

/**
 * The editor settings the host config fixes: theme (DRAWIO_UI), language
 * (DRAWIO_LANG) and dark mode (DRAWIO_DARK). ui and lang are "" unless set,
 * because draw.io hides its Extras > Language / Theme submenu once they
 * are given.
 */
function hostDrawioSettings(env: NodeJS.ProcessEnv): {
    ui: string
    lang: string
    dark: "dark" | "light" | "auto"
} {
    const ui = (env.DRAWIO_UI ?? "").toLowerCase()
    const dark = (env.DRAWIO_DARK ?? "").toLowerCase()
    const lang = toDrawioLang(env.DRAWIO_LANG ?? "")
    return {
        ui: isDrawioTheme(ui) ? ui : "",
        lang: /^[a-z]{2,3}(-[a-z]{2,4})?$/.test(lang) ? lang : "",
        dark: ["1", "true", "dark"].includes(dark)
            ? "dark"
            : ["0", "false", "light"].includes(dark)
              ? "light"
              : // draw.io takes ui=dark as dark mode only when no dark
                // parameter is present, and the pages always send one
                !dark && ui === "dark"
                ? "dark"
                : "auto",
    }
}

/**
 * The configurable tail of the classic page's draw.io iframe query: dark
 * mode, and the language and theme when the host config fixes them.
 */
export function drawioEmbedParams(
    env: NodeJS.ProcessEnv = process.env,
): string {
    const settings = hostDrawioSettings(env)
    const params = new URLSearchParams()
    params.set(
        "dark",
        settings.dark === "auto"
            ? "auto"
            : settings.dark === "dark"
              ? "1"
              : "0",
    )
    if (settings.lang) params.set("lang", settings.lang)
    if (settings.ui) params.set("ui", settings.ui)
    return params.toString()
}

/**
 * What the shell page gets as window.__MCP_CONFIG__ (shell/runtime-config.ts
 * reads it): the session, the API token, where draw.io comes from and the
 * host's editor settings.
 */
export function shellConfig(
    sessionId: string,
    env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
    const settings = hostDrawioSettings(env)
    return {
        sessionId,
        token: API_TOKEN,
        apiBase: "/api",
        drawioBaseUrl: drawioEditorUrl(),
        drawioUi: settings.ui,
        drawioLang: settings.lang,
        drawioDark: settings.dark,
        lang: env.DRAWIO_LANG ?? "",
    }
}

/** The shell page, or null when the shell is not built */
function getShellPage(sessionId: string): string | null {
    if (!shellDir) return null
    const template = readFileSync(join(shellDir, "index.html"), "utf8")
    return template.replace("{{CONFIG_JSON}}", () =>
        scriptJson(shellConfig(sessionId)),
    )
}

function getHtmlPage(sessionId: string): string {
    return (
        loadPreviewTemplate()
            .replace("{{SESSION_BADGE}}", () =>
                sessionId
                    ? `<span class="session">${sessionId.slice(-8)}</span>`
                    : "",
            )
            .replaceAll("{{DISABLED}}", sessionId ? "" : "disabled")
            .replace("{{DRAWIO_URL}}", () => drawioEditorUrl())
            .replace("{{DRAWIO_PARAMS}}", () => drawioEmbedParams())
            .replace("{{SESSION_JSON}}", () => scriptJson(sessionId))
            // Same origin: the page fills in its own origin
            .replace("{{ORIGIN_JSON}}", () =>
                scriptJson(isSameOriginDrawio() ? "" : DRAWIO_ORIGIN),
            )
            .replace("{{TOKEN_JSON}}", () => scriptJson(API_TOKEN))
    )
}
