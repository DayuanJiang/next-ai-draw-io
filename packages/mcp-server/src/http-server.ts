/**
 * Embedded HTTP Server for MCP
 *
 * Serves a static HTML page with draw.io embed and handles state sync.
 * This eliminates the need for an external Next.js app.
 */

import http from "node:http"
import {
    addHistoryEntry,
    clearHistory,
    getHistory,
    getVersion,
    updateLatestEntrySvg,
} from "./history.js"
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
            clearHistory(sessionId) // Also clean up history
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
        url.pathname === "/api/history" ||
        url.pathname === "/api/mcp/history"
    ) {
        handleHistoryApi(req, res, url)
    } else if (
        url.pathname === "/api/restore" ||
        url.pathname === "/api/mcp/restore"
    ) {
        handleRestoreApi(req, res, url)
    } else if (
        url.pathname === "/api/health" ||
        url.pathname === "/api/mcp/health"
    ) {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ status: "ok", mcp: true }))
    } else if (
        url.pathname === "/api/update-svg" ||
        url.pathname === "/api/mcp/update-svg"
    ) {
        handleUpdateSvgApi(req, res)
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
                const { sessionId, xml, svg } = JSON.parse(body)
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ error: "sessionId required" }))
                    return
                }

                // Update state
                const version = setState(sessionId, xml)

                // Save to history when browser sends SVG (human edits)
                if (svg) {
                    addHistoryEntry(sessionId, {
                        xml,
                        svg,
                        source: "human",
                        tool: "browser_sync",
                        timestamp: new Date(),
                        description: "Manual edit",
                    })
                }

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
 * Handle history API requests
 */
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

    const limit = parseInt(url.searchParams.get("limit") || "20")
    const history = getHistory(sessionId, limit)

    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
        JSON.stringify({
            entries: history.map((entry) => ({
                version: entry.version,
                source: entry.source,
                tool: entry.tool,
                timestamp: entry.timestamp.toISOString(),
                description: entry.description,
                svg: entry.svg,
                // Don't include full XML in list - use get_version for that
            })),
            count: history.length,
        }),
    )
}

/**
 * Handle update-svg API requests (browser sends SVG after loading AI diagram)
 */
function handleUpdateSvgApi(
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
            const { sessionId, svg, version } = JSON.parse(body)
            if (!sessionId || !svg) {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "sessionId and svg required" }))
                return
            }

            // Update the latest AI entry's SVG
            const updated = updateLatestEntrySvg(sessionId, svg, version)

            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ success: true, updated }))
        } catch {
            res.writeHead(400, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Invalid JSON" }))
        }
    })
}

/**
 * Handle restore API requests
 */
function handleRestoreApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
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
            const { sessionId, version } = JSON.parse(body)
            if (!sessionId || version === undefined) {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(
                    JSON.stringify({ error: "sessionId and version required" }),
                )
                return
            }

            const entry = getVersion(sessionId, version)
            if (!entry) {
                res.writeHead(404, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Version not found" }))
                return
            }

            // Restore by setting state (this will trigger browser poll to load it)
            const newVersion = setState(sessionId, entry.xml)

            // Add history entry for the restore action
            addHistoryEntry(sessionId, {
                xml: entry.xml,
                svg: entry.svg,
                source: "human",
                tool: "restore",
                timestamp: new Date(),
                description: `Restored from v${version}`,
            })

            log.info(
                `Restored session ${sessionId} to v${version}, new version: ${newVersion}`,
            )

            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(
                JSON.stringify({
                    success: true,
                    restoredFrom: version,
                    newVersion,
                }),
            )
        } catch {
            res.writeHead(400, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Invalid JSON" }))
        }
    })
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

        /* History button */
        #history-btn {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: #3b82f6;
            color: white;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, background 0.2s;
            z-index: 1000;
        }
        #history-btn:hover { background: #2563eb; transform: scale(1.1); }
        #history-btn:disabled { background: #6b7280; cursor: not-allowed; transform: none; }
        #history-btn svg { width: 24px; height: 24px; }
        #history-badge {
            position: absolute;
            top: -4px;
            right: -4px;
            background: #ef4444;
            color: white;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 10px;
            min-width: 18px;
            text-align: center;
        }

        /* Modal overlay */
        #history-modal {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 2000;
            align-items: center;
            justify-content: center;
        }
        #history-modal.open { display: flex; }

        /* Modal content */
        .modal-content {
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .modal-header {
            padding: 16px 20px;
            border-bottom: 1px solid #e5e7eb;
        }
        .modal-header h2 { font-size: 18px; margin: 0 0 4px 0; }
        .modal-header p { font-size: 13px; color: #6b7280; margin: 0; }
        .modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        }
        .modal-footer {
            padding: 12px 20px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }
        .modal-footer .info { flex: 1; font-size: 13px; color: #6b7280; }

        /* Grid of history items */
        .history-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 12px;
        }
        .history-item {
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 8px;
            cursor: pointer;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .history-item:hover { border-color: #3b82f6; }
        .history-item.selected {
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
        }
        .history-item .thumb {
            aspect-ratio: 16/9;
            background: #f9fafb;
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
        }
        .history-item .thumb img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        .history-item .thumb.no-preview {
            color: #9ca3af;
            font-size: 12px;
        }
        .history-item .meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
        }
        .history-item .version { font-weight: 600; color: #374151; }
        .history-item .badge {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .history-item .badge.ai { background: #dbeafe; color: #1d4ed8; }
        .history-item .badge.human { background: #dcfce7; color: #166534; }

        /* Buttons */
        .btn {
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: background 0.2s;
        }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:hover { background: #2563eb; }
        .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
        .btn-secondary { background: #f3f4f6; color: #374151; }
        .btn-secondary:hover { background: #e5e7eb; }

        /* Empty state */
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #6b7280;
        }
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

    <!-- History floating button -->
    <button id="history-btn" title="View diagram history" ${sessionId ? "" : "disabled"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span id="history-badge" style="display: none;">0</span>
    </button>

    <!-- History modal -->
    <div id="history-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Diagram History</h2>
                <p>Click on a version to restore it</p>
            </div>
            <div class="modal-body">
                <div id="history-grid" class="history-grid"></div>
                <div id="history-empty" class="empty-state" style="display: none;">
                    No history available yet.<br>Make some changes to create history.
                </div>
            </div>
            <div class="modal-footer">
                <div class="info" id="restore-info"></div>
                <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
                <button class="btn btn-primary" id="restore-btn" disabled>Restore</button>
            </div>
        </div>
    </div>

    <script>
        const sessionId = "${sessionId}";
        const iframe = document.getElementById('drawio');
        const statusEl = document.getElementById('status');

        let currentVersion = 0;
        let isDrawioReady = false;
        let pendingXml = null;
        let lastLoadedXml = null;
        let pendingSvgExport = null; // For capturing SVG during save

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
                // User saved - request SVG export then push state
                if (msg.xml && msg.xml !== lastLoadedXml) {
                    requestSvgAndPushState(msg.xml);
                }
            } else if (msg.event === 'export') {
                console.log('Export event received:', { format: msg.format, dataLength: msg.data?.length, pendingSvgForHistory, hasPendingSvgExport: !!pendingSvgExport });
                // Export completed - check if this is for SVG capture
                if (pendingSvgForHistory && msg.data) {
                    // SVG export for history preview (after AI load)
                    console.log('Updating history SVG, data preview:', msg.data?.substring(0, 100));
                    updateHistorySvg(msg.data);
                    pendingSvgForHistory = false;
                } else if (pendingSvgExport && msg.data) {
                    const svgData = msg.data; // This is the SVG data
                    pushStateWithSvg(pendingSvgExport.xml, svgData);
                    pendingSvgExport = null;
                } else if (msg.data) {
                    pushState(msg.data);
                }
            } else if (msg.event === 'autosave') {
                // Autosave - request SVG export then push state
                if (msg.xml && msg.xml !== lastLoadedXml) {
                    requestSvgAndPushState(msg.xml);
                }
            }
        }

        // Request SVG export before pushing state
        function requestSvgAndPushState(xml) {
            pendingSvgExport = { xml };
            iframe.contentWindow.postMessage(JSON.stringify({
                action: 'export',
                format: 'svg',
                spin: 'Exporting...'
            }), '*');

            // Fallback: if export doesn't respond in 2s, push without SVG
            setTimeout(() => {
                if (pendingSvgExport && pendingSvgExport.xml === xml) {
                    console.log('SVG export timeout, pushing without SVG');
                    pushState(xml);
                    pendingSvgExport = null;
                }
            }, 2000);
        }

        function loadDiagram(xml, fromAi = false) {
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

            // If loaded from AI, export SVG to update history preview
            if (fromAi) {
                console.log('Loaded from AI, scheduling SVG export in 500ms');
                setTimeout(() => {
                    console.log('Requesting SVG export for history');
                    pendingSvgForHistory = true;
                    iframe.contentWindow.postMessage(JSON.stringify({
                        action: 'export',
                        format: 'svg',
                        spin: 'Generating preview...'
                    }), '*');
                }, 500); // Small delay to let diagram render
            }
        }

        let pendingSvgForHistory = false;

        async function pushState(xml, svg = '') {
            if (!sessionId) return;

            try {
                const response = await fetch('/api/state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, xml, svg })
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

        async function pushStateWithSvg(xml, svgData) {
            // Convert SVG data to data URL if needed
            let svg = svgData;
            if (svgData && !svgData.startsWith('data:')) {
                svg = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
            }
            await pushState(xml, svg);
        }

        // Update history entry SVG (for AI-generated diagrams)
        async function updateHistorySvg(svgData) {
            if (!sessionId) return;

            let svg = svgData;
            if (svgData && !svgData.startsWith('data:')) {
                svg = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
            }

            console.log('Sending SVG to /api/update-svg, length:', svg?.length);

            try {
                const response = await fetch('/api/update-svg', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, svg })
                });
                const result = await response.json();
                console.log('Update SVG response:', result);
            } catch (e) {
                console.error('Failed to update history SVG:', e);
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
                    // Load from AI (server push) - generate SVG for history
                    loadDiagram(state.xml, true);
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

        // ============ History UI ============
        const historyBtn = document.getElementById('history-btn');
        const historyBadge = document.getElementById('history-badge');
        const historyModal = document.getElementById('history-modal');
        const historyGrid = document.getElementById('history-grid');
        const historyEmpty = document.getElementById('history-empty');
        const restoreBtn = document.getElementById('restore-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const restoreInfo = document.getElementById('restore-info');

        let historyData = [];
        let selectedVersion = null;

        // Open modal
        historyBtn.addEventListener('click', async () => {
            if (!sessionId) return;
            await fetchHistory();
            historyModal.classList.add('open');
        });

        // Close modal
        cancelBtn.addEventListener('click', closeModal);
        historyModal.addEventListener('click', (e) => {
            if (e.target === historyModal) closeModal();
        });

        function closeModal() {
            historyModal.classList.remove('open');
            selectedVersion = null;
            restoreBtn.disabled = true;
            restoreInfo.textContent = '';
        }

        // Fetch history from API
        async function fetchHistory() {
            try {
                const response = await fetch('/api/history?sessionId=' + encodeURIComponent(sessionId));
                if (!response.ok) return;

                const data = await response.json();
                historyData = data.entries || [];
                renderHistory();
                updateBadge();
            } catch (e) {
                console.error('Failed to fetch history:', e);
            }
        }

        // Update badge count
        function updateBadge() {
            if (historyData.length > 0) {
                historyBadge.textContent = historyData.length;
                historyBadge.style.display = 'block';
            } else {
                historyBadge.style.display = 'none';
            }
        }

        // Render history grid
        function renderHistory() {
            if (historyData.length === 0) {
                historyGrid.style.display = 'none';
                historyEmpty.style.display = 'block';
                return;
            }

            historyGrid.style.display = 'grid';
            historyEmpty.style.display = 'none';

            historyGrid.innerHTML = historyData.map(entry => {
                const hasSvg = entry.svg && entry.svg.length > 0;
                return \`
                    <div class="history-item" data-version="\${entry.version}">
                        <div class="thumb \${hasSvg ? '' : 'no-preview'}">
                            \${hasSvg
                                ? \`<img src="\${entry.svg}" alt="Version \${entry.version}">\`
                                : 'No preview'
                            }
                        </div>
                        <div class="meta">
                            <span class="version">v\${entry.version}</span>
                            <span class="badge \${entry.source}">\${entry.source === 'ai' ? 'AI' : 'You'}</span>
                        </div>
                    </div>
                \`;
            }).join('');

            // Add click handlers
            historyGrid.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', () => selectVersion(parseInt(item.dataset.version)));
            });
        }

        // Select a version
        function selectVersion(version) {
            // Toggle selection
            if (selectedVersion === version) {
                selectedVersion = null;
                restoreBtn.disabled = true;
                restoreInfo.textContent = '';
            } else {
                selectedVersion = version;
                restoreBtn.disabled = false;
                const entry = historyData.find(e => e.version === version);
                restoreInfo.textContent = \`Restore to v\${version}? (\${entry?.source === 'ai' ? 'AI' : 'Your'} edit)\`;
            }

            // Update selection UI
            historyGrid.querySelectorAll('.history-item').forEach(item => {
                item.classList.toggle('selected', parseInt(item.dataset.version) === selectedVersion);
            });
        }

        // Restore selected version
        restoreBtn.addEventListener('click', async () => {
            if (selectedVersion === null) return;

            try {
                restoreBtn.disabled = true;
                restoreBtn.textContent = 'Restoring...';

                const response = await fetch('/api/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, version: selectedVersion })
                });

                if (response.ok) {
                    closeModal();
                    // Poll will pick up the new state
                    await pollState();
                } else {
                    const error = await response.json();
                    alert('Failed to restore: ' + (error.error || 'Unknown error'));
                }
            } catch (e) {
                console.error('Failed to restore:', e);
                alert('Failed to restore version');
            } finally {
                restoreBtn.textContent = 'Restore';
                restoreBtn.disabled = selectedVersion === null;
            }
        });

        // Periodically update badge (every 10s)
        if (sessionId) {
            setInterval(fetchHistory, 10000);
            fetchHistory(); // Initial fetch
        }
    </script>
</body>
</html>`
}
