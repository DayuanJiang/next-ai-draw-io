/**
 * Embedded HTTP Server for MCP
 * Serves draw.io embed with state sync and history UI
 */

import http from "node:http"
import {
    addHistory,
    clearHistory,
    getHistory,
    getHistoryEntry,
    updateLastHistorySvg,
} from "./history.js"
import { log } from "./logger.js"

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

// Minimal blank diagram used to bootstrap new sessions.
// This avoids the draw.io embed spinner (spin=1) getting stuck when no `load(xml)` is ever sent.
const DEFAULT_DIAGRAM_XML = `<mxfile host="app.diagrams.net"><diagram id="blank" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`

// Normalize URL for iframe src - ensure no double slashes
function normalizeUrl(url: string): string {
    // Remove trailing slash to avoid double slashes
    return url.replace(/\/$/, "")
}

function isLikelyMcpSessionId(sessionId: string): boolean {
    // Keep this cheap and conservative to avoid creating state for arbitrary IDs.
    return sessionId.startsWith("mcp-") && sessionId.length <= 128
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
    if (!isLikelyMcpSessionId(sessionId)) return
    if (stateStore.has(sessionId)) return

    setState(sessionId, DEFAULT_DIAGRAM_XML)
}

interface SessionState {
    xml: string
    version: number
    lastUpdated: Date
    svg?: string // Cached SVG from last browser save
    syncRequested?: number // Timestamp when sync requested, cleared when browser responds
}

export const stateStore = new Map<string, SessionState>()

let server: http.Server | null = null
let serverPort = 6002
const MAX_PORT = 6020
const SESSION_TTL = 60 * 60 * 1000

export function getState(sessionId: string): SessionState | undefined {
    return stateStore.get(sessionId)
}

export function setState(sessionId: string, xml: string, svg?: string): number {
    const existing = stateStore.get(sessionId)
    const newVersion = (existing?.version || 0) + 1
    stateStore.set(sessionId, {
        xml,
        version: newVersion,
        lastUpdated: new Date(),
        svg: svg || existing?.svg, // Preserve cached SVG if not provided
        syncRequested: undefined, // Clear sync request when browser pushes state
    })
    log.debug(`State updated: session=${sessionId}, version=${newVersion}`)
    return newVersion
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

        server.listen(port, () => {
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
        if (now - state.lastUpdated.getTime() > SESSION_TTL) {
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
    const url = new URL(req.url || "/", `http://localhost:${serverPort}`)

    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") {
        res.writeHead(204)
        res.end()
        return
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
        const sessionId = url.searchParams.get("mcp") || ""

        // Auto-redirect to most recent session if no sessionId provided
        if (!sessionId) {
            const recentSessionId = getMostRecentSessionId()
            if (recentSessionId) {
                res.writeHead(302, { Location: `/?mcp=${recentSessionId}` })
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
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
            JSON.stringify({
                xml: state?.xml || null,
                version: state?.version || 0,
                syncRequested: !!state?.syncRequested,
            }),
        )
    } else if (req.method === "POST") {
        let body = ""
        req.on("data", (chunk) => {
            body += chunk
        })
        req.on("end", () => {
            try {
                const { sessionId, xml, svg } = JSON.parse(body)
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ error: "sessionId required" }))
                    return
                }
                const version = setState(sessionId, xml, svg)
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
            entries: history.map((entry, i) => ({ index: i, svg: entry.svg })),
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

    let body = ""
    req.on("data", (chunk) => {
        body += chunk
    })
    req.on("end", () => {
        try {
            const { sessionId, index } = JSON.parse(body)
            if (!sessionId || index === undefined) {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(
                    JSON.stringify({ error: "sessionId and index required" }),
                )
                return
            }

            const entry = getHistoryEntry(sessionId, index)
            if (!entry) {
                res.writeHead(404, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Entry not found" }))
                return
            }

            const newVersion = setState(sessionId, entry.xml)
            addHistory(sessionId, entry.xml, entry.svg)

            log.info(`Restored session ${sessionId} to index ${index}`)

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

    let body = ""
    req.on("data", (chunk) => {
        body += chunk
    })
    req.on("end", () => {
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

function getHtmlPage(sessionId: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Next AI Draw.io</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; }
        #container { width: 100%; height: 100%; display: flex; flex-direction: column; }
        #header {
            padding: 0 20px; height: 52px;
            background: linear-gradient(to bottom, #ffffff, #fafbfc);
            border-bottom: 1px solid #e8ecf0;
            font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
            display: flex; justify-content: space-between; align-items: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            position: relative; z-index: 10;
        }
        #header .brand {
            display: flex; align-items: center; gap: 10px;
        }
        #header .logo {
            width: 28px; height: 28px; border-radius: 6px;
            background: #18181b;
            display: flex; align-items: center; justify-content: center;
            overflow: hidden;
        }
        #header .logo img { width: 20px; height: 20px; filter: brightness(0) invert(1); }
        #header .title {
            font-size: 15px; font-weight: 600; color: #1a1a2e;
            letter-spacing: -0.3px;
        }
        #header .session {
            font-size: 11px; color: #8b95a5; font-weight: 400;
            background: #f1f3f9; padding: 3px 8px; border-radius: 4px;
            margin-left: 12px; font-family: 'SF Mono', Monaco, monospace;
        }
        #header .right { display: flex; align-items: center; gap: 12px; }
        #save-btn {
            display: flex; align-items: center; gap: 6px;
            padding: 7px 14px; border-radius: 8px; font-size: 13px;
            background: linear-gradient(to bottom, #18181b, #27272a);
            color: white; border: none; cursor: pointer;
            font-weight: 500; font-family: inherit;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1);
            transition: all 0.15s ease;
        }
        #save-btn svg { width: 14px; height: 14px; }
        #save-btn:hover {
            background: linear-gradient(to bottom, #27272a, #3f3f46);
            transform: translateY(-1px);
            box-shadow: 0 3px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        #save-btn:active { transform: translateY(0); }
        #save-btn:disabled, #history-btn:disabled {
            background: #e5e7eb; color: #9ca3af;
            cursor: not-allowed; transform: none; box-shadow: none;
        }
        #history-btn {
            display: flex; align-items: center; gap: 6px;
            padding: 7px 14px; border-radius: 8px; font-size: 13px;
            background: #f4f4f5; color: #3f3f46; border: 1px solid #e4e4e7;
            cursor: pointer; font-weight: 500; font-family: inherit;
            transition: all 0.15s ease;
        }
        #history-btn svg { width: 14px; height: 14px; }
        #history-btn:hover {
            background: #e4e4e7; border-color: #d4d4d8;
        }
        #drawio { flex: 1; border: none; }
        #history-modal, #save-modal {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
            z-index: 2000; align-items: center; justify-content: center;
        }
        #history-modal.open, #save-modal.open { display: flex; }
        .modal-content {
            background: white; border-radius: 16px;
            width: 90%; max-width: 480px; max-height: 70vh;
            display: flex; flex-direction: column;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
            animation: modalIn 0.2s ease-out;
        }
        @keyframes modalIn {
            from { opacity: 0; transform: scale(0.95) translateY(-10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal-header {
            padding: 20px 24px 16px; border-bottom: 1px solid #f1f3f5;
        }
        .modal-header h2 {
            font-size: 17px; font-weight: 600; margin: 0; color: #18181b;
            letter-spacing: -0.3px;
        }
        .modal-body { flex: 1; overflow-y: auto; padding: 20px 24px; }
        .modal-footer {
            padding: 16px 24px; border-top: 1px solid #f1f3f5;
            display: flex; gap: 10px; justify-content: flex-end;
        }
        .history-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .history-item {
            border: 2px solid #e4e4e7; border-radius: 10px; padding: 10px;
            cursor: pointer; text-align: center; transition: all 0.15s ease;
            background: #fafafa;
        }
        .history-item:hover { border-color: #a1a1aa; background: white; }
        .history-item.selected {
            border-color: #18181b; background: white;
            box-shadow: 0 0 0 3px rgba(24,24,27,0.1);
        }
        .history-item .thumb {
            aspect-ratio: 4/3; background: #f4f4f5; border-radius: 6px;
            display: flex; align-items: center; justify-content: center;
            margin-bottom: 6px; overflow: hidden;
        }
        .history-item .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .history-item .label { font-size: 11px; color: #71717a; font-weight: 500; }
        .btn {
            padding: 9px 18px; border-radius: 8px; font-size: 13px;
            cursor: pointer; border: none; font-weight: 500;
            font-family: inherit; transition: all 0.15s ease;
        }
        .btn-primary {
            background: linear-gradient(to bottom, #18181b, #27272a);
            color: white;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .btn-primary:hover {
            background: linear-gradient(to bottom, #27272a, #3f3f46);
            transform: translateY(-1px);
        }
        .btn-primary:disabled {
            background: #e4e4e7; color: #a1a1aa;
            cursor: not-allowed; transform: none; box-shadow: none;
        }
        .btn-secondary {
            background: #f4f4f5; color: #3f3f46; border: 1px solid #e4e4e7;
        }
        .btn-secondary:hover { background: #e4e4e7; }
        .empty { text-align: center; padding: 40px; color: #71717a; font-size: 14px; }
        .form-group { margin-bottom: 18px; }
        .form-group label {
            display: block; font-size: 13px; font-weight: 500;
            margin-bottom: 8px; color: #3f3f46;
        }
        .form-group select, .form-group input {
            width: 100%; padding: 10px 14px; border: 1px solid #e4e4e7;
            border-radius: 8px; font-size: 14px; outline: none;
            font-family: inherit; background: white;
            transition: all 0.15s ease;
        }
        .form-group select:focus, .form-group input:focus {
            border-color: #18181b;
            box-shadow: 0 0 0 3px rgba(24,24,27,0.08);
        }
        .filename-group { display: flex; }
        .filename-group input { border-radius: 8px 0 0 8px; border-right: none; }
        .filename-group .ext {
            padding: 10px 14px; background: #f4f4f5; border: 1px solid #e4e4e7;
            border-radius: 0 8px 8px 0; font-size: 13px; color: #71717a;
            font-family: 'SF Mono', Monaco, monospace;
        }
    </style>
</head>
<body>
    <div id="container">
        <div id="header">
            <div class="brand">
                <div class="logo">
                    <svg viewBox="0 0 1536 1536" fill="#ffffff">
                        <g transform="translate(0,1536) scale(0.1,-0.1)">
                            <path d="M2765 14404 c-100 -29 -181 -58 -225 -82 -227 -125 -359 -296 -431 -560 -19 -70 -19 -108 -19 -1175 0 -1068 1 -1104 20 -1172 58 -206 159 -356 319 -474 71 -53 199 -121 226 -121 9 0 26 -5 38 -12 12 -6 62 -19 112 -29 85 -17 207 -18 2219 -19 1172 0 2133 -3 2138 -8 4 -4 7 -246 6 -538 l-3 -529 -2330 -5 c-2506 -6 -2373 -3 -2470 -54 -61 -31 -150 -113 -194 -178 -87 -128 -82 -77 -90 -1025 l-6 -838 -360 -6 c-292 -4 -368 -8 -405 -21 -194 -68 -303 -177 -373 -372 l-22 -61 1 -2887 c1 -2716 2 -2890 18 -2935 56 -153 161 -276 286 -334 126 -59 0 -54 1400 -54 1394 0 1290 -4 1410 53 95 45 198 148 242 241 62 133 58 -93 58 3026 0 2992 1 2883 -40 2990 -59 156 -183 272 -360 337 -25 9 -146 14 -440 18 l-405 5 0 540 0 540 2020 3 c1111 1 2030 0 2043 -3 l22 -5 -2 -538 -3 -537 -380 -6 c-312 -4 -388 -8 -426 -21 -195 -68 -326 -204 -383 -399 -15 -51 -16 -295 -16 -2921 0 -2778 1 -2867 19 -2920 36 -104 72 -167 134 -230 75 -78 115 -105 222 -151 l50 -22 1219 -3 c672 -1 1255 1 1300 6 109 12 217 63 298 140 73 69 107 118 144 208 l29 69 3 2880 c2 2687 1 2884 -15 2945 -48 183 -188 332 -373 398 -37 13 -114 17 -430 21 l-385 6 -3 534 c-2 421 0 536 10 543 7 4 925 8 2039 8 1718 0 2028 -2 2038 -14 8 -10 11 -154 11 -531 -1 -284 -4 -523 -7 -531 -4 -12 -69 -14 -392 -14 -354 0 -391 -2 -448 -20 -168 -52 -282 -148 -353 -295 -22 -45 -40 -91 -40 -103 0 -11 -5 -33 -10 -47 -7 -18 -10 -988 -10 -2875 0 -2393 2 -2858 14 -2902 43 -167 148 -298 293 -369 57 -27 107 -44 151 -50 88 -11 2429 -11 2508 0 210 31 416 238 445 450 6 39 8 1245 7 2926 -3 2713 -4 2862 -21 2900 -41 93 -74 150 -110 191 -46 52 -149 134 -169 134 -8 0 -19 5 -24 10 -6 6 -42 19 -80 30 -63 18 -100 20 -415 20 -307 0 -348 2 -353 16 -3 9 -6 390 -6 848 0 797 -1 834 -19 886 -31 87 -50 118 -111 183 -66 70 -141 119 -221 144 -50 16 -228 18 -2389 23 l-2335 5 0 535 0 535 2165 5 c1191 3 2170 8 2176 12 6 4 35 12 65 17 201 35 435 198 539 376 55 93 82 153 110 245 19 63 20 94 20 1167 0 1047 -1 1106 -19 1180 -70 290 -275 523 -539 613 -160 54 232 50 -5028 49 -4182 0 -4856 -2 -4899 -15z"/>
                        </g>
                    </svg>
                </div>
                <span class="title">Next AI Draw.io</span>
                ${sessionId ? `<span class="session">${sessionId.slice(-8)}</span>` : ""}
            </div>
            <div class="right">
                <button id="history-btn" title="History" ${sessionId ? "" : "disabled"}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    History
                </button>
                <button id="save-btn" ${sessionId ? "" : "disabled"}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                </button>
            </div>
        </div>
        <iframe id="drawio" src="${normalizeUrl(DRAWIO_BASE_URL)}/?embed=1&proto=json&spin=1&libraries=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0"></iframe>
    </div>
    <div id="history-modal">
        <div class="modal-content">
            <div class="modal-header"><h2>History</h2></div>
            <div class="modal-body">
                <div id="history-grid" class="history-grid"></div>
                <div id="history-empty" class="empty" style="display:none;">No history yet</div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
                <button class="btn btn-primary" id="restore-btn" disabled>Restore</button>
            </div>
        </div>
    </div>
    <div id="save-modal">
        <div class="modal-content">
            <div class="modal-header"><h2>Download Diagram</h2></div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Format</label>
                    <select id="save-format">
                        <option value="drawio">Draw.io (.drawio)</option>
                        <option value="png">PNG Image (.png)</option>
                        <option value="svg">SVG Vector (.svg)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Filename</label>
                    <div class="filename-group">
                        <input type="text" id="save-filename" value="diagram" placeholder="Enter filename">
                        <span class="ext" id="save-ext">.drawio</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="save-cancel-btn">Cancel</button>
                <button class="btn btn-primary" id="save-confirm-btn">Save</button>
            </div>
        </div>
    </div>
    <script>
        const sessionId = "${sessionId}";
        const iframe = document.getElementById('drawio');
        let currentVersion = 0, isReady = false, pendingXml = null, lastXml = null;
        let pendingSvgExport = null;
        let pendingAiSvg = false;

        window.addEventListener('message', (e) => {
            if (e.origin !== '${DRAWIO_ORIGIN}') return;
            try {
                const msg = JSON.parse(e.data);
                if (msg.event === 'init') {
                    isReady = true;
                    if (pendingXml) { loadDiagram(pendingXml); pendingXml = null; }
                } else if ((msg.event === 'save' || msg.event === 'autosave') && msg.xml && msg.xml !== lastXml) {
                    // Request SVG export, then push state with SVG
                    pendingSvgExport = msg.xml;
                    iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'svg' }), '*');
                    // Fallback if export doesn't respond
                    setTimeout(() => { if (pendingSvgExport === msg.xml) { pushState(msg.xml, ''); pendingSvgExport = null; } }, 2000);
                } else if (msg.event === 'export' && msg.data) {
                    // Handle file download export (PNG/SVG only, drawio uses lastXml directly)
                    if (pendingDownload && (pendingDownload.format === 'png' || pendingDownload.format === 'svg')) {
                        const dl = pendingDownload;
                        pendingDownload = null;
                        let dataUrl = msg.data;
                        if (!dataUrl.startsWith('data:')) {
                            const mime = dl.format === 'png' ? 'image/png' : 'image/svg+xml';
                            dataUrl = 'data:' + mime + ';base64,' + btoa(unescape(encodeURIComponent(msg.data)));
                        }
                        const a = document.createElement('a');
                        a.href = dataUrl; a.download = dl.filename;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        saveModal.classList.remove('open');
                        saveConfirmBtn.disabled = false;
                        saveConfirmBtn.textContent = 'Save';
                        return;
                    }
                    // Handle sync export (XML format) - server requested fresh state
                    if (pendingSyncExport && !msg.data.startsWith('data:') && !msg.data.startsWith('<svg')) {
                        pendingSyncExport = false;
                        pushState(msg.data, '');
                        return;
                    }
                    // Handle SVG export
                    let svg = msg.data;
                    if (!svg.startsWith('data:')) svg = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
                    if (pendingSvgExport) {
                        const xml = pendingSvgExport;
                        pendingSvgExport = null;
                        pushState(xml, svg);
                    } else if (pendingAiSvg) {
                        pendingAiSvg = false;
                        fetch('/api/history-svg', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sessionId, svg })
                        }).catch(() => {});
                    }
                }
            } catch {}
        });

        function loadDiagram(xml, capturePreview = false) {
            if (!isReady) { pendingXml = xml; return; }
            lastXml = xml;
            iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', xml, autosave: 1 }), '*');
            if (capturePreview) {
                setTimeout(() => {
                    pendingAiSvg = true;
                    iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'svg' }), '*');
                }, 500);
            }
        }

        async function pushState(xml, svg = '') {
            if (!sessionId) return;
            try {
                const r = await fetch('/api/state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, xml, svg })
                });
                if (r.ok) { const d = await r.json(); currentVersion = d.version; lastXml = xml; }
            } catch (e) { console.error('Push failed:', e); }
        }

        let pendingSyncExport = false;

        async function poll() {
            if (!sessionId) return;
            try {
                const r = await fetch('/api/state?sessionId=' + encodeURIComponent(sessionId));
                if (!r.ok) return;
                const s = await r.json();
                // Handle sync request - server needs fresh state
                if (s.syncRequested && !pendingSyncExport) {
                    pendingSyncExport = true;
                    iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'xml' }), '*');
                }
                // Load new diagram from server
                if (s.version > currentVersion && s.xml) {
                    currentVersion = s.version;
                    loadDiagram(s.xml, true);
                }
            } catch {}
        }

        if (sessionId) { poll(); setInterval(poll, 2000); }

        // Save modal
        const saveBtn = document.getElementById('save-btn');
        const saveModal = document.getElementById('save-modal');
        const saveFormat = document.getElementById('save-format');
        const saveFilename = document.getElementById('save-filename');
        const saveExt = document.getElementById('save-ext');
        const saveCancelBtn = document.getElementById('save-cancel-btn');
        const saveConfirmBtn = document.getElementById('save-confirm-btn');
        let pendingDownload = null;

        const extMap = { drawio: '.drawio', png: '.png', svg: '.svg' };

        saveBtn.onclick = () => {
            if (!sessionId || !isReady) return;
            saveModal.classList.add('open');
            saveFilename.focus();
            saveFilename.select();
        };

        saveFormat.onchange = () => {
            saveExt.textContent = extMap[saveFormat.value] || '.drawio';
        };

        saveCancelBtn.onclick = () => { saveModal.classList.remove('open'); };
        saveModal.onclick = (e) => { if (e.target === saveModal) saveCancelBtn.onclick(); };

        saveConfirmBtn.onclick = () => {
            const format = saveFormat.value;
            const filename = (saveFilename.value.trim() || 'diagram') + extMap[format];
            saveConfirmBtn.disabled = true;
            saveConfirmBtn.textContent = 'Exporting...';

            if (format === 'drawio') {
                // Use lastXml directly instead of requesting export (avoids race with SVG exports)
                let xmlData = lastXml || '';
                if (xmlData && !xmlData.includes('<mxfile')) {
                    xmlData = '<mxfile host="mcp"><diagram name="Page-1">' + xmlData + '</diagram></mxfile>';
                }
                const blob = new Blob([xmlData], { type: 'application/xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                saveModal.classList.remove('open');
                saveConfirmBtn.disabled = false;
                saveConfirmBtn.textContent = 'Save';
            } else if (format === 'png') {
                pendingDownload = { format: 'png', filename };
                iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'png', scale: 2 }), '*');
                setTimeout(() => { saveConfirmBtn.disabled = false; saveConfirmBtn.textContent = 'Save'; pendingDownload = null; }, 5000);
            } else if (format === 'svg') {
                pendingDownload = { format: 'svg', filename };
                iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'svg' }), '*');
                setTimeout(() => { saveConfirmBtn.disabled = false; saveConfirmBtn.textContent = 'Save'; pendingDownload = null; }, 5000);
            }
        };

        // History UI
        const historyBtn = document.getElementById('history-btn');
        const historyModal = document.getElementById('history-modal');
        const historyGrid = document.getElementById('history-grid');
        const historyEmpty = document.getElementById('history-empty');
        const restoreBtn = document.getElementById('restore-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        let historyData = [], selectedIdx = null;

        historyBtn.onclick = async () => {
            if (!sessionId) return;
            try {
                const r = await fetch('/api/history?sessionId=' + encodeURIComponent(sessionId));
                if (r.ok) {
                    const d = await r.json();
                    historyData = d.entries || [];
                    renderHistory();
                }
            } catch {}
            historyModal.classList.add('open');
        };

        cancelBtn.onclick = () => { historyModal.classList.remove('open'); selectedIdx = null; restoreBtn.disabled = true; };
        historyModal.onclick = (e) => { if (e.target === historyModal) cancelBtn.onclick(); };

        function renderHistory() {
            if (historyData.length === 0) {
                historyGrid.style.display = 'none';
                historyEmpty.style.display = 'block';
                return;
            }
            historyGrid.style.display = 'grid';
            historyEmpty.style.display = 'none';
            historyGrid.innerHTML = historyData.map((e, i) => \`
                <div class="history-item" data-idx="\${e.index}">
                    <div class="thumb">\${e.svg ? \`<img src="\${e.svg}">\` : '#' + e.index}</div>
                    <div class="label">#\${e.index}</div>
                </div>
            \`).join('');
            historyGrid.querySelectorAll('.history-item').forEach(item => {
                item.onclick = () => {
                    const idx = parseInt(item.dataset.idx);
                    if (selectedIdx === idx) { selectedIdx = null; restoreBtn.disabled = true; }
                    else { selectedIdx = idx; restoreBtn.disabled = false; }
                    historyGrid.querySelectorAll('.history-item').forEach(el => el.classList.toggle('selected', parseInt(el.dataset.idx) === selectedIdx));
                };
            });
        }

        restoreBtn.onclick = async () => {
            if (selectedIdx === null) return;
            restoreBtn.disabled = true;
            restoreBtn.textContent = 'Restoring...';
            try {
                const r = await fetch('/api/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, index: selectedIdx })
                });
                if (r.ok) { cancelBtn.onclick(); await poll(); }
                else { alert('Restore failed'); }
            } catch { alert('Restore failed'); }
            restoreBtn.textContent = 'Restore';
        };
    </script>
</body>
</html>`
}
