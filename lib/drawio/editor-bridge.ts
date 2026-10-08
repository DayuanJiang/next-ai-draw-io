/**
 * Direct access to the draw.io editor running in our same-origin iframe.
 *
 * draw.io has no public JavaScript API for embedders; everything here uses
 * its internal objects (EditorUi, mxGraph). Every call checks that what it
 * needs exists, so a draw.io update that renames something turns the feature
 * off (with a console warning) instead of breaking the page.
 *
 * With an external draw.io (cross-origin) none of this is available and the
 * app uses the postMessage protocol only.
 */
import { sameFileVars } from "@/lib/diagram-diff"
import { hasCells } from "@/packages/mcp-server/src/pages.ts"
import { type SelectedCell, useCanvasStore } from "@/stores/canvas-store"

type EditorUi = any
type FrameWindow = any

let ui: EditorUi | null = null
let win: FrameWindow | null = null
let detachListeners: (() => void) | null = null
const warned = new Set<string>()
// Keyboard shortcuts of the app that must also work while focus is inside
// the draw.io iframe (keydown events there never reach our window)
let appShortcutHandler: ((event: KeyboardEvent) => boolean) | null = null

/** The handler returns true when it handled the key */
export function setAppShortcutHandler(
    handler: ((event: KeyboardEvent) => boolean) | null,
) {
    appShortcutHandler = handler
}

function warnOnce(key: string, message: string) {
    if (warned.has(key)) return
    warned.add(key)
    console.warn(`[drawio] ${message}`)
}

export function attachEditor(editorUi: EditorUi, frameWindow: FrameWindow) {
    if (ui === editorUi) return
    detachEditor()
    ui = editorUi
    win = frameWindow
    detachListeners = installListeners()
    keepPanelsOnResize()
    closeSidePanels()
    softenGrid()
    useCanvasStore.getState().set({ hasEditor: true })
    syncAll()
}

// draw.io's simple UI opens or closes its format panel and shape library
// when its window crosses a width; the user opens them from its toolbar, so
// a resize (the chat panel sliding, a narrow window) must leave them alone.
// windowResized only toggles them when it knows the previous width.
function keepPanelsOnResize() {
    const original = ui?.windowResized
    if (typeof original !== "function" || original.naiWrapped) return
    const wrapped = function (this: any, ...args: unknown[]) {
        this.lastWindowWidth = null
        return original.apply(this, args)
    }
    wrapped.naiWrapped = true
    ui.windowResized = wrapped
}

// draw.io's grid (#e6e6e6 every 10 px) is busy behind pale shapes
function softenGrid() {
    const view = graph()?.view
    if (!view) return
    try {
        view.gridColor = "#eceef1"
        view.validateBackground()
    } catch {
        // ignore
    }
}

// draw.io opens its format panel and shape library on start, which leaves
// little room for the diagram next to the chat panel; its toolbar opens them
function closeSidePanels() {
    try {
        if (isFormatPanelOpen()) ui.actions?.get?.("format")?.funct()
    } catch {
        // ignore
    }
    try {
        if (ui.sidebarWindow?.window?.isVisible?.()) {
            ui.sidebarWindow.window.setVisible(false)
        } else if (ui.isShapesPanelVisible?.()) {
            // At once, as the end of draw.io's toggleShapesPanel does: its
            // slide takes a moment, and a diagram loaded meanwhile is
            // centered in the narrower canvas
            ui.hsplitPosition = 0
            ui.refresh()
            ui.fireEvent?.(new win.mxEventObject("shapesPanelChanged"))
        }
    } catch {
        // ignore
    }
}

export function detachEditor() {
    detachListeners?.()
    detachListeners = null
    clearHighlights()
    ui = null
    win = null
    previewBase = null
    useCanvasStore.getState().set({
        hasEditor: false,
        selection: [],
        selectionRect: null,
        isDrawioPopupOpen: false,
    })
}

function graph() {
    return ui?.editor?.graph ?? null
}

// ---------------------------------------------------------------------------
// Replacing the diagram (AI changes)
// ---------------------------------------------------------------------------

// Diagram before the current AI turn started streaming. Previews are applied
// without undo history; the final result replaces this base as one undo step.
let previewBase: string | null = null

function currentFileXml(): string | null {
    try {
        const node = ui.getXmlFileData(null, null, true)
        return win.mxUtils.getXml(node)
    } catch {
        return null
    }
}

function withoutUndo(fn: () => void) {
    const manager = ui?.editor?.undoManager
    if (!manager?.undoableEditHappened) {
        fn()
        return
    }
    const original = manager.undoableEditHappened
    manager.undoableEditHappened = () => {}
    try {
        fn()
    } finally {
        manager.undoableEditHappened = original
    }
}

/**
 * replaceDiagramData replaces the current page with one <mxGraphModel>. Only
 * single-page documents qualify; multi-page ones fall back to a full load.
 */
function toSinglePageModel(xml: string): string | null {
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    if (doc.querySelector("parsererror")) return null
    const root = doc.documentElement
    if (root.nodeName === "mxGraphModel") return xml
    if (root.nodeName !== "mxfile") return null
    const diagrams = root.getElementsByTagName("diagram")
    if (diagrams.length !== 1) return null
    const model = diagrams[0].getElementsByTagName("mxGraphModel")[0]
    if (model) return new XMLSerializer().serializeToString(model)
    // Compressed page
    try {
        const text = diagrams[0].textContent?.trim()
        const inflated = text ? win?.Graph?.decompress?.(text) : null
        return typeof inflated === "string" &&
            inflated.includes("<mxGraphModel")
            ? inflated
            : null
    } catch {
        return null
    }
}

function replace(xml: string) {
    const model = toSinglePageModel(xml)
    if (!model || typeof ui?.replaceDiagramData !== "function") {
        throw new Error("Diagram can't be replaced in place")
    }
    ui.replaceDiagramData(model)
}

/** No shapes on any layer */
function isEmptyModel(): boolean {
    const g = graph()
    const root = g?.model.getRoot()
    if (!root) return true
    for (let i = 0; i < g.model.getChildCount(root); i++) {
        if (g.model.getChildCount(g.model.getChildAt(root, i)) > 0) {
            return false
        }
    }
    return true
}

/** Whether a page has shapes; layers (cells under the root) are none */
function hasShapes(xml: string): boolean {
    const model = toSinglePageModel(xml)
    if (model === null) return hasCells(xml)
    const cells = new DOMParser()
        .parseFromString(model, "text/xml")
        .getElementsByTagName("mxCell")
    return Array.from(cells).some((cell) => {
        const parent = cell.getAttribute("parent")
        return parent !== null && parent !== "0"
    })
}

// Page settings draw.io applies on a full load only: replacing the page in
// place (Editor.readGraphState) keeps the old ones. (Its adaptive colors and
// theme stay too: a diagram the AI writes does not set them.)
function hasLoadOnlySettings(model: string): boolean {
    const page = new DOMParser().parseFromString(
        model,
        "text/xml",
    ).documentElement
    return (
        page.hasAttribute("backgroundImage") ||
        page.hasAttribute("extFonts") ||
        page.getAttribute("math") === "1" ||
        page.getAttribute("shadow") === "1"
    )
}

function canvasHasLoadOnlySettings(): boolean {
    const g = graph()
    return (
        !!g &&
        (!!g.backgroundImage ||
            !!g.mathEnabled ||
            !!g.shadowVisible ||
            (g.extFonts?.length ?? 0) > 0)
    )
}

/** The file variables (%name% placeholders) a document sets, if any */
function fileVars(xml: string): string | null {
    const root = new DOMParser().parseFromString(
        xml,
        "text/xml",
    ).documentElement
    return root?.nodeName === "mxfile" ? root.getAttribute("vars") : null
}

/** Can this diagram go through the editor (with undo) instead of a full load? */
export function canReplaceDiagram(xml: string): boolean {
    if (!ui) return false
    if (typeof ui.replaceDiagramData !== "function") {
        warnOnce("replace", "replaceDiagramData not found, using full loads")
        return false
    }
    const pageCount = Array.isArray(ui.pages) ? ui.pages.length : 1
    if (pageCount > 1) return false
    // Replacing the page keeps the file's variables: other ones, or none
    // over a file with some, load in full
    if (
        !sameFileVars(
            fileVars(xml),
            ui.fileNode?.getAttribute?.("vars") ?? null,
        )
    ) {
        return false
    }
    const model = toSinglePageModel(xml)
    // A document with them, or replacing one with them, loads in full
    return (
        model !== null &&
        !hasLoadOnlySettings(model) &&
        !canvasHasLoadOnlySettings()
    )
}

/** Show a streaming preview without touching the undo history */
export function previewDiagram(xml: string) {
    if (previewBase === null) previewBase = currentFileXml() ?? ""
    const wasEmpty = isEmptyModel()
    withoutUndo(() => replace(xml))
    if (wasEmpty) fitDiagram()
}

/** Name and id of the page in a single-page mxfile, if it has them */
function pageOf(xml: string): { name: string | null; id: string | null } {
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const diagram =
        doc.documentElement?.nodeName === "mxfile"
            ? doc.getElementsByTagName("diagram")[0]
            : undefined
    return {
        name: diagram?.getAttribute("name") || null,
        id: diagram?.getAttribute("id") || null,
    }
}

/**
 * A change of the page's id for draw.io's undo history (it has none of its
 * own): execute swaps the ids, as draw.io's RenamePage does with names
 */
function changePageId(page: any, id: string) {
    let other = id
    return {
        execute() {
            const current = page.getId()
            page.node.setAttribute("id", other)
            other = current
        },
    }
}

/**
 * Apply the final AI result (or a restored version) as a single undo step,
 * page name and id included: the page gets the document's id, as a full
 * load would give it (links to the page use it). The view is fitted only
 * when the canvas was empty, so a restore keeps the user's zoom.
 */
export function commitDiagram(xml: string) {
    const wasEmpty =
        isEmptyModel() || (previewBase !== null && !hasShapes(previewBase))
    const base = previewBase ? toSinglePageModel(previewBase) : null
    previewBase = null
    // Undo goes back to the diagram before streaming started. draw.io's
    // ReplaceDiagram change keeps the document it replaced for undo: hand it
    // that diagram, so the canvas changes once. (Putting it back on the
    // canvas first would also send it to the app, after the result.)
    const ReplaceDiagram = win?.ReplaceDiagram
    const parse = (model: string) => win.mxUtils.parseXml(model).documentElement
    const direct = typeof ReplaceDiagram === "function" && !!win?.mxUtils
    if (base && !direct) withoutUndo(() => replace(base))
    const model = graph()?.model
    const { name, id } = pageOf(xml)
    const page = ui?.currentPage
    model?.beginUpdate()
    try {
        const next = toSinglePageModel(xml)
        if (direct && next) {
            const change = new ReplaceDiagram(ui, parse(next))
            model.execute(change)
            if (base) change.data = parse(base)
        } else {
            replace(xml)
        }
        if (name && page && win?.RenamePage && page.getName?.() !== name) {
            model.execute(new win.RenamePage(ui, page, name))
        }
        if (id && page?.node && page.getId?.() !== id) {
            model.execute(changePageId(page, id))
        }
    } finally {
        model?.endUpdate()
    }
    if (wasEmpty) fitDiagram()
}

/** Throw away the preview and go back to the given diagram */
export function revertPreview(targetXml: string) {
    previewBase = null
    withoutUndo(() => replace(targetXml))
}

/** Forget the preview base (new user turn) without changing the canvas */
export function resetPreview() {
    previewBase = null
}

// When the app last fitted the diagram on its own; a canvas resize right
// after (the chat panel sliding in) fits again, unless the user zoomed since
let lastAutoFitAt = 0

// True while fitDiagram runs: its own zoom change is not the user's
let fitting = false

/** The zoom changed: if the user did it, a later resize keeps their view */
function zoomChanged() {
    if (!fitting) lastAutoFitAt = 0
}

/** Fit again if the last automatic fit just happened (layout still moving) */
export function refitIfRecent(windowMs = 1500) {
    if (Date.now() - lastAutoFitAt < windowMs) {
        fitDiagram()
        return true
    }
    return false
}

// Room around a fitted diagram (half of this on each side)
const FIT_BORDER = 128

/** Fit the shapes (not the whole page) into the canvas, at most at 100% */
function fitDiagram() {
    const g = graph()
    if (!g) return
    fitting = true
    try {
        const b = g.getGraphBounds()
        const { scale, translate } = g.view
        if (b && b.width > 0 && b.height > 0 && win?.mxRectangle) {
            const model = new win.mxRectangle(
                b.x / scale - translate.x,
                b.y / scale - translate.y,
                b.width / scale,
                b.height / scale,
            )
            g.fitWindow(model, FIT_BORDER, 1)
        } else if (ui?.actions?.get?.("fitWindow")) {
            ui.actions.get("fitWindow").funct()
            if (g.view.scale > 1) g.zoomTo(1, true)
        }
    } catch {
        // ignore
    } finally {
        fitting = false
    }
    // After the zoom events of the fit itself
    lastAutoFitAt = Date.now()
}

/** The canvas changed width: keep what was in the middle in the middle */
export function keepCenter(oldWidth: number, newWidth: number) {
    const container = graph()?.container
    if (!container || !oldWidth || !newWidth) return
    container.scrollLeft += (oldWidth - newWidth) / 2
}

// ---------------------------------------------------------------------------
// Highlighting what the AI changed
// ---------------------------------------------------------------------------

let highlights: any[] = []

export function clearHighlights() {
    for (const h of highlights) {
        try {
            h.destroy()
        } catch {
            // ignore
        }
    }
    highlights = []
}

// Outline of changed shapes: dark enough to show on white paper and on
// draw.io's pale fills (yellow ones included)
const HIGHLIGHT_OUTLINE = "#a86b00"

/**
 * Marks changed cells: shapes get a soft halo plus a thin outline,
 * connectors only the outline (a halo would cover their labels and arrows)
 */
export function highlightCells(ids: string[], color: string) {
    clearHighlights()
    const g = graph()
    if (!g || !win?.mxCellHighlight || ids.length === 0) return
    const add = (
        state: any,
        stroke: string,
        width: number,
        opacity: number,
    ) => {
        const h = new win.mxCellHighlight(g, stroke, width)
        h.opacity = opacity
        h.highlight(state)
        highlights.push(h)
    }
    for (const id of ids.slice(0, 200)) {
        const cell = g.model.getCell(id)
        const state = cell ? g.view.getState(cell) : null
        if (!state) continue
        if (!g.model.isEdge(cell)) add(state, color, 8, 18)
        add(state, HIGHLIGHT_OUTLINE, 2, 100)
    }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function cellLabel(cell: any): string {
    const g = graph()
    let text = ""
    try {
        text = g?.convertValueToString(cell) ?? ""
    } catch {
        text = ""
    }
    // Labels can contain HTML
    text = text
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim()
    return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

function readSelection(): SelectedCell[] {
    const g = graph()
    if (!g) return []
    return (g.getSelectionCells() as any[])
        .filter((cell) => cell?.id)
        .map((cell) => ({
            id: String(cell.id),
            label: cellLabel(cell),
            isEdge: !!g.model.isEdge(cell),
        }))
}

function readSelectionRect() {
    const g = graph()
    if (!g || g.isSelectionEmpty()) return null
    const cells = g.getSelectionCells()
    const bounds = g.view.getBounds(cells)
    if (!bounds) return null
    const container = g.container as HTMLElement
    const rect = container.getBoundingClientRect()
    return {
        x: rect.left + bounds.x - container.scrollLeft,
        y: rect.top + bounds.y - container.scrollTop,
        width: bounds.width,
        height: bounds.height,
    }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function readPages() {
    const pages = (ui?.pages ?? []) as any[]
    return pages.map((page, index) => ({
        id: String(page.getId?.() ?? index),
        name: String(page.getName?.() ?? `Page-${index + 1}`),
    }))
}

// ---------------------------------------------------------------------------
// Keeping the store in sync
// ---------------------------------------------------------------------------

function syncSelectionRect() {
    useCanvasStore.getState().set({ selectionRect: readSelectionRect() })
}

function syncAll() {
    if (!ui) return
    const g = graph()
    useCanvasStore.getState().set({
        pages: readPages(),
        currentPageId: ui.currentPage?.getId
            ? String(ui.currentPage.getId())
            : null,
        selection: readSelection(),
        selectionRect: readSelectionRect(),
        isFreehand: !!g?.freehand?.isDrawing?.(),
    })
}

function isFormatPanelOpen(): boolean {
    try {
        if (typeof ui.isFormatPanelVisible === "function") {
            return !!ui.isFormatPanelVisible()
        }
        return (ui.formatWidth ?? 0) > 0
    } catch {
        return false
    }
}

function installListeners(): () => void {
    const g = graph()
    if (!g || !win?.mxEvent) return () => {}
    const mxEvent = win.mxEvent
    const cleanups: (() => void)[] = []

    const listen = (source: any, name: string, handler: () => void) => {
        if (!source?.addListener) return
        source.addListener(name, handler)
        cleanups.push(() => source.removeListener(handler))
    }

    // Any user action ends the "what the AI just changed" highlight
    const onSelection = () => {
        clearHighlights()
        syncAll()
    }
    const onScale = () => {
        zoomChanged()
        syncSelectionRect()
    }

    listen(g.getSelectionModel(), mxEvent.CHANGE, onSelection)
    listen(g.model, mxEvent.CHANGE, syncAll)
    // Drawing started or stopped: the "ask AI" button hides meanwhile
    listen(g, "freehandStateChanged", syncAll)
    listen(g.view, mxEvent.SCALE, onScale)
    listen(g.view, mxEvent.TRANSLATE, syncSelectionRect)
    listen(g.view, mxEvent.SCALE_AND_TRANSLATE, onScale)
    listen(ui.editor, "pageSelected", syncAll)

    // Capture phase, so the app shortcut wins before draw.io's key handler
    const onKeyDown = (event: KeyboardEvent) => {
        if (appShortcutHandler?.(event)) {
            event.preventDefault()
            event.stopPropagation()
        }
    }
    const frameDocument = win.document as Document | undefined
    frameDocument?.addEventListener("keydown", onKeyDown, true)
    cleanups.push(() =>
        frameDocument?.removeEventListener("keydown", onKeyDown, true),
    )

    // draw.io adds its menus and dialogs to its body, and the shape picker
    // (from the arrows next to a selection) to the canvas, and removes them
    // when they close: the "ask AI" button over the frame must not cover them
    const body = frameDocument?.body
    const canvas = g.container as HTMLElement | undefined
    if (body && canvas && win.MutationObserver) {
        const syncPopups = () =>
            useCanvasStore.getState().set({
                isDrawioPopupOpen:
                    !!body.querySelector(
                        ":scope > .mxPopupMenu, :scope > .geDialog",
                    ) || !!canvas.querySelector(":scope > .geShapePicker"),
            })
        const observer = new win.MutationObserver(syncPopups)
        observer.observe(body, { childList: true })
        observer.observe(canvas, { childList: true })
        cleanups.push(() => observer.disconnect())
    }

    const container = g.container as HTMLElement | undefined
    container?.addEventListener("scroll", syncSelectionRect, { passive: true })
    cleanups.push(() =>
        container?.removeEventListener("scroll", syncSelectionRect),
    )

    return () => {
        for (const cleanup of cleanups) cleanup()
    }
}

/**
 * Finds the EditorUi instance inside a same-origin draw.io iframe.
 *
 * draw.io keeps no global reference to it, so we wrap prototype methods it
 * calls on startup and after every load; the first call hands us `this`.
 * Returns false when the frame is cross-origin.
 */
export function watchForEditorUi(
    frameWindow: Window,
    onFound: (editorUi: EditorUi) => void,
): boolean {
    let w: any
    try {
        w = frameWindow as any
        // Throws for a cross-origin frame
        void w.document
    } catch {
        return false
    }
    const hook = (proto: any, method: string) => {
        if (!proto || typeof proto[method] !== "function") return
        if (proto[method].__naiWrapped) return
        const original = proto[method]
        const wrapped = function (this: any, ...args: any[]) {
            onFound(this)
            return original.apply(this, args)
        }
        ;(wrapped as any).__naiWrapped = true
        proto[method] = wrapped
    }
    hook(w.EditorUi?.prototype, "updateActionStates")
    hook(w.App?.prototype, "fileLoaded")
    hook(w.EditorUi?.prototype, "fileLoaded")
    return true
}
