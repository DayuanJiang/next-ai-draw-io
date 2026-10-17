/**
 * The shell's side of the MCP server's state protocol (src/http-server.ts),
 * ported from the classic preview page (src/preview/preview.js) without the
 * page: the server is reached through fetch, the canvas through the
 * SyncCanvas functions the hook (use-mcp-sync.ts) passes in. No React here,
 * so the state machine can be driven step by step in tests.
 *
 * The protocol in short: the tab polls GET /api/state every 2 s and loads a
 * newer version; a user edit is pushed with the version and state it is
 * based on, and the server refuses (409) a push based on a version the AI
 * has since written over, or on a state it has lost (it expired, the
 * process restarted); the next poll then decides whose diagram wins
 * (recoverState). get_diagram asks for a sync (the canvas as draw.io has
 * it) and screenshots and file exports for an image, both through the poll.
 */
import { isSameDocument, sameFileVars } from "@/lib/diagram-diff"
import { hasLoadOnlySettings } from "@/lib/drawio/editor-bridge"
import { contentFingerprint } from "@/packages/mcp-server/src/edit-gate.ts"
import {
    normalizeToMxfile,
    parseMxfile,
    projectPage,
    serializeMxfile,
} from "@/packages/mcp-server/src/pages.ts"
import type { SelectionAnswer } from "@/packages/mcp-server/src/selection.ts"

export type ExportFormat = "png" | "svg" | "xmlsvg"

/** GET /api/state as the server answers it */
export interface ServerState {
    xml: string | null
    version: number
    stateId: string | null
    blank: boolean
    syncRequested: boolean
    exportFormat: ExportFormat | null
    exportXml: string | null
    /** draw.io export parameters (src/http-server.ts ExportOptions) */
    exportOptions: {
        width?: number
        pageId?: string
        border?: number
        background?: string
        transparent?: boolean
    } | null
    exportId: string | null
    /** A get_selection request waiting for this tab's answer */
    selectionId?: string | null
    /** Changes when History or the entry on the canvas does (the version
     * cards read History again then); older servers send none */
    historyKey?: string
    /** The file the diagram was opened from or last saved to */
    file?: string | null
    /** The diagram changed since that file was read or written */
    fileChanged?: boolean
}

/** An entry of GET /api/history */
export interface HistoryEntryInfo {
    id: number
    index: number
    svg: string
    xml: string
    /** Who made it: "user", "recover", "restore", "load", "add_page"; null
     * for the AI's other writes */
    source: string | null
    /** The oldest entry with the same content (itself when it is the first) */
    firstId: number
}

/** GET /api/history as the server answers it, for the state the list is of */
export interface HistoryList {
    entries: HistoryEntryInfo[]
    stateId: string | null
    /** The entry whose content the canvas shows (the server's rule), or null */
    currentId: number | null
}

/**
 * How a server write goes on the canvas: as one undo step on the page the
 * user is viewing (the editor highlights it and Ctrl+Z takes it back), or
 * as a full load of the document (see decideLoad). pageId of a full load:
 * the page to show after it, the one the write changed; absent: the page
 * the user was on
 */
export type LoadDecision =
    | { mode: "commit"; pageId: string | null }
    | { mode: "load"; pageId?: string }

export interface ExportRequest {
    format: string
    [key: string]: unknown
}

export interface ExportResult {
    data?: string
    xml?: string
}

/** The canvas as the sync drives it (the hook maps it onto DiagramProvider) */
export interface SyncCanvas {
    load(xml: string, decision: LoadDecision): void
    /** Show a one-page projection for an export only: not recorded, its
     * autosaves ignored until the next load */
    showTransient(xml: string): void
    /** draw.io's export; null when it does not answer in time */
    export(
        request: ExportRequest,
        timeoutMs: number,
    ): Promise<ExportResult | null>
    /** The document on the canvas now ("" before the first load) */
    currentXml(): string
    /** The page on screen; null when unknown (external draw.io) */
    currentPageId(): string | null
    /** A full load was sent and draw.io has not reported it yet: the
     * editor still shows the previous document */
    loadPending(): boolean
    /** The cells selected in the editor, for get_selection; `unavailable`
     * when the page cannot reach the editor (external draw.io) */
    readSelection(): SelectionAnswer
}

export type SyncStatus = "waiting" | "connected" | "offline"

/** Texts shown to the user (the shell takes them from its dictionary) */
export type SyncNotice =
    | "tooLarge"
    | "unreachable"
    | "restoredFromFile"
    | "aiChanged"
    | "historyChanged"
    | "restoreFailed"

export interface SyncOptions {
    sessionId: string
    /** Prefix of the server's API paths ("/api") */
    apiBase: string
    /** Every request carries it in the X-Drawio-Token header */
    token: string
    canvas: SyncCanvas
    onNotice: (notice: SyncNotice) => void
    onStatus?: (status: SyncStatus) => void
    /** The tab is hidden; another tab of this session may be in front */
    isHidden?: () => boolean
    /** The server made a new state for the session: History entries got
     * new ids, so a list on screen is stale */
    onStateRecreated?: () => void
    /** The token of the process now answering on this port, read from a
     * fresh copy of this page; default: tokenFromPage of location.href */
    refreshToken?: () => Promise<string | null>
    fetch?: typeof fetch
}

export interface McpSync {
    /** Poll now and every 2 s */
    start(): void
    stop(): void
    poll(): Promise<void>
    /** draw.io is ready for exports (DiagramProvider's isDrawioReady) */
    setReady(ready: boolean): void
    /** draw.io sent an autosave: the canvas changed to this document */
    onAutoSave(xml: string): void
    /** draw.io reported a load done */
    onDrawioLoad(): void
    /** The server's History, with the state its ids belong to; null when
     * it could not be read, or the state changed meanwhile (the version
     * cards, shell/node-versions-source.ts) */
    fetchHistory(): Promise<HistoryList | null>
    /** Put a History entry back, naming the state its list belongs to */
    restoreEntry(
        id: number,
        listStateId: string | null,
    ): Promise<"ok" | "stale" | "failed">
    /** Called when the server's diagram or History changed (a write
     * loaded, an edit saved, a thumbnail sent, the state recreated) or the
     * file it names: the version cards read History again, the header the
     * file. Returns the unsubscribe */
    onServerChange(listener: () => void): () => void
    /** For tests and the status bar */
    read(): {
        stateId: string | null
        currentVersion: number
        lastXml: string | null
        latestXml: string | null
        projectionActive: boolean
        status: SyncStatus
        /** The file the server names for the diagram (the header shows it) */
        file: string | null
        /** The diagram changed since that file was read or written */
        fileChanged: boolean
    }
}

export const POLL_INTERVAL_MS = 2000

// A hand edit this recent means the user is working on the page on screen
const EDITING_MS = 10_000

// Width cap of a thumbnail drawn as a PNG (the card shows it at about 300 px)
const THUMBNAIL_WIDTH = 600

/** The API token the server wrote into a shell page (window.__MCP_CONFIG__) */
export function tokenFromPage(html: string): string | null {
    const match = html.match(/window\.__MCP_CONFIG__ = (\{.*?\});/)
    if (!match) return null
    try {
        const token = JSON.parse(match[1]).token
        return typeof token === "string" && token ? token : null
    } catch {
        return null
    }
}

/**
 * The same diagram, as text or as documents (draw.io re-serializes what it
 * loads: another attribute order, filled-in defaults). Only documents with
 * a page or a model are compared as documents: two without any would
 * otherwise count as the same.
 */
function sameDiagram(a: string | null, b: string | null): boolean {
    if (a === b) return true
    if (a === null || b === null) return false
    const hasModel = (xml: string) => /<(mxGraphModel|diagram)[\s>]/.test(xml)
    return hasModel(a) && hasModel(b) && isSameDocument(a, b)
}

/** SVG as a data URL, as the server stores thumbnails */
function svgDataUrl(svg: string): string {
    if (svg.startsWith("data:")) return svg
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/**
 * Whether a server write can go on the canvas as one undo step: it has the
 * same pages as the canvas, changes only the one the user is viewing (the
 * one with currentPageId; a one-page document needs no id, several pages
 * with the page unknown load in full), keeps the file variables and needs
 * no load-only page setting. Pages are compared with the MCP core's
 * contentFingerprint (names and cells). The editor bridge checks the same
 * against the live editor and falls back to a full load on its own.
 */
export function decideLoad(
    currentXml: string,
    nextXml: string,
    currentPageId: string | null,
): LoadDecision {
    const parse = (xml: string) => {
        const normalized = normalizeToMxfile(xml)
        return normalized ? parseMxfile(normalized) : null
    }
    const full: LoadDecision = { mode: "load" }
    const current = parse(currentXml)
    const next = parse(nextXml)
    if (!current || !next) return full
    if (
        !sameFileVars(
            current.documentElement.getAttribute("vars"),
            next.documentElement.getAttribute("vars"),
        )
    ) {
        return full
    }
    const pagesNow = Array.from(current.querySelectorAll("diagram"))
    const pagesNext = Array.from(next.querySelectorAll("diagram"))
    if (pagesNow.length === 0 || pagesNow.length !== pagesNext.length) {
        return full
    }
    let index = pagesNow.findIndex(
        (page) => page.getAttribute("id") === currentPageId,
    )
    if (index < 0) {
        // The page on screen is unknown (an external draw.io cannot tell):
        // with several pages the target cannot be told, load in full
        if (pagesNow.length > 1) return full
        index = 0
    }
    const target = pagesNext[index]
    // The page is found by its id when the document has several
    if (
        pagesNow.length > 1 &&
        target.getAttribute("id") !== pagesNow[index].getAttribute("id")
    ) {
        return full
    }
    const targetModel = target.querySelector("mxGraphModel")
    if (targetModel && hasLoadOnlySettings(targetModel)) return full
    // The other pages, as the MCP core compares them (edit-gate.ts)
    const others = (doc: Document, pages: Element[]) => {
        pages[index].remove()
        return contentFingerprint(serializeMxfile(doc))
    }
    if (others(current, pagesNow) !== others(next, pagesNext)) return full
    return { mode: "commit", pageId: target.getAttribute("id") }
}

/**
 * The one page a server write changed (a page it added counts), by its id,
 * compared as the MCP core compares pages (names and cells); null when it
 * changed none or several, or a page of the write has no id
 */
export function changedPageId(
    currentXml: string,
    nextXml: string,
): string | null {
    const normalize = (xml: string) => normalizeToMxfile(xml) ?? xml
    const ids = (xml: string) => {
        const doc = parseMxfile(normalize(xml))
        return doc
            ? Array.from(doc.querySelectorAll("diagram")).map((page) =>
                  page.getAttribute("id"),
              )
            : null
    }
    const before = ids(currentXml)
    const after = ids(nextXml)
    if (!before || !after) return null
    const page = (xml: string, id: string) => {
        const projection = projectPage(normalize(xml), { page_id: id })
        return projection.ok ? contentFingerprint(projection.xml) : null
    }
    const changed: string[] = []
    for (const id of after) {
        if (!id) return null
        if (!before.includes(id) || page(currentXml, id) !== page(nextXml, id))
            changed.push(id)
    }
    return changed.length === 1 ? changed[0] : null
}

export function createMcpSync(options: SyncOptions): McpSync {
    const { sessionId, apiBase, canvas, onNotice, onStatus } = options
    const fetchFn = options.fetch ?? ((...args) => globalThis.fetch(...args))
    let token = options.token

    let currentVersion = 0
    let isReady = false
    // What the server has (the text it sent or we pushed) and the newest
    // diagram on the canvas, saved to the server or not
    let lastXml: string | null = null
    let latestXml: string | null = null
    // The server state this tab is in step with; null until the first poll
    let stateId: string | null = null
    let pushFailing = false
    const pushesInFlight: string[] = []
    // After a recovery replaced the canvas, until draw.io reports the load:
    // an autosave still on its way belongs to the canvas being replaced
    let awaitingLoad = false
    let awaitingLoadTimer: ReturnType<typeof setTimeout> | null = null
    // A write taken in place (a commit) makes draw.io autosave its own copy
    // of it, serialized its way: that one autosave is not an edit
    let awaitingCommitCopy = false
    let pollSeq = 0
    let lastHandledPoll = 0 // polls overlap; older answers are dropped
    // The edit whose SVG export is pending, and what it was based on
    let pendingSvgExport: string | null = null
    // The latest thumbnail export of a loaded server write: the state and
    // version it showed, the XML loaded, and the one page it changed
    let thumbExport: {
        stateId: string | null
        version: number
        xml: string
        pageId?: string | null
    } | null = null
    // When the user last changed the canvas: a write on another page does
    // not take them away from the page they are editing
    let lastEditAt = 0
    // The file the server names for the diagram, and whether the diagram
    // changed since
    let file: string | null = null
    let fileChanged = false
    // Its picture was not taken because the user had changed the canvas by
    // then: taken when the canvas shows the write again (an undo)
    let thumbMissed = false
    let pendingMcpExport: ExportFormat | null = null
    let mcpExportSeq = 0
    let mcpExportId: string | null = null
    // A one-page projection is on screen for a page-targeted export
    let projectionExportActive = false
    // The restore load of the real document was sent; until draw.io reports
    // it (or 5 s), the projection still counts as on screen
    let projectionRestoreTimer: ReturnType<typeof setTimeout> | null = null
    const endProjection = () => {
        projectionExportActive = false
        if (projectionRestoreTimer) clearTimeout(projectionRestoreTimer)
        projectionRestoreTimer = null
    }
    // Load the server state on the next poll even at the same version
    let forceReload = false
    let pendingSyncExport = false
    let syncExportSeq = 0
    // The selection request answered last: the server shows a request until
    // the answer arrives, and polls overlap
    let answeredSelectionId: string | null = null
    let status: SyncStatus = "waiting"
    let interval: ReturnType<typeof setInterval> | null = null

    const setStatus = (next: SyncStatus) => {
        if (status === next) return
        status = next
        onStatus?.(next)
    }

    // Listeners of onServerChange, told once per History key seen (the
    // server sends it with every state and push answer; a write, a restore
    // and the first hand edit change it, further hand edits do not) and
    // whenever History changed without one (a rejected edit kept, a
    // thumbnail stored)
    const changeListeners = new Set<() => void>()
    let notedKey: string | null = null
    let notedStateId: string | null = null
    const emitChange = () => {
        for (const listener of changeListeners) listener()
    }
    const noteHistory = (key: string, sid: string | null) => {
        if (key === notedKey && sid === notedStateId) return
        notedKey = key
        notedStateId = sid
        emitChange()
    }

    // A 403 means another MCP process (with its own token) now answers on
    // this port: read its token and retry once, so the next poll can recover
    // the session instead of being refused forever
    let tokenRefresh: Promise<void> | null = null
    const refreshToken = () => {
        if (!tokenRefresh) {
            const read =
                options.refreshToken ??
                (() =>
                    fetchFn(location.href, { cache: "no-store" })
                        .then((r) => r.text())
                        .then(tokenFromPage))
            tokenRefresh = read()
                .then((next) => {
                    if (next) token = next
                })
                .catch(() => {})
                .finally(() => {
                    tokenRefresh = null
                })
        }
        return tokenRefresh
    }

    const api = async (path: string, init: RequestInit = {}) => {
        const send = () =>
            fetchFn(`${apiBase}${path}`, {
                ...init,
                headers: { ...(init.headers ?? {}), "X-Drawio-Token": token },
            })
        let r = await send()
        if (r.status === 403) {
            await refreshToken()
            r = await send()
        }
        return r
    }

    const postJson = (path: string, body: unknown) =>
        api(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })

    /** Put a server write on the canvas and take its thumbnail */
    const loadFromServer = (xml: string, how: "decide" | "full") => {
        lastXml = xml
        latestXml = xml
        const before = canvas.currentXml()
        const changedPage = changedPageId(before, xml)
        let decision: LoadDecision =
            how === "decide"
                ? decideLoad(before, xml, canvas.currentPageId())
                : { mode: "load" }
        // A write on another page shows that page, unless the user is
        // editing (the restore after a projection goes back to their page)
        if (
            how === "decide" &&
            decision.mode === "load" &&
            changedPage &&
            changedPage !== canvas.currentPageId() &&
            Date.now() - lastEditAt > EDITING_MS
        ) {
            decision = { mode: "load", pageId: changedPage }
        }
        canvas.load(xml, decision)
        // draw.io autosaves its copy only when the write changed its
        // document: after one that left the canvas as it was, the next
        // autosave is the user's
        awaitingCommitCopy =
            decision.mode === "commit" && !sameDiagram(before, xml)
        // currentVersion is the write's version
        thumbExport = {
            stateId,
            version: currentVersion,
            xml,
            pageId: changedPage,
        }
        thumbMissed = false
        setTimeout(captureThumbnail, 500)
    }

    // The image of the server write on the canvas, for its History entry:
    // only for the latest load, once draw.io is ready, and only if the
    // canvas still shows it when the export answers. The page it changed
    // when that is not the page on screen: draw.io renders another page
    // only as a PNG
    const captureThumbnail = () => {
        const t = thumbExport
        if (!t || !isReady) return
        const request: ExportRequest =
            t.pageId && t.pageId !== canvas.currentPageId()
                ? { format: "png", pageId: t.pageId, width: THUMBNAIL_WIDTH }
                : { format: "svg" }
        canvas.export(request, 5000).then((result) => {
            if (!result?.data || thumbExport !== t) return
            if (!sameDiagram(latestXml, t.xml)) {
                thumbMissed = true
                return
            }
            thumbExport = null
            thumbMissed = false
            postJson("/history-svg", {
                sessionId,
                svg: svgDataUrl(result.data),
                stateId: t.stateId,
                version: t.version,
            })
                // The write's History entry has its picture now
                .then(emitChange)
                .catch(() => {})
        })
    }

    // Until draw.io reports the load (its messages come in order), an
    // autosave is from the canvas being replaced; in case no report comes,
    // not for long
    const expectLoad = () => {
        awaitingLoad = true
        if (awaitingLoadTimer) clearTimeout(awaitingLoadTimer)
        awaitingLoadTimer = setTimeout(() => {
            awaitingLoad = false
        }, 5000)
    }

    // Restore the user's real document after a page-targeted projection
    // export by reloading the server state (it also has any autosave that
    // was still in flight when the projection started). projectionExportActive
    // stays set until the poll loads the document: an edit on the
    // projection before that must not be pushed.
    const restoreFromProjection = () => {
        if (!projectionExportActive) return
        forceReload = true
        poll()
    }

    // source is "sync" for replies to a server sync request, "recover" for
    // the tab's copy after the server recovered the session, else "edit".
    // sid is the server state the push is based on.
    async function pushState(
        xml: string,
        svg = "",
        baseVersion = currentVersion,
        source: "edit" | "sync" | "recover" = "edit",
        sid = stateId,
    ): Promise<void> {
        pushesInFlight.push(xml)
        try {
            const r = await postJson("/state", {
                sessionId,
                xml,
                svg,
                baseVersion,
                source,
                stateId: sid,
            })
            pushFailing = false
            if (r.ok) {
                const d = await r.json()
                // An answer about a state this tab has left since, or one
                // that comes after a newer version was loaded or saved
                if (sid !== stateId || d.version < currentVersion) return
                currentVersion = d.version
                lastXml = xml
                noteHistory(d.historyKey ?? String(d.version), stateId)
                // The canvas changed while this edit was on its way, to
                // something no pending autosave will send (an undo back to
                // the previous version): send it now. A sync reply is
                // draw.io's export of the canvas, in another format than its
                // autosave.
                if (
                    latestXml &&
                    latestXml !== xml &&
                    pendingSvgExport !== latestXml &&
                    source === "edit"
                ) {
                    pushState(latestXml)
                }
            } else if (r.status === 413) {
                // Over the server's size limit: the image is most of it, so
                // try once without it
                if (svg) pushState(xml, "", baseVersion, source, sid)
                else onNotice("tooLarge")
            } else if (r.status === 409) {
                // The AI wrote a newer version, or the server lost the state
                // this push was based on; the next poll sorts it out
                const d = await r.json().catch(() => ({}))
                if (d.savedToHistory) {
                    onNotice(
                        source === "recover" ? "restoredFromFile" : "aiChanged",
                    )
                    // History grew without a new version
                    emitChange()
                }
                poll()
            }
        } catch (error) {
            console.error("Push failed:", error)
            setStatus("offline")
            if (!pushFailing) {
                pushFailing = true
                onNotice("unreachable")
            }
        } finally {
            pushesInFlight.splice(pushesInFlight.indexOf(xml), 1)
        }
    }

    // The server made a new state for this session: it expired, or the MCP
    // process restarted. Decide whose diagram wins.
    const recoverState = (s: ServerState) => {
        stateId = s.stateId
        options.onStateRecreated?.()
        // The old state's pending work is gone with it
        const projectionShown = projectionExportActive
        endProjection()
        forceReload = false
        pendingMcpExport = null
        pendingSyncExport = false
        const mine = latestXml
        currentVersion = s.version
        if (s.blank || s.xml === lastXml) {
            // The server knows nothing, or exactly what this tab last saved:
            // the canvas can only be newer, so it wins (edits made while the
            // server was down are saved now)
            if (projectionShown && mine) {
                canvas.load(mine, { mode: "load" })
                expectLoad()
            }
            if (mine && !sameDiagram(mine, s.xml)) {
                pushState(mine, "", s.version)
            } else if (s.xml && !s.blank && mine) {
                // The canvas still shows the diagram the server recovered:
                // its History entry came back without a picture (the file
                // keeps none), take one now
                thumbExport = { stateId, version: currentVersion, xml: s.xml }
                thumbMissed = false
                captureThumbnail()
            }
        } else if (s.xml) {
            // The server has a diagram this tab never showed (an AI write it
            // missed, a saved file): show that, and keep this tab's copy in
            // History unless it is the same. A full load, as the classic
            // page does: whether the canvas can take the write in place is
            // decided inside DiagramProvider, and the sync cannot tell; until
            // draw.io reports the load, an autosave is from the canvas being
            // replaced
            loadFromServer(s.xml, "full")
            expectLoad()
            if (mine && !sameDiagram(mine, s.xml)) {
                pushState(mine, "", s.version, "recover")
            }
        }
    }

    const startSyncExport = () => {
        pendingSyncExport = true
        // The version and state the export is taken at: a newer AI write may
        // load meanwhile, and this older XML must not overwrite it
        const base = currentVersion
        const sid = stateId
        const seq = ++syncExportSeq
        canvas.export({ format: "xml" }, 5000).then((result) => {
            // A late reply to an earlier request was taken at another version
            if (seq !== syncExportSeq) return
            pendingSyncExport = false
            if (result?.xml) pushState(result.xml, "", base, "sync", sid)
        })
    }

    // Handle an export request from the MCP server (png/svg).
    //
    // Plain export: capture whatever page is on screen (PNG: pageId picks a
    // page, width caps the size).
    //
    // Page-targeted export: the server sends a single-page <mxfile>
    // projection in exportXml. It goes on the canvas as a transient
    // document, draw.io renders it, exports, then the real document is
    // loaded back from the server. The session state is never changed.
    const startMcpExport = (s: ServerState, justLoaded: boolean) => {
        const format = s.exportFormat as ExportFormat
        pendingMcpExport = format
        const seq = ++mcpExportSeq
        mcpExportId = s.exportId
        const extra = s.exportOptions ?? {}
        const fire = () => {
            // The server's options (margin, background, PNG page and size)
            // go to draw.io as they are
            const request: ExportRequest =
                format === "png"
                    ? {
                          format: "png",
                          scale: 2,
                          currentPage: !extra.pageId,
                          ...extra,
                      }
                    : { format, ...extra }
            canvas.export(request, 10000).then((result) => {
                // A later export is running by now, or this one ended
                if (seq !== mcpExportSeq || pendingMcpExport === null) return
                const d = result?.data ?? ""
                const isPng = format === "png" && d.startsWith("data:image/png")
                const isSvg =
                    format !== "png" &&
                    (d.startsWith("data:image/svg") || d.startsWith("<svg"))
                const done = () => {
                    if (seq !== mcpExportSeq) return
                    pendingMcpExport = null
                    // Page-targeted export: restore the user's real document
                    restoreFromProjection()
                }
                if (!isPng && !isSvg) {
                    done()
                    return
                }
                // Keep pendingMcpExport set until the server has the result:
                // a poll answered before that still sees the request and
                // would start the same export again
                postJson("/state", {
                    sessionId,
                    exportData: d,
                    exportId: mcpExportId,
                })
                    .catch(() => {})
                    .finally(done)
            })
        }
        if (s.exportXml) {
            projectionExportActive = true
            canvas.showTransient(s.exportXml)
            // Let draw.io render the loaded page before exporting
            setTimeout(fire, 600)
        } else if (justLoaded) {
            // A write with a screenshot: give the new diagram's external
            // icon images a moment to load before the PNG is taken
            setTimeout(fire, 600)
        } else {
            fire()
        }
        // The whole export, result delivery included, ends in time: a result
        // POST that never answers must not keep the projection on screen
        // past the server's deadline (15 s). Only for this export: a later
        // one may be running by then. The export is over: its result POST
        // answering after this must not restore the document a second time.
        setTimeout(() => {
            if (pendingMcpExport && seq === mcpExportSeq) {
                mcpExportSeq++
                pendingMcpExport = null
                restoreFromProjection()
            }
        }, 15000)
    }

    async function poll(): Promise<void> {
        const seq = ++pollSeq
        try {
            const r = await api(
                `/state?sessionId=${encodeURIComponent(sessionId)}`,
            )
            if (!r.ok) {
                // Refused (another process answers on this port and its
                // token could not be read) or failing: edits are not saved
                setStatus("offline")
                return
            }
            const s: ServerState = await r.json()
            // An older answer than one already handled (the interval, the
            // 409 handler and the projection restore each poll): it could
            // name a state that is gone
            if (seq < lastHandledPoll) return
            lastHandledPoll = seq
            setStatus("connected")
            if (stateId === null) stateId = s.stateId
            else if (s.stateId && s.stateId !== stateId) recoverState(s)
            // Load a new version (before an export, so it pictures the
            // latest). While a projection is on screen, only the restore
            // (forceReload) replaces it, so a new version doesn't fight the
            // projection; currentVersion stays unadvanced until then. The
            // tab's own push still on its way is not loaded back: the canvas
            // may have moved on since (an undo), and its answer follows.
            const ownPush = s.xml !== null && pushesInFlight.includes(s.xml)
            let justLoaded = false
            if (
                (forceReload ||
                    (s.version > currentVersion &&
                        !projectionExportActive &&
                        !ownPush)) &&
                s.xml
            ) {
                // The restore after a projection is a full load of the
                // document the user had
                const how = forceReload ? "full" : "decide"
                forceReload = false
                currentVersion = s.version
                loadFromServer(s.xml, how)
                // The projection stays on screen until draw.io reports this
                // load (its messages come in order): an autosave before that
                // is of the projection, not an edit
                if (projectionExportActive && !projectionRestoreTimer) {
                    projectionRestoreTimer = setTimeout(endProjection, 5000)
                }
                justLoaded = true
            }
            // Also the tab's own push, and a version a projection holds back
            noteHistory(s.historyKey ?? String(s.version), stateId)
            // The header names the file; listeners read it with read()
            if ((s.file ?? null) !== file || !!s.fileChanged !== fileChanged) {
                file = s.file ?? null
                fileChanged = !!s.fileChanged
                emitChange()
            }
            // A sync request (get_diagram): after the load above, so draw.io
            // exports what it just loaded; never while a one-page projection
            // is on screen, which would be sent as the whole document
            if (
                s.syncRequested &&
                !pendingSyncExport &&
                isReady &&
                !projectionExportActive
            ) {
                startSyncExport()
            }
            // Nor an export while the projection is still on screen: it
            // would picture the projection
            if (
                s.exportFormat &&
                !pendingMcpExport &&
                isReady &&
                !projectionExportActive
            ) {
                startMcpExport(s, justLoaded)
            }
            // A selection request (get_selection): the editor's selection
            // on the page the user is viewing, once draw.io is up (the
            // bridge attaches to it at its first load), not while a
            // projection replaces that page, and not while a full load (the
            // one above, or one still on its way) has yet to reach the
            // editor: it still shows the previous document
            if (
                s.selectionId &&
                s.selectionId !== answeredSelectionId &&
                isReady &&
                !projectionExportActive &&
                !canvas.loadPending()
            ) {
                const id = s.selectionId
                answeredSelectionId = id
                const answer = () => {
                    // A hidden tab answers later: the canvas may have moved
                    // on since the poll (a projection, a full load, draw.io
                    // starting over). The same conditions as above; when
                    // they no longer hold, the next poll decides again
                    if (
                        !isReady ||
                        projectionExportActive ||
                        canvas.loadPending()
                    ) {
                        if (answeredSelectionId === id) {
                            answeredSelectionId = null
                        }
                        return
                    }
                    postJson("/state", {
                        sessionId,
                        selectionId: id,
                        selection: canvas.readSelection(),
                    })
                        .then((r) => {
                            if (!r.ok) throw new Error(String(r.status))
                        })
                        .catch(() => {
                            // Not delivered: the next poll answers it again
                            if (answeredSelectionId === id) {
                                answeredSelectionId = null
                            }
                        })
                }
                // A hidden tab lets a tab in front (the same session open
                // twice) answer first; the server takes the first answer
                // and ignores the later one
                if (options.isHidden?.()) {
                    setTimeout(answer, POLL_INTERVAL_MS + 500)
                } else {
                    answer()
                }
            }
        } catch {
            setStatus("offline")
        }
    }

    return {
        start() {
            if (interval) return
            poll()
            interval = setInterval(poll, POLL_INTERVAL_MS)
        },
        stop() {
            if (interval) clearInterval(interval)
            interval = null
        },
        poll,
        setReady(ready) {
            isReady = ready
            // draw.io is starting over (an external editor reloads on a
            // theme switch): an export in flight gets no answer, and a
            // projection on the canvas is gone with the old frame. The next
            // poll puts the document back and starts the server's export
            // again
            if (!ready && pendingMcpExport !== null) {
                mcpExportSeq++
                pendingMcpExport = null
                if (projectionExportActive) forceReload = true
            }
            // A write loaded before draw.io was ready gets its thumbnail now
            if (ready && thumbExport) captureThumbnail()
        },
        onAutoSave(xml) {
            // Ignore autosave while a single-page projection is on screen
            // for a page-targeted export; otherwise the projection would be
            // pushed as the session's document
            if (projectionExportActive) return
            // An edit of the canvas that recovery is replacing: kept in
            // History, never over the recovered diagram
            if (awaitingLoad) {
                pushState(xml, "", currentVersion, "recover")
                return
            }
            // Also an edit undone back to what the server has, or draw.io's
            // own copy of a write it took in place (a commit). Compared as
            // documents only for that copy: a change of the paper size alone
            // is the same document to isSameDocument when the server's copy
            // names none
            latestXml = xml
            const commitCopy = awaitingCommitCopy
            awaitingCommitCopy = false
            // The canvas is back at a write whose picture was not taken (an
            // edit came first): take it now
            if (
                thumbMissed &&
                thumbExport &&
                sameDiagram(xml, thumbExport.xml)
            ) {
                thumbMissed = false
                captureThumbnail()
            }
            if (xml === lastXml || (commitCopy && sameDiagram(xml, lastXml))) {
                return
            }
            lastEditAt = Date.now()
            // Request an SVG export, then push the edit with it; remember
            // the version and state it is based on. Without an answer in
            // time, push it without the image.
            pendingSvgExport = xml
            const base = currentVersion
            const sid = stateId
            canvas.export({ format: "svg" }, 2000).then((result) => {
                // A later edit took over the slot, or this one was sent
                if (pendingSvgExport !== xml) return
                pendingSvgExport = null
                const svg = result?.data ? svgDataUrl(result.data) : ""
                pushState(xml, svg, base, "edit", sid)
            })
        },
        onDrawioLoad() {
            awaitingLoad = false
            // A commit that fell back to a full load sends no copy
            awaitingCommitCopy = false
            // The restore load after a projection export is done
            if (projectionRestoreTimer) endProjection()
        },
        async fetchHistory() {
            // A list for a state the server recreated meanwhile has old ids
            const sid = stateId
            // A failed read is told again at the next poll: no other event
            // comes for the same History
            const failed = () => {
                notedKey = null
                return null
            }
            try {
                const r = await api(
                    `/history?sessionId=${encodeURIComponent(sessionId)}`,
                )
                if (!r.ok) return failed()
                const d = await r.json()
                if (sid !== stateId) return null
                // A list from a state the poll has not seen yet (another
                // process answers): its poll tells the cards to read again
                if (typeof d.stateId === "string" && d.stateId !== sid) {
                    return null
                }
                return {
                    entries: d.entries ?? [],
                    stateId: sid,
                    currentId:
                        typeof d.currentId === "number" ? d.currentId : null,
                }
            } catch {
                return failed()
            }
        },
        async restoreEntry(id, listStateId) {
            try {
                const r = await postJson("/restore", {
                    sessionId,
                    id,
                    stateId: listStateId,
                })
                if (r.ok) {
                    await poll()
                    return "ok"
                }
                if (r.status === 409) {
                    onNotice("historyChanged")
                    return "stale"
                }
            } catch {
                // reported below
            }
            onNotice("restoreFailed")
            return "failed"
        },
        onServerChange(listener) {
            changeListeners.add(listener)
            return () => {
                changeListeners.delete(listener)
            }
        },
        read() {
            return {
                stateId,
                currentVersion,
                lastXml,
                latestXml,
                projectionActive: projectionExportActive,
                status,
                file,
                fileChanged,
            }
        },
    }
}
