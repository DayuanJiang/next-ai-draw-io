const iframe = document.getElementById('drawio');
let currentVersion = 0, isReady = false, pendingXml = null, lastXml = null;
// The server state this tab is in step with (see stateId in http-server.ts);
// null until the first poll
let stateId = null;
// The newest diagram on the canvas, saved to the server or not: lastXml is
// the last one the server has
let latestXml = null;
let pushFailing = false; // the last push could not reach the server
const pushesInFlight = []; // XML of pushes not answered yet
// After recovery replaced the canvas, until draw.io reports the load: an
// autosave still on its way belongs to the canvas being replaced
let awaitingLoad = false;
let pollSeq = 0, lastHandledPoll = 0; // polls overlap; older answers are dropped
let pendingSvgExport = null;
let pendingSvgBase = 0; // version the pending autosave was based on
let pendingSvgStateId = null; // and the state it belonged to
// The latest thumbnail export of a loaded server write: its number (echoed
// by draw.io), the state and version it showed, and the XML loaded
let thumbExportSeq = 0, thumbExport = null;
let pendingMcpExport = null; // 'png', 'svg' or 'xmlsvg' when MCP requested export
let mcpExportSeq = 0; // number of the latest MCP export
let mcpExportId = null; // the server's id for it, sent back with the result
let projectionExportActive = false; // page-targeted export: showing a transient single-page projection
let forceReload = false; // reload the server state on the next poll even if the version is unchanged
let noticeTimer = null;

window.addEventListener('message', (e) => {
    if (e.origin !== DRAWIO_ORIGIN) return;
    try {
        const msg = JSON.parse(e.data);
        if (msg.event === 'init') {
            isReady = true;
            if (pendingXml) { loadDiagram(pendingXml); pendingXml = null; }
        } else if (msg.event === 'load') {
            awaitingLoad = false;
        } else if ((msg.event === 'save' || msg.event === 'autosave') && msg.xml) {
            // Ignore autosave while a single-page projection is on screen
            // for a page-targeted export — otherwise we'd push the
            // transient projection back as the canonical session state.
            if (projectionExportActive) return;
            // An edit of the canvas that recovery is replacing: kept in
            // History, never over the recovered diagram
            if (awaitingLoad) { pushState(msg.xml, '', currentVersion, 'recover'); return; }
            // Also an edit undone back to what the server has
            latestXml = msg.xml;
            if (msg.xml === lastXml) return;
            // Request SVG export, then push state with SVG. Remember the
            // version and state this edit is based on, so the server can
            // reject it if the AI wrote a newer version that is not loaded
            // yet, or if it lost that state.
            pendingSvgExport = msg.xml;
            pendingSvgBase = currentVersion;
            pendingSvgStateId = stateId;
            iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'svg' }), '*');
            // Fallback if export doesn't respond
            setTimeout(() => { if (pendingSvgExport === msg.xml) { pushState(msg.xml, '', pendingSvgBase, 'edit', pendingSvgStateId); pendingSvgExport = null; } }, 2000);
        } else if (msg.event === 'export' && msg.format === 'xml') {
            // Sync export requested by the server (get_diagram).
            // draw.io returns the XML in msg.xml, with no msg.data. A late
            // reply to an earlier request was taken at another version.
            if (pendingSyncExport && msg.xml && msg.message?.syncExport === syncExportSeq) {
                pendingSyncExport = false;
                // Push with the version the export was taken at: a
                // newer AI write may have loaded meanwhile, and this
                // older XML must not overwrite it.
                pushState(msg.xml, '', pendingSyncBase, 'sync', pendingSyncStateId);
            }
        } else if (msg.event === 'export' && msg.data) {
            // Handle MCP server export request (png/svg). fireExport tags
            // the request with mcpExport and draw.io echoes the request
            // back in msg.message, which tells it apart from autosave and
            // preview SVG exports.
            if (msg.message && msg.message.mcpExport) {
                // A late reply to an export that already timed out
                if (msg.message.mcpExport !== mcpExportSeq) return;
                const d = msg.data;
                const isPng = pendingMcpExport === 'png' && d.startsWith('data:image/png');
                const isSvg = (pendingMcpExport === 'svg' || pendingMcpExport === 'xmlsvg') && (d.startsWith('data:image/svg') || d.startsWith('<svg'));
                if (isPng || isSvg) {
                    // Keep pendingMcpExport set until the server has the
                    // result: a poll answered before that still sees the
                    // request and would start the same export again.
                    const seq = msg.message.mcpExport;
                    fetch('/api/state', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, exportData: d, exportId: mcpExportId })
                    }).catch(() => {}).finally(() => {
                        // The timeout already ended this export
                        if (seq !== mcpExportSeq) return;
                        pendingMcpExport = null;
                        // Page-targeted export: restore the user's real
                        // multi-page document now that we have the image.
                        restoreFromProjection();
                    });
                }
                return;
            }
            // Handle file download export (PNG/SVG only, drawio uses
            // lastXml directly). Tagged with dlExport like mcpExport,
            // so an autosave SVG export can never be saved instead.
            if (msg.message && msg.message.dlExport) {
                if (!pendingDownload) return;
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
            // Handle SVG export
            let svg = msg.data;
            if (!svg.startsWith('data:')) svg = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
            if (msg.message && msg.message.thumbExport) {
                // Only for the latest load, and only if the canvas still
                // shows it: the export pictures the canvas as it is now
                const t = thumbExport;
                if (!t || msg.message.thumbExport !== t.n || latestXml !== t.xml) return;
                thumbExport = null;
                fetch('/api/history-svg', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, svg, stateId: t.stateId, version: t.version })
                }).catch(() => {});
            } else if (pendingSvgExport) {
                const xml = pendingSvgExport;
                pendingSvgExport = null;
                pushState(xml, svg, pendingSvgBase, 'edit', pendingSvgStateId);
            }
        }
    } catch {}
});

function loadDiagram(xml, capturePreview = false) {
    if (!isReady) { pendingXml = xml; return; }
    lastXml = xml;
    latestXml = xml;
    iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', xml, autosave: 1 }), '*');
    if (capturePreview) {
        // A server write: currentVersion is its version
        const t = { n: ++thumbExportSeq, stateId, version: currentVersion, xml };
        thumbExport = t;
        setTimeout(() => {
            if (thumbExport !== t) return; // a newer load takes its own
            iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'svg', thumbExport: t.n }), '*');
        }, 500);
    }
}

// Restore the user's real document after a page-targeted projection
// export by reloading the server state. The server also has any
// autosave that was still in flight when the projection started,
// which a copy taken at that moment would miss. A flag is used
// because a push finishing meanwhile may update currentVersion.
// projectionExportActive stays set until the poll loads the document:
// an edit on the projection before that must not be pushed.
function restoreFromProjection() {
    if (!projectionExportActive) return;
    forceReload = true;
    poll();
}

function showNotice(text) {
    const el = document.getElementById('notice');
    el.textContent = text;
    el.classList.add('open');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => el.classList.remove('open'), 8000);
}

// source is 'sync' for replies to a server sync request, 'recover' for the
// tab's copy after the server recovered the session, else 'edit'. sid is the
// server state the push is based on.
async function pushState(xml, svg = '', baseVersion = currentVersion, source = 'edit', sid = stateId) {
    if (!sessionId) return;
    pushesInFlight.push(xml);
    try {
        const r = await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, xml, svg, baseVersion, source, stateId: sid })
        });
        pushFailing = false;
        if (r.ok) {
            const d = await r.json();
            // An answer about a state this tab has left since, or one that
            // comes after a newer version was loaded or saved
            if (sid !== stateId || d.version < currentVersion) return;
            currentVersion = d.version;
            lastXml = xml;
            // The canvas changed while this edit was on its way, to
            // something no pending autosave will send (an undo back to the
            // previous version): send it now. A sync reply is draw.io's
            // export of the canvas, in another format than its autosave.
            if (latestXml && latestXml !== xml && pendingSvgExport !== latestXml && source === 'edit') {
                pushState(latestXml);
            }
        }
        // Over the server's size limit: the image is most of it, so try once
        // without it
        else if (r.status === 413) {
            if (svg) pushState(xml, '', baseVersion, source, sid);
            else showNotice('This diagram is too large to save to the MCP server (over 10 MB). Use Download to keep it.');
        }
        // 409: the AI wrote a newer version, or the server lost the state
        // this push was based on; the next poll sorts it out
        else if (r.status === 409) {
            const d = await r.json().catch(() => ({}));
            if (d.savedToHistory) {
                showNotice(source === 'recover'
                    ? 'The diagram was restored from its saved file. What this tab showed before is in History.'
                    : 'The AI changed the diagram while you were editing. Your last change was saved in History.');
            }
            poll();
        }
    } catch (e) {
        console.error('Push failed:', e);
        if (!pushFailing) {
            pushFailing = true;
            showNotice("Can't reach the MCP server. Your changes are only in this tab for now; use Download to keep a copy.");
        }
    } finally {
        pushesInFlight.splice(pushesInFlight.indexOf(xml), 1);
    }
}

// The server made a new state for this session: it expired, or the MCP
// process restarted. Decide whose diagram wins.
function recoverState(s) {
    stateId = s.stateId;
    // The old state's pending work is gone with it
    const projectionShown = projectionExportActive;
    projectionExportActive = false;
    forceReload = false;
    pendingMcpExport = null;
    pendingSyncExport = false;
    const mine = latestXml;
    currentVersion = s.version;
    if (s.blank || s.xml === lastXml) {
        // The server knows nothing, or exactly what this tab last saved:
        // the canvas can only be newer, so it wins (edits made while the
        // server was down are saved now)
        if (projectionShown && mine) {
            iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', xml: mine, autosave: 1 }), '*');
            expectLoad();
        }
        if (mine && mine !== s.xml) pushState(mine, '', s.version);
    } else {
        // The server has a diagram this tab never showed (an AI write it
        // missed, a saved file): show that, and keep this tab's copy in
        // History unless it is the same
        loadDiagram(s.xml, true);
        expectLoad();
        if (mine && mine !== s.xml) pushState(mine, '', s.version, 'recover');
    }
}

// Until draw.io reports the load (its messages come in order), an autosave
// is from the canvas being replaced; in case no report comes, not for long
function expectLoad() {
    awaitingLoad = true;
    setTimeout(() => { awaitingLoad = false; }, 5000);
}

let pendingSyncExport = false;
let pendingSyncBase = 0; // version the pending sync export was taken at
let pendingSyncStateId = null; // and the state it belonged to
let syncExportSeq = 0; // number of the latest sync export

async function poll() {
    if (!sessionId) return;
    const seq = ++pollSeq;
    try {
        const r = await fetch('/api/state?sessionId=' + encodeURIComponent(sessionId));
        if (!r.ok) return;
        const s = await r.json();
        // An older answer than one already handled (the interval, the 409
        // handler and the projection restore each poll): it could name a
        // state that is gone
        if (seq < lastHandledPoll) return;
        lastHandledPoll = seq;
        if (stateId === null) stateId = s.stateId;
        else if (s.stateId && s.stateId !== stateId) recoverState(s);
        // Load new diagram from server (before export, so we export latest).
        // While a page-targeted projection is on screen, only the restore
        // (forceReload) replaces it, so a new version doesn't fight the
        // projection; currentVersion stays unadvanced until then, so the
        // bump is applied with the real document.
        // The tab's own push still on its way is not loaded back: the
        // canvas may have moved on since (an undo), and its answer follows
        const ownPush = pushesInFlight.includes(s.xml);
        if ((forceReload || (s.version > currentVersion && !projectionExportActive && !ownPush)) && s.xml) {
            forceReload = false;
            projectionExportActive = false;
            currentVersion = s.version;
            loadDiagram(s.xml, true);
        }
        // Handle sync request - server needs fresh state. After the load
        // above, so draw.io exports what it just loaded; never while a
        // one-page projection is on screen, which would be sent as the
        // whole document. Reset after a while in case draw.io never
        // answers, so later syncs still run.
        if (s.syncRequested && !pendingSyncExport && isReady && !projectionExportActive) {
            pendingSyncExport = true;
            pendingSyncBase = currentVersion;
            pendingSyncStateId = stateId;
            // draw.io echoes the request in msg.message, so the reply can
            // be matched to this request
            const seq = ++syncExportSeq;
            iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'xml', syncExport: seq }), '*');
            setTimeout(() => { if (seq === syncExportSeq) pendingSyncExport = false; }, 5000);
        }
        // Handle export request from MCP server (png/svg).
        //
        // Plain export: capture whatever tab is currently displayed.
        //
        // Page-targeted export: the server sends a single-page <mxfile>
        // projection in s.exportXml. We load it into the iframe, let
        // draw.io render it, export, then reload the user's real
        // document — all browser-side. The canonical session state is
        // never mutated, so there is no server-side restore race and no
        // dependence on poll timing. autosave is suppressed while the
        // projection is showing (see projectionExportActive guard).
        if (s.exportFormat && !pendingMcpExport && isReady) {
            pendingMcpExport = s.exportFormat;
            const seq = ++mcpExportSeq;
            mcpExportId = s.exportId;
            const extra = s.exportOptions || {};
            const fireExport = () => {
                // mcpExport carries this export's number and is echoed
                // back in msg.message (see the handler). PNG: width
                // caps the size, pageId picks a page; without one
                // draw.io would use the first page.
                const exportOpts = pendingMcpExport === 'png'
                    ? { action: 'export', format: 'png', scale: 2, currentPage: !extra.pageId, ...extra, mcpExport: seq }
                    : { action: 'export', format: pendingMcpExport, mcpExport: seq };
                iframe.contentWindow.postMessage(JSON.stringify(exportOpts), '*');
            };
            if (s.exportXml) {
                projectionExportActive = true;
                // Load the projection without touching lastXml/server state.
                iframe.contentWindow.postMessage(JSON.stringify({ action: 'load', xml: s.exportXml, autosave: 0 }), '*');
                // Let draw.io render the loaded page before exporting
                // (same proven settle delay as the AI-preview path).
                setTimeout(fireExport, 600);
            } else {
                fireExport();
            }
            // Timeout: reset if draw.io never responds, and restore the
            // real document if a projection was left showing. Only for
            // this export: a later one may be running by then.
            setTimeout(() => {
                if (pendingMcpExport && seq === mcpExportSeq) {
                    pendingMcpExport = null;
                    restoreFromProjection();
                }
            }, 10000);
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

const extMap = { drawio: '.drawio', png: '.png', svg: '.svg', xmlsvg: '.drawio.svg' };

saveBtn.onclick = () => {
    if (!sessionId || !isReady) return;
    // Local date as YYYY-MM-DD, like the web app's default name
    saveFilename.value = 'diagram-' + new Date().toLocaleDateString('sv-SE');
    saveModal.classList.add('open');
    saveFilename.focus();
    saveFilename.select();
};

saveFilename.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.isComposing && !saveConfirmBtn.disabled) saveConfirmBtn.onclick();
};

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (saveModal.classList.contains('open')) saveCancelBtn.onclick();
    if (historyModal.classList.contains('open')) cancelBtn.onclick();
});

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
        // Use the XML directly instead of requesting export (avoids race with SVG exports).
        // session.xml is canonically <mxfile> after the multi-page refactor,
        // so no wrapper injection is needed. The legacy fallback below
        // remains only for documents that somehow slipped past
        // normalisation (e.g. an older session loaded from external state).
        // The canvas as it is, also edits not saved to the server yet
        let xmlData = latestXml || lastXml || '';
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
        iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format: 'png', scale: 2, currentPage: true, dlExport: true }), '*');
        setTimeout(() => { saveConfirmBtn.disabled = false; saveConfirmBtn.textContent = 'Save'; pendingDownload = null; }, 5000);
    } else {
        // svg, or xmlsvg: an SVG with the diagram embedded, which draw.io can open again
        pendingDownload = { format, filename };
        iframe.contentWindow.postMessage(JSON.stringify({ action: 'export', format, dlExport: true }), '*');
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
let historyData = [], selectedId = null;

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

cancelBtn.onclick = () => { historyModal.classList.remove('open'); selectedId = null; restoreBtn.disabled = true; };
historyModal.onclick = (e) => { if (e.target === historyModal) cancelBtn.onclick(); };

function renderHistory() {
    if (historyData.length === 0) {
        historyGrid.style.display = 'none';
        historyEmpty.style.display = 'block';
        return;
    }
    historyGrid.style.display = 'grid';
    historyEmpty.style.display = 'none';
    // Built element by element: a stored image is never read as HTML, and
    // only an SVG data URL is shown as one
    historyGrid.replaceChildren(...historyData.map((e) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.dataset.id = String(e.id);
        const thumb = document.createElement('div');
        thumb.className = 'thumb';
        if (typeof e.svg === 'string' && e.svg.startsWith('data:image/svg+xml;base64,')) {
            const img = document.createElement('img');
            img.src = e.svg;
            thumb.appendChild(img);
        } else {
            thumb.textContent = '#' + e.index;
        }
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = '#' + e.index;
        item.append(thumb, label);
        return item;
    }));
    historyGrid.querySelectorAll('.history-item').forEach(item => {
        item.onclick = () => {
            const id = parseInt(item.dataset.id);
            if (selectedId === id) { selectedId = null; restoreBtn.disabled = true; }
            else { selectedId = id; restoreBtn.disabled = false; }
            historyGrid.querySelectorAll('.history-item').forEach(el => el.classList.toggle('selected', parseInt(el.dataset.id) === selectedId));
        };
    });
}

restoreBtn.onclick = async () => {
    if (selectedId === null) return;
    restoreBtn.disabled = true;
    restoreBtn.textContent = 'Restoring...';
    try {
        const r = await fetch('/api/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, id: selectedId })
        });
        if (r.ok) { cancelBtn.onclick(); await poll(); }
        else { showNotice('Restore failed. Please try again.'); }
    } catch { showNotice('Restore failed. Please try again.'); }
    restoreBtn.textContent = 'Restore';
};
