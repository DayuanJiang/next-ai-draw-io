/**
 * Embedded HTTP Server for MCP
 *
 * Serves a static HTML page with draw.io embed and handles state sync.
 * This eliminates the need for an external Next.js app.
 */

import http from "node:http"
import { log } from "./logger.js"

interface SessionState {
    xml: string
    version: number
    lastUpdated: Date
}

// In-memory state store (shared with MCP server in same process)
export const stateStore = new Map<string, SessionState>()

let server: http.Server | null = null
let serverPort: number = 6002
const MAX_PORT = 6020 // Don't retry beyond this port
const SESSION_TTL = 60 * 60 * 1000 // 1 hour

/**
 * Get state for a session
 */
export function getState(sessionId: string): SessionState | undefined {
    return stateStore.get(sessionId)
}

/**
 * Set state for a session
 */
export function setState(sessionId: string, xml: string): number {
    const existing = stateStore.get(sessionId)
    const newVersion = (existing?.version || 0) + 1

    stateStore.set(sessionId, {
        xml,
        version: newVersion,
        lastUpdated: new Date(),
    })

    log.debug(`State updated: session=${sessionId}, version=${newVersion}`)
    return newVersion
}

/**
 * Start the embedded HTTP server
 */
export function startHttpServer(port: number = 6002): Promise<number> {
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
            log.info(`Embedded HTTP server running on http://localhost:${port}`)
            resolve(port)
        })
    })
}

/**
 * Stop the HTTP server
 */
export function stopHttpServer(): void {
    if (server) {
        server.close()
        server = null
    }
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions(): void {
    const now = Date.now()
    for (const [sessionId, state] of stateStore) {
        if (now - state.lastUpdated.getTime() > SESSION_TTL) {
            stateStore.delete(sessionId)
            log.info(`Cleaned up expired session: ${sessionId}`)
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000)

/**
 * Get the current server port
 */
export function getServerPort(): number {
    return serverPort
}

/**
 * Handle HTTP requests
 */
function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): void {
    const url = new URL(req.url || "/", `http://localhost:${serverPort}`)

    // CORS headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") {
        res.writeHead(204)
        res.end()
        return
    }

    // Route handling
    if (url.pathname === "/" || url.pathname === "/index.html") {
        serveHtml(req, res, url)
    } else if (
        url.pathname === "/api/state" ||
        url.pathname === "/api/mcp/state"
    ) {
        handleStateApi(req, res, url)
    } else if (
        url.pathname === "/api/health" ||
        url.pathname === "/api/mcp/health"
    ) {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ status: "ok", mcp: true }))
    } else {
        res.writeHead(404)
        res.end("Not Found")
    }
}

/**
 * Serve the HTML page with draw.io embed
 */
function serveHtml(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
): void {
    const sessionId = url.searchParams.get("mcp") || ""

    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(getHtmlPage(sessionId))
}

/**
 * Handle state API requests
 */
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

        const state = stateStore.get(sessionId)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
            JSON.stringify({
                xml: state?.xml || null,
                version: state?.version || 0,
                lastUpdated: state?.lastUpdated?.toISOString() || null,
            }),
        )
    } else if (req.method === "POST") {
        let body = ""
        req.on("data", (chunk) => {
            body += chunk
        })
        req.on("end", () => {
            try {
                const { sessionId, xml } = JSON.parse(body)
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ error: "sessionId required" }))
                    return
                }

                const version = setState(sessionId, xml)
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

/**
 * Generate the HTML page with draw.io embed
 */
function getHtmlPage(sessionId: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Draw.io MCP - ${sessionId || "No Session"}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; }
        #container { width: 100%; height: 100%; display: flex; flex-direction: column; }
        #header {
            padding: 8px 16px;
            background: #1a1a2e;
            color: #eee;
            font-family: system-ui, sans-serif;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #header .session { color: #888; font-size: 12px; }
        #header .status { font-size: 12px; }
        #header .status.connected { color: #4ade80; }
        #header .status.disconnected { color: #f87171; }
        #drawio { flex: 1; border: none; }
    </style>
</head>
<body>
    <div id="container">
        <div id="header">
            <div>
                <strong>Draw.io MCP</strong>
                <span class="session">${sessionId ? `Session: ${sessionId}` : "No MCP session"}</span>
            </div>
            <div id="status" class="status disconnected">Connecting...</div>
        </div>
        <iframe id="drawio" src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1"></iframe>
    </div>

    <script>
        const sessionId = "${sessionId}";
        const iframe = document.getElementById('drawio');
        const statusEl = document.getElementById('status');

        let currentVersion = 0;
        let isDrawioReady = false;
        let pendingXml = null;
        let lastLoadedXml = null;

        // Listen for messages from draw.io
        window.addEventListener('message', (event) => {
            if (event.origin !== 'https://embed.diagrams.net') return;

            try {
                const msg = JSON.parse(event.data);
                handleDrawioMessage(msg);
            } catch (e) {
                // Ignore non-JSON messages
            }
        });

        function handleDrawioMessage(msg) {
            if (msg.event === 'init') {
                isDrawioReady = true;
                statusEl.textContent = 'Ready';
                statusEl.className = 'status connected';

                // Load pending XML if any
                if (pendingXml) {
                    loadDiagram(pendingXml);
                    pendingXml = null;
                }
            } else if (msg.event === 'save') {
                // User saved - push to state
                if (msg.xml && msg.xml !== lastLoadedXml) {
                    pushState(msg.xml);
                }
            } else if (msg.event === 'export') {
                // Export completed
                if (msg.data) {
                    pushState(msg.data);
                }
            } else if (msg.event === 'autosave') {
                // Autosave - push to state
                if (msg.xml && msg.xml !== lastLoadedXml) {
                    pushState(msg.xml);
                }
            }
        }

        function loadDiagram(xml) {
            if (!isDrawioReady) {
                pendingXml = xml;
                return;
            }

            lastLoadedXml = xml;
            iframe.contentWindow.postMessage(JSON.stringify({
                action: 'load',
                xml: xml,
                autosave: 1
            }), '*');
        }

        async function pushState(xml) {
            if (!sessionId) return;

            try {
                const response = await fetch('/api/state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, xml })
                });

                if (response.ok) {
                    const result = await response.json();
                    currentVersion = result.version;
                    lastLoadedXml = xml;
                }
            } catch (e) {
                console.error('Failed to push state:', e);
            }
        }

        async function pollState() {
            if (!sessionId) return;

            try {
                const response = await fetch('/api/state?sessionId=' + encodeURIComponent(sessionId));
                if (!response.ok) return;

                const state = await response.json();

                if (state.version && state.version > currentVersion && state.xml) {
                    currentVersion = state.version;
                    loadDiagram(state.xml);
                }
            } catch (e) {
                console.error('Failed to poll state:', e);
            }
        }

        // Start polling if we have a session
        if (sessionId) {
            pollState();
            setInterval(pollState, 2000);
        }
    </script>
</body>
</html>`
}
