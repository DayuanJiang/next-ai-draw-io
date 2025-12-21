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
} from "./history.js"
import { log } from "./logger.js"

interface SessionState {
    xml: string
    version: number
    lastUpdated: Date
}

export const stateStore = new Map<string, SessionState>()

let server: http.Server | null = null
let serverPort = 6002
const MAX_PORT = 6020
const SESSION_TTL = 60 * 60 * 1000

export function getState(sessionId: string): SessionState | undefined {
    return stateStore.get(sessionId)
}

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

setInterval(cleanupExpiredSessions, 5 * 60 * 1000)

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
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(getHtmlPage(url.searchParams.get("mcp") || ""))
    } else if (url.pathname === "/api/state") {
        handleStateApi(req, res, url)
    } else if (url.pathname === "/api/history") {
        handleHistoryApi(req, res, url)
    } else if (url.pathname === "/api/restore") {
        handleRestoreApi(req, res)
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
        const state = stateStore.get(sessionId)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
            JSON.stringify({
                xml: state?.xml || null,
                version: state?.version || 0,
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

function getHtmlPage(sessionId: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Draw.io MCP</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; }
        #container { width: 100%; height: 100%; display: flex; flex-direction: column; }
        #header {
            padding: 8px 16px; background: #1a1a2e; color: #eee;
            font-family: system-ui, sans-serif; font-size: 14px;
            display: flex; justify-content: space-between; align-items: center;
        }
        #header .session { color: #888; font-size: 12px; }
        #header .status { font-size: 12px; }
        #header .status.connected { color: #4ade80; }
        #header .status.disconnected { color: #f87171; }
        #drawio { flex: 1; border: none; }
        #history-btn {
            position: fixed; bottom: 24px; right: 24px;
            width: 48px; height: 48px; border-radius: 50%;
            background: #3b82f6; color: white; border: none; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            z-index: 1000;
        }
        #history-btn:hover { background: #2563eb; }
        #history-btn:disabled { background: #6b7280; cursor: not-allowed; }
        #history-btn svg { width: 24px; height: 24px; }
        #history-modal {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,0.5); z-index: 2000;
            align-items: center; justify-content: center;
        }
        #history-modal.open { display: flex; }
        .modal-content {
            background: white; border-radius: 12px;
            width: 90%; max-width: 500px; max-height: 70vh;
            display: flex; flex-direction: column;
        }
        .modal-header { padding: 16px; border-bottom: 1px solid #e5e7eb; }
        .modal-header h2 { font-size: 18px; margin: 0; }
        .modal-body { flex: 1; overflow-y: auto; padding: 16px; }
        .modal-footer { padding: 12px 16px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; justify-content: flex-end; }
        .history-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .history-item {
            border: 2px solid #e5e7eb; border-radius: 8px; padding: 8px;
            cursor: pointer; text-align: center;
        }
        .history-item:hover { border-color: #3b82f6; }
        .history-item.selected { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.3); }
        .history-item .thumb {
            aspect-ratio: 4/3; background: #f3f4f6; border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
            margin-bottom: 4px; overflow: hidden;
        }
        .history-item .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .history-item .label { font-size: 12px; color: #666; }
        .btn { padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; border: none; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
        .btn-secondary { background: #f3f4f6; color: #374151; }
        .empty { text-align: center; padding: 40px; color: #666; }
    </style>
</head>
<body>
    <div id="container">
        <div id="header">
            <div>
                <strong>Draw.io MCP</strong>
                <span class="session">${sessionId ? `Session: ${sessionId}` : "No session"}</span>
            </div>
            <div id="status" class="status disconnected">Connecting...</div>
        </div>
        <iframe id="drawio" src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1"></iframe>
    </div>
    <button id="history-btn" title="History" ${sessionId ? "" : "disabled"}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
    </button>
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
    <script>
        const sessionId = "${sessionId}";
        const iframe = document.getElementById('drawio');
        const statusEl = document.getElementById('status');
        let currentVersion = 0, isReady = false, pendingXml = null, lastXml = null;

        window.addEventListener('message', (e) => {
            if (e.origin !== 'https://embed.diagrams.net') return;
            try {
                const msg = JSON.parse(e.data);
                if (msg.event === 'init') {
                    isReady = true;
                    statusEl.textContent = 'Ready';
                    statusEl.className = 'status connected';
                    if (pendingXml) { loadDiagram(pendingXml); pendingXml = null; }
                } else if ((msg.event === 'save' || msg.event === 'autosave') && msg.xml && msg.xml !== lastXml) {
                    pushState(msg.xml);
                }
            } catch {}
        });

        function loadDiagram(xml) {
            if (!isReady) { pendingXml = xml; return; }
            lastXml = xml;
            iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', xml, autosave: 1 }), '*');
        }

        async function pushState(xml) {
            if (!sessionId) return;
            try {
                const r = await fetch('/api/state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, xml })
                });
                if (r.ok) { const d = await r.json(); currentVersion = d.version; lastXml = xml; }
            } catch (e) { console.error('Push failed:', e); }
        }

        async function poll() {
            if (!sessionId) return;
            try {
                const r = await fetch('/api/state?sessionId=' + encodeURIComponent(sessionId));
                if (!r.ok) return;
                const s = await r.json();
                if (s.version > currentVersion && s.xml) {
                    currentVersion = s.version;
                    loadDiagram(s.xml);
                }
            } catch {}
        }

        if (sessionId) { poll(); setInterval(poll, 2000); }

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
