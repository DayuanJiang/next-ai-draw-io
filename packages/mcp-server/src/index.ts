#!/usr/bin/env node
/**
 * MCP Server for Next AI Draw.io
 *
 * Enables AI agents (Claude Desktop, Cursor, etc.) to generate and edit
 * draw.io diagrams with real-time browser preview.
 *
 * Uses an embedded HTTP server - no external dependencies required.
 *
 * Multi-page support
 * ------------------
 * The canonical in-memory shape for the session XML is always an <mxfile>
 * containing one or more <diagram> pages. Legacy callers that pass a bare
 * <mxGraphModel> to create_new_diagram are auto-wrapped into a single-page
 * mxfile. All page-targeting parameters (page_id / page_name / page_index)
 * on edit_diagram, get_diagram, and export_diagram are optional and default
 * to the first page. See packages/mcp-server/src/pages.ts for the helper
 * surface.
 */

import { spawn } from "node:child_process"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import {
    McpServer,
    type ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js"
import type {
    CallToolResult,
    ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js"
import open from "open"
import { z } from "zod"
import { foldCells } from "./compact-cells.ts"
import {
    customInstructionsPath,
    guideWithCustomInstructions,
} from "./custom-instructions.ts"
import type { DiagramOperation } from "./diagram-operations.ts"
import { installDomPolyfill } from "./dom.ts"
import { DRAWING_GUIDE } from "./drawing-guide.ts"
import { editDiagram, targetPageXml } from "./edit-diagram.ts"
import {
    checkEditGate,
    contentFingerprint,
    countChanges,
    describeChanges,
    markPageSeen,
} from "./edit-gate.ts"
import { imageRefNote, restoreImageData } from "./embedded-images.ts"
import { createExclusive } from "./exclusive.ts"
import {
    addHistory,
    getHistory,
    type HistoryEntry,
    type HistorySource,
    isInHistory,
    otherVersions,
} from "./history.ts"
import {
    activePreviewUi,
    changeCount,
    DRAWIO_BASE_URL,
    type ExportFormat,
    type ExportOptions,
    getServerPort,
    getState,
    isSameOriginDrawio,
    keepInHistory,
    onSessionRecreate,
    onStateChange,
    PREVIEW_UI,
    previewUrl,
    readSelection,
    requestExport,
    requestSync,
    restoreHistoryEntry,
    restoreSavedSession,
    setSessionFile,
    setState,
    shutdown,
    startHttpServer,
    waitForSync,
} from "./http-server.ts"
import { parseDrawioFileContent } from "./load-diagram.ts"
import { log } from "./logger.ts"
import { prepareNewDiagram, prepareNewModel } from "./new-diagram.ts"
import {
    addPageToDoc,
    BLANK_MXFILE,
    deletePageFromDoc,
    findPageElement,
    hasCells,
    hasPageSelector,
    listPagesFromDoc,
    normalizeToMxfile,
    type PageSelector,
    parseMxfile,
    projectPage,
    renamePageInDoc,
    serializeMxfile,
} from "./pages.ts"
import { Autosaver, defaultDataDir, expandHome } from "./persistence.ts"
import { describeSelection } from "./selection.ts"
import { getShapeLibrary, SHAPE_LIBRARY_LIST } from "./shape-library.ts"
import { XML_REFERENCE } from "./xml-reference.ts"

// DOMParser/XMLSerializer globals for the XML helpers (Node has neither)
installDomPolyfill()

// Server configuration
const config = {
    port: parseInt(process.env.PORT || "6002", 10),
    // Attach a screenshot to every create_new_diagram and edit_diagram
    // result unless the call says otherwise
    autoScreenshot: process.env.DRAWIO_AUTO_SCREENSHOT === "true",
}

// Keep each session's latest diagram and its History on disk, so they
// survive this process
const autosaver = new Autosaver(defaultDataDir(), undefined, undefined, (id) =>
    getHistory(id),
)
onStateChange((sessionId, xml) => autosaver.schedule(sessionId, xml))
onSessionRecreate((sessionId) => {
    const saved = autosaver.load(sessionId)
    if (!saved) return null
    // A file draw.io saved (compressed pages) comes back as plain XML, as
    // with load_diagram
    const loaded = parseDrawioFileContent(saved)
    // History comes back with the diagram (addHistory drops consecutive
    // duplicates)
    for (const e of autosaver.loadHistory(sessionId)) {
        addHistory(sessionId, e.xml, "", e.source)
    }
    return loaded.ok ? loaded.xml : saved
})

// A one-page view that does not count for the whole document (edit-gate.ts)
const OTHER_PAGES_UNSEEN =
    "You have not seen the other pages in their current state."

// The preview outlines what a write changed (lib/drawio/editor-bridge.ts),
// which the model's own screenshots never show
const OUTLINE_NOTE =
    "The preview outlines the changed cells for a few seconds on the page that changed. The outline is not part of the diagram and never appears in exports or screenshots; never edit the diagram to remove it."
// The classic preview page (DRAWIO_PREVIEW_UI=classic) draws no outline
const outlineNote = () => (PREVIEW_UI === "classic" ? "" : OUTLINE_NOTE)

// get_diagram shows plain cells the way the model writes them (foldCells)
const COMPACT_NOTE =
    "Plain shapes are in compact form: x, y, w and h on the mxCell stand for its mxGeometry. edit_diagram and add_page take this form as it is."

/**
 * The browser's state of a session. After it expired (or the process
 * restarted) the saved file comes back first, so a tool never builds on an
 * older copy and then overwrites the file. Call it before requestSync or
 * requestExport, which need the state.
 */
function sessionState(sessionId: string) {
    restoreSavedSession(sessionId)
    return getState(sessionId)
}

// Session state (single session for simplicity)
type Session = {
    id: string
    xml: string
    // The exact state-store XML the model last saw (get_diagram) or wrote
    // itself (create/edit/page CRUD). The store only changes on server
    // writes or browser pushes (user autosave / sync), so edit_diagram can
    // detect unseen user edits by comparing the live store against this.
    // Empty = no diagram context established yet.
    lastSeenXml: string
}
let currentSession: Session | null = null

const NO_SESSION = "No active session. Please call start_session first."

/** The session of a tool registered with needsSession, checked before it ran */
function activeSession(): Session {
    if (!currentSession) throw new Error(NO_SESSION)
    return currentSession
}

/** A tool result of one text */
const ok = (text: string) => ({ content: [{ type: "text" as const, text }] })

/** A tool error; every tool reports its errors with this prefix */
const fail = (text: string) => ({
    content: [{ type: "text" as const, text: `Error: ${text}` }],
    isError: true as const,
})

// Create MCP server. The version reported in the MCP handshake is read from
// package.json so it can never drift from the published npm version again
// (it sat hardcoded at stale values for most of this package's history).
// Both src/ (tsx dev) and dist/ (published build) live one level below the
// package root, so the relative path works in either runtime.
const require = createRequire(import.meta.url)
const packageVersion: string = require("../package.json").version

// Hosts truncate instructions (Claude Code at 2,048 characters) and may show
// only the first 512, so the essentials come first. The full rules are in
// DRAWING_GUIDE, returned by start_session.
const INSTRUCTIONS = `next-ai-drawio creates and edits draw.io diagrams and shows them live in a browser preview, where the user can also edit them by hand. Use it for every change to a .drawio or .drawio.svg file too: load_diagram the file, edit with edit_diagram, then export_diagram to the same path; never write its XML yourself.

Start with start_session: it opens the preview and its result contains the drawing guide (layout, edge routing and style rules). Follow the guide when drawing; call get_drawing_guide if it is no longer in your context.

Before using cloud or icon shapes (AWS, Azure, GCP, Kubernetes, Cisco, BPMN...), call get_shape_library and use the exact style names it returns. Never guess icon style names.

To draw from a file, image or web page, read it yourself first; the server only receives XML.

After drawing or heavily editing a complex diagram, pass screenshot: true on that create_new_diagram or edit_diagram call (or call screenshot_diagram) to see the result, and fix overlapping shapes and edges that cross shapes.

Tools:
- create_new_diagram: draw a new diagram, replacing the whole document. Send only the mxCell elements of one page (the server adds the wrapper and root cells), or a full <mxfile> for several pages.
- edit_diagram: add, update or delete cells of an existing page by id. All-or-nothing; a rejected call includes the current XML so you can retry; also used to draw a large diagram in parts.
- get_diagram: read the current XML, including the user's manual edits.
- get_selection: the cells the user has selected in the preview, when they say "this box" or "these arrows".
- screenshot_diagram: see the rendered diagram as an image.
- load_diagram, export_diagram: open or save .drawio or .drawio.svg files and export .png or .svg. Use absolute paths.
- list_saved_diagrams: diagrams saved by earlier sessions; continue one with start_session session_id=<id>.
- list_pages, add_page, rename_page, delete_page: manage pages (tabs).
- restore_version: undo; go back to an earlier version of the diagram.`

const server = new McpServer(
    {
        name: "next-ai-drawio",
        version: packageVersion,
    },
    { instructions: INSTRUCTIONS },
)

// The tools that write the diagram, and start_session, run one at a time:
// two writes at once would both build on the same document, and the second
// would drop the first one's change. start_session in the queue keeps a
// session switch from landing in the middle of a write.
const exclusive = createExclusive()

/**
 * Register a tool. The handler returns its result or throws: an exception
 * comes back as a tool error (the SDK would report it too, without the
 * "Error: " prefix and the log line). With needsSession the handler runs
 * only when a session is active, so it can take activeSession() for
 * granted; write puts it in the queue above.
 */
function registerTool<Args extends ZodRawShapeCompat | undefined = undefined>(
    name: string,
    config: {
        title?: string
        description?: string
        inputSchema?: Args
        annotations?: ToolAnnotations
    },
    handler: ToolCallback<Args>,
    { write = false, needsSession = false } = {},
) {
    const run = async (...args: unknown[]) => {
        if (needsSession && !currentSession) return fail(NO_SESSION)
        try {
            return await (handler as (...a: unknown[]) => unknown)(...args)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            log.error(`${name} failed:`, message)
            return fail(message)
        }
    }
    server.registerTool(
        name,
        config,
        (write ? exclusive(run) : run) as ToolCallback<Args>,
    )
}

// Shared Zod schema fragment for page-targeting parameters.
// Every multi-page-aware tool reuses these three optional fields so the LLM
// learns one consistent interface.
const pageSelectorSchema = {
    page_id: z
        .string()
        .min(1)
        .optional()
        .describe(
            "Target a page by its id (as returned by list_pages or add_page). Wins over page_name and page_index when multiple are set.",
        ),
    page_name: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Target a page by its display name (e.g. "CNN"). Used only when page_id is not set.',
        ),
    page_index: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
            "Target a page by its 0-based tab index. Used only when page_id and page_name are not set.",
        ),
}

// The optional screenshot of create_new_diagram and edit_diagram
const screenshotSchema = z
    .boolean()
    .optional()
    .describe(
        "Also return a PNG of the result so you can check it for overlaps and edges crossing shapes. Needs the preview tab open and in front; adds 2 to 10 s. Default: the DRAWIO_AUTO_SCREENSHOT environment variable.",
    )

/** Format a selector for human-readable error messages. */
function describeSelector(s: PageSelector): string {
    if (s.page_id) return `id="${s.page_id}"`
    if (s.page_name) return `name="${s.page_name}"`
    if (s.page_index !== undefined) return `index=${s.page_index}`
    return "first page"
}

/** One line of pages for the tool results: index, id, name and cell count */
function describePages(xml: string, empty = "no pages parsed"): string {
    const doc = parseMxfile(xml)
    const pages = doc ? listPagesFromDoc(doc) : []
    return pages.length > 0
        ? `Pages (${pages.length}): ${pages.map((p) => `[${p.index}] id=${p.id} name="${p.name}" cells=${p.cellCount}`).join(" | ")}`
        : empty
}

/**
 * Take the browser's state of the session (the user's manual edits) into
 * the session as an <mxfile>: the embed/sync path can hand back a bare
 * <mxGraphModel>, and adopting it verbatim would strip a multi-page document
 * down to one page on the next write. Returns the state; the edit gate
 * compares against its raw xml.
 */
function syncFromBrowser(session: Session) {
    const browserState = sessionState(session.id)
    if (browserState?.xml) {
        session.xml = normalizeToMxfile(browserState.xml) ?? browserState.xml
    }
    return browserState
}

/**
 * Make xml the session's document: the previous one goes to History (with
 * the browser's image of it), the new one is pushed to the preview and
 * recorded in History (its image comes later, from the browser). seen: the
 * model wrote this exact XML knowing the state it built on, so edit_diagram
 * may follow without a get_diagram round-trip. source: what the version
 * cards call the entry (an opened file, an added page).
 */
function commitDocument(
    session: Session,
    xml: string,
    seen: boolean,
    browserSvg?: string,
    source?: HistorySource,
) {
    if (session.xml) keepInHistory(session.id, session.xml, browserSvg)
    session.xml = xml
    setState(session.id, xml)
    session.lastSeenXml = seen ? xml : ""
    addHistory(session.id, xml, "", source)
}

// The drawing guide plus the user's own rules from instructions.md, read
// on every call so edits apply without restarting the host
const guideText = () => guideWithCustomInstructions(DRAWING_GUIDE)

// The same guide as start_session, for hosts that show prompts to the user
server.registerPrompt(
    "diagram-workflow",
    {
        description: "Guidelines for creating and editing draw.io diagrams",
    },
    () => ({
        messages: [
            {
                role: "user",
                content: { type: "text", text: guideText() },
            },
        ],
    }),
)

// Tool: get_drawing_guide
registerTool(
    "get_drawing_guide",
    {
        title: "Get drawing guide",
        description:
            "Return the drawing guide: XML format, layout, edge routing, style and editing rules. " +
            "start_session already returns it; call this only if the guide is no longer in your context. " +
            "With topic, returns a short XML reference for tables, layers or groups.",
        inputSchema: {
            topic: z
                .enum(["tables", "layers", "groups"])
                .optional()
                .describe(
                    "Return only the XML reference for this topic instead of the whole guide.",
                ),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ topic }) => ok(topic ? XML_REFERENCE[topic] : guideText()),
)

// Tool: get_shape_library
registerTool(
    "get_shape_library",
    {
        title: "Get shape library",
        description:
            "Get the style syntax and shape names of a draw.io icon library. Call this BEFORE drawing with " +
            "cloud, network or other icon shapes, and use the exact names it returns; never guess them.\n\n" +
            `Libraries:\n${SHAPE_LIBRARY_LIST}`,
        inputSchema: {
            library: z
                .string()
                .describe("Library name, e.g. aws4, kubernetes, flowchart"),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ library }) => {
        const found = await getShapeLibrary(library)
        return found.ok ? ok(found.text) : fail(found.error)
    },
)

// On Windows the open package starts PowerShell with an encoded command,
// which Kaspersky blocks as PowerShell started from a script (#998).
// cmd's start hands the URL to the default browser instead
async function openBrowser(url: string) {
    if (process.platform !== "win32") return open(url)
    spawn(`start "" "${url}"`, {
        shell: true,
        stdio: "ignore",
        windowsHide: true,
    })
        .on("error", (err) => log.warn(`Could not open the browser: ${err}`))
        .unref()
}

// Tool: start_session
registerTool(
    "start_session",
    {
        title: "Start session",
        description:
            "Start a new diagram session, or continue a saved one with session_id, and open the browser for real-time preview. " +
            "Starts an embedded server and opens a browser window with draw.io. " +
            "The browser will show diagram updates as they happen. " +
            "The result includes the drawing guide; follow it when drawing.",
        inputSchema: {
            session_id: z
                .string()
                .regex(/^mcp-[a-z0-9-]{1,64}$/)
                .optional()
                .describe(
                    "Id of a saved diagram (from list_saved_diagrams, or the Session ID of an earlier start_session) to continue it with the same preview URL and auto-save file. Omit to start a new diagram.",
                ),
        },
        annotations: { destructiveHint: false, openWorldHint: false },
    },
    async ({ session_id }) => {
        // Start embedded HTTP server
        const port = await startHttpServer(config.port)

        // Create session, or continue a saved one under its old id
        const sessionId =
            session_id ??
            `mcp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
        currentSession = { id: sessionId, xml: "", lastSeenXml: "" }

        // Open the browser. BROWSER=none (the convention of CRA and Vite
        // dev servers) skips it: the e2e tests and headless hosts set it
        const browserUrl = previewUrl(port, sessionId)
        if (process.env.BROWSER !== "none") await openBrowser(browserUrl)

        // A saved diagram comes back from its file. lastSeenXml stays
        // empty, so edit_diagram asks for get_diagram first.
        const restored = sessionState(sessionId)
        let intro = "Session started successfully!"
        if (session_id) {
            // blank: the browser asked first and nothing was saved
            if (restored && !restored.blank) {
                intro = `Resumed session ${sessionId}.\n\n${describePages(restored.xml)}\n\nCall get_diagram before edit_diagram.`
            } else {
                intro = `No saved diagram for ${sessionId}; starting blank.`
            }
        }

        const savePath = autosaver.pathFor(sessionId)
        const saveNote = savePath
            ? `\n\nAuto-save: after every change the diagram is saved to ${savePath}. Never edit that file or load a changed copy of it; change the diagram with edit_diagram. To continue this diagram in a later conversation, call start_session with session_id=${sessionId}. list_saved_diagrams lists older diagrams.`
            : ""
        const rulesNote = `\n\nYour own drawing rules: write them in ${customInstructionsPath()} (Markdown, up to 5000 characters, read on every call).`
        // The bundled draw.io is served from the preview's own origin; an
        // external one (DRAWIO_BASE_URL, or a build without the copy) cannot
        // be reached by the page's scripts
        const originNote = isSameOriginDrawio()
            ? ""
            : `\n\nThe preview loads draw.io from ${DRAWIO_BASE_URL} (another origin): same-origin editor features are off.`

        log.info(`Started session ${sessionId}, browser at ${browserUrl}`)

        // A tab that opens by itself surprises the user unless the agent
        // says what it is; last, after the long guide, so it is not missed
        const tabNote =
            process.env.BROWSER === "none"
                ? "Give the user the Browser URL above: the live preview of the diagram, where they can also edit it by hand; you see their edits."
                : "A browser tab with the live preview just opened. In your reply, tell the user in one sentence that it shows the diagram as you draw and that you see the edits they make there."
        return ok(
            `${intro}\n\nSession ID: ${sessionId}\nBrowser URL: ${browserUrl}${originNote}${saveNote}${rulesNote}\n\n${guideText()}\n\n${tabNote}`,
        )
    },
    { write: true },
)

/** "2026-10-04 09:30" in the server's local time */
function formatLocalTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Tool: list_saved_diagrams
registerTool(
    "list_saved_diagrams",
    {
        title: "List saved diagrams",
        description:
            "List the diagrams saved by earlier sessions (auto-save files), newest first, with their pages. " +
            "Continue one with start_session session_id=<id>; the file path also works with load_diagram.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
        const dir = autosaver.dataDir()
        if (!dir) {
            return ok(
                "Auto-save is off (DRAWIO_DATA_DIR=off), so there are no saved diagrams.",
            )
        }
        const saved = autosaver.list()
        if (saved.length === 0) return ok(`No saved diagrams in ${dir}.`)
        const lines: string[] = []
        for (const { sessionId, path, savedAt } of saved) {
            // A file may hold compressed pages (saved by draw.io itself)
            let pages = "unreadable"
            try {
                const loaded = parseDrawioFileContent(
                    await readFile(path, "utf-8"),
                )
                const doc = loaded.ok ? parseMxfile(loaded.xml) : null
                if (doc) {
                    pages = listPagesFromDoc(doc)
                        .map((p) => `${p.name} (${p.cellCount} cells)`)
                        .join(", ")
                }
            } catch (error) {
                log.warn(`Could not read the saved diagram ${path}: ${error}`)
            }
            const current =
                sessionId === currentSession?.id ? "  (current)" : ""
            lines.push(
                `${sessionId}  saved ${formatLocalTime(savedAt)}  pages: ${pages}  file: ${path}${current}`,
            )
        }
        return ok(lines.join("\n"))
    },
)

// Tool: create_new_diagram
registerTool(
    "create_new_diagram",
    {
        title: "Create new diagram",
        description: `Create a NEW diagram, REPLACING the whole document: every page and any unsaved user changes (the previous state stays in History). To add a tab use add_page; to change cells use edit_diagram.

Before using icon shapes (AWS, Azure, GCP, Kubernetes, Cisco...), call get_shape_library first. Follow the drawing guide returned by start_session (call get_drawing_guide if it is no longer in your context). Pass screenshot: true on the last call of a complex diagram to check the result.

Accepted xml:
1) Only the mxCell elements of one page (recommended). The server adds <mxfile>, <mxGraphModel>, <root> and the root cells "0" and "1":
<mxCell id="2" value="Shape" style="rounded=1;" x="40" y="40" w="120" h="60"/>
2) A bare <mxGraphModel> with <root> (one page).
3) A full <mxfile> with one or more <diagram> pages. Every page's <root> must start with <mxCell id="0"/><mxCell id="1" parent="0"/>.

Rules: cells are siblings (never nested), ids are unique per page and start from "2", parent only for shapes inside a container, no XML comments, and shapes stay within x 0 to 800 and y 0 to 600. A style used by several cells is defined once with <mxStyle name="..." value="..."/> before the cells and used by name (see the drawing guide); html=1 and whiteSpace=wrap are added automatically.

To clear the canvas to one blank page, send only the two root cells <mxCell id="0"/><mxCell id="1" parent="0"/>; the previous diagram stays in History.`,
        inputSchema: {
            xml: z
                .string()
                .describe(
                    "REQUIRED: the mxCell elements of one page, a bare <mxGraphModel>, or a full <mxfile> with one or more <diagram> pages.",
                ),
            screenshot: screenshotSchema,
        },
        annotations: { openWorldHint: false },
    },
    async ({ xml: inputXml, screenshot }) => {
        const session = activeSession()
        // The pictures get_diagram showed as references go back in
        const prepared = prepareNewDiagram(
            restoreImageData(inputXml, session.xml),
        )
        if (!prepared.ok) {
            log.error(prepared.error)
            return fail(prepared.error)
        }
        if (prepared.fixes.length > 0) {
            log.info(`XML auto-fixed: ${prepared.fixes.join(", ")}`)
        }
        // Every later tool can assume session.xml is an mxfile
        const xml = prepared.xml

        log.info(`Setting diagram content, ${xml.length} chars`)

        // The user's state goes to History before the AI overwrites it
        const browserState = syncFromBrowser(session)
        commitDocument(session, xml, true, browserState?.svg)
        // A new document, in no file until it is exported
        setSessionFile(session.id, null)

        // Report page count back to the caller so the LLM learns whether
        // multi-page worked or fell back to single.
        const doc = parseMxfile(xml)
        const pages = doc ? listPagesFromDoc(doc) : []
        const pageSummary =
            pages.length > 1
                ? `${pages.length} pages: ${pages.map((p) => `${p.index}:${p.name}`).join(", ")}`
                : pages.length === 1
                  ? `1 page: ${pages[0].name}`
                  : "no pages parsed"

        log.info(`Diagram content set successfully (${pageSummary})`)

        // Only the root cells: the model asked for an empty canvas
        // (several empty pages get the page summary)
        const cleared = !hasCells(xml) && pages.length <= 1
        const content: CallToolResult["content"] = [
            {
                type: "text",
                text: cleared
                    ? "Canvas cleared: one blank page. The previous diagram is in History."
                    : `Diagram content set successfully!\n\nThe diagram is now visible in your browser.\n\nXML length: ${xml.length} characters\n${pageSummary}\n\n${outlineNote()}`,
            },
        ]
        // The page on screen: the new document's first page after a full
        // load, or the page the user was viewing when the write went on the
        // canvas in place (both are the model's own work)
        if (screenshot ?? config.autoScreenshot) {
            const shot = await captureScreenshot(
                session.id,
                xml,
                {},
                AFTER_WRITE_NEXT,
            )
            content.push(
                ...(shot.ok
                    ? shot.content
                    : [
                          {
                              type: "text" as const,
                              text: `Screenshot skipped: ${shot.note}`,
                          },
                      ]),
            )
        }
        return { content }
    },
    { write: true, needsSession: true },
)

// Tool: load_diagram
registerTool(
    "load_diagram",
    {
        title: "Load diagram file",
        description:
            "Load a .drawio diagram into the current session, REPLACING the entire diagram (all pages). " +
            "To change an existing file, load it here, edit with edit_diagram, then export_diagram to the same path; never rewrite the file by hand. " +
            "Provide ONE of two mutually exclusive sources: 'path' (the server reads the file from disk — you do NOT need to read the file yourself or pass its XML through create_new_diagram) " +
            "or 'xml' (the raw file content you already have — from another tool, a repository read, or an API response — so no temporary file needs to be written first). " +
            "Both accept plain XML and draw.io's compressed save format. " +
            ".drawio.svg (Editable SVG, the format export_diagram writes) is accepted too; .png files (also draw.io's editable PNG) and plain .svg files cannot be loaded.\n\n" +
            "After loading from 'path' (or from compressed 'xml'), call get_diagram before edit_diagram — you haven't seen the file's cell IDs yet. " +
            "Plain-XML 'xml' content you supplied yourself is already known and can be edited immediately.",
        inputSchema: {
            path: z
                .string()
                .optional()
                .describe(
                    "Path to the .drawio or .drawio.svg file to load (e.g. /Users/me/diagram.drawio or ~/diagram.drawio). Relative paths resolve against the MCP server's working directory, which is often not your project. Mutually exclusive with 'xml'.",
                ),
            xml: z
                .string()
                .optional()
                .describe(
                    "Raw .drawio file content: a plain <mxfile>/<mxGraphModel>, or draw.io's compressed save format. Use when the content is already in hand (another tool's output, a repository read, an API response). Mutually exclusive with 'path'.",
                ),
        },
        annotations: { openWorldHint: false },
    },
    async ({ path, xml: inlineXml }) => {
        // Argument validation comes before the session check: a bad
        // argument is a caller error and should be reported as such.
        if (path !== undefined && inlineXml !== undefined) {
            return fail("Provide either 'path' or 'xml', not both.")
        }
        if (path === undefined && inlineXml === undefined) {
            return fail(
                "Provide either 'path' (a .drawio file to read) or 'xml' (the file's content).",
            )
        }
        if (!currentSession) return fail(NO_SESSION)
        const session = currentSession

        // Exactly one of path/xml is present (validated above).
        let content = ""
        let sourceLabel = ""
        if (inlineXml !== undefined) {
            content = inlineXml
            sourceLabel = "inline XML"
        } else if (path !== undefined) {
            const absolutePath = resolve(expandHome(path))
            try {
                // A pipe or device could be read forever, and the other
                // write tools wait for this one
                if (!(await stat(absolutePath)).isFile()) {
                    throw new Error("not a regular file")
                }
                content = await readFile(absolutePath, "utf-8")
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                return fail(`Cannot read file ${absolutePath}: ${msg}`)
            }
            sourceLabel = absolutePath
        }

        const loaded = parseDrawioFileContent(content)
        if (!loaded.ok) return fail(loaded.error)
        const xml = loaded.xml

        log.info(`Loading diagram from ${sourceLabel} (${xml.length} chars)`)

        // The user's state goes to History before the file replaces it.
        // Edit-gate semantics by source:
        // - 'path': the model only supplied a path, so it doesn't know
        //   the file's cell IDs — keep the gate (one get_diagram first).
        // - plain 'xml': the model supplied the exact content, same
        //   rationale as create_new_diagram — record it as seen.
        // - compressed 'xml': the session now holds the decompressed
        //   form, which the model cannot derive from the compressed
        //   input — keep the gate.
        const browserState = syncFromBrowser(session)
        const markSeen = inlineXml !== undefined && !loaded.hadCompressedPages
        commitDocument(session, xml, markSeen, browserState?.svg, "load")
        // The preview names the file (inline XML is in none)
        setSessionFile(session.id, path !== undefined ? sourceLabel : null)

        const pageSummary = describePages(xml)
        log.info(`Diagram loaded (${pageSummary})`)

        const gateHint = markSeen
            ? ""
            : "\n\nCall get_diagram before edit_diagram — you haven't seen this file's cell IDs yet."
        // The preview is a copy: the file changes only when it is exported
        const saveHint =
            path !== undefined
                ? `\n\nEdits change the preview, not the file. When the changes are done, call export_diagram with path ${sourceLabel} to save them back to the file.`
                : ""

        return ok(
            `Diagram loaded from ${sourceLabel}!\n\nThe diagram is now visible in your browser.\n\n${pageSummary}${gateHint}${saveHint}\n\n${outlineNote()}`,
        )
    },
    { write: true },
)
// Tool: edit_diagram
registerTool(
    "edit_diagram",
    {
        title: "Edit diagram",
        description:
            "Edit a specific page in the current diagram by ID-based operations (update/add/delete cells).\n\n" +
            "All-or-nothing: if any operation fails, nothing is applied and every failure is listed.\n\n" +
            "Freshness: the server remembers the last diagram state you have seen, and rejects this call " +
            "only if the user edited the diagram in the browser since then. You do NOT need to call " +
            "get_diagram before every edit: a rejected call changes nothing and includes the current XML " +
            "of the page, so you can rebuild your operations and retry.\n\n" +
            "Call get_diagram first only when you don't know the current diagram content (cell IDs, " +
            "structure) — e.g. the diagram wasn't created in this conversation, or you're unsure your " +
            "memory of it is accurate.\n\n" +
            "Multi-page targeting:\n" +
            "- page_id / page_name / page_index are optional; when all omitted, the FIRST page is targeted\n" +
            "- Use list_pages to discover what pages exist\n\n" +
            "Operations:\n" +
            "- add: Add a new cell. Provide cell_id (new unique id within the page) and new_xml. One cell per operation.\n" +
            "- update: Replace an existing cell by its id. Provide cell_id and complete new_xml.\n" +
            "- delete: Remove a cell by its id. Only cell_id is needed. Its children and connected edges are deleted too, so give only a container's id.\n\n" +
            "For add/update, new_xml is the complete mxCell (inside its <object> wrapper when it has custom data, see the drawing guide) in the compact form (a shape with x, y, w, h; an edge with source and target). No XML comments. " +
            'Every " inside new_xml must be escaped as \\" in the JSON.\n\n' +
            "Example - Add a rectangle on the default (first) page:\n" +
            '{"operations": [{"operation": "add", "cell_id": "rect-1", "new_xml": "<mxCell id=\\"rect-1\\" value=\\"Hello\\" style=\\"rounded=1;\\" x=\\"100\\" y=\\"100\\" w=\\"120\\" h=\\"60\\"/>"}]}\n\n' +
            "Example - Delete a cell on the default page:\n" +
            '{"operations": [{"operation": "delete", "cell_id": "rect-1"}]}',
        inputSchema: {
            ...pageSelectorSchema,
            operations: z
                .array(
                    z.object({
                        operation: z
                            .enum(["update", "add", "delete"])
                            .describe(
                                "Operation to perform: add, update, or delete",
                            ),
                        cell_id: z
                            .string()
                            .describe(
                                "The id of the mxCell. Must match the id attribute in new_xml.",
                            ),
                        new_xml: z
                            .string()
                            .optional()
                            .describe(
                                "Complete mxCell XML element (required for update/add)",
                            ),
                    }),
                )
                .describe("Array of operations to apply"),
            screenshot: screenshotSchema,
        },
        annotations: { openWorldHint: false },
    },
    async ({ operations, page_id, page_name, page_index, screenshot }) => {
        const session = activeSession()

        // Fetch latest state from browser
        const browserState = syncFromBrowser(session)
        if (browserState?.xml) {
            log.info("Fetched latest diagram state from browser")
        }

        if (!session.xml) {
            return fail(
                "No diagram to edit. Please create a diagram first with create_new_diagram.",
            )
        }

        const pageSelector: PageSelector = { page_id, page_name, page_index }

        // Enforce workflow: the model must have seen the current diagram
        // state. Content comparison instead of a wall-clock timeout —
        // slow reasoning between get_diagram and edit_diagram is fine as
        // long as nothing changed in the browser meanwhile (#885).
        const gate = checkEditGate(session.lastSeenXml, browserState?.xml ?? "")
        if (!gate.ok) {
            log.warn(
                gate.reason === "stale"
                    ? "edit_diagram rejected: the browser has changes the model has not seen"
                    : "edit_diagram rejected: the model has not seen the diagram yet",
            )
            // The error carries the current page, so the model has now
            // seen it and can retry without a get_diagram round-trip,
            // unless other pages changed too.
            const liveXml = browserState?.xml || session.xml
            // What the model saw, before markPageSeen records the live state
            const before = session.lastSeenXml
            session.lastSeenXml = markPageSeen(
                session.lastSeenXml,
                liveXml,
                pageSelector,
            )
            const reason =
                gate.reason === "stale"
                    ? "The diagram changed in the browser since you last saw it (e.g. manual user edits). No changes were made."
                    : "You have not seen this diagram yet, so no changes were made."
            // Per-cell summary of the user's changes, when they can be compared
            const summary = describeChanges(before, liveXml)
            const next =
                session.lastSeenXml === liveXml
                    ? "Build your operations on this XML and retry."
                    : `${OTHER_PAGES_UNSEEN} Call get_diagram without a page selector, then retry.`
            return fail(
                `${reason}\n\n${summary ? `${summary}\n\n` : ""}Current XML of ${describeSelector(pageSelector)}:\n\n${foldCells(targetPageXml(session.xml, pageSelector))}\n\n${next}`,
            )
        }

        log.info(
            `Editing diagram with ${operations.length} operation(s) on ${describeSelector(pageSelector)}`,
        )

        const outcome = editDiagram(
            session.xml,
            operations as DiagramOperation[],
            pageSelector,
        )
        if (!outcome.ok) {
            log.warn(`Edit rejected: ${outcome.errors.join("; ")}`)
            return fail(
                outcome.pageError
                    ? outcome.errors[0]
                    : `No changes were made because ${outcome.errors.length} operation(s) failed:\n${outcome.errors.map((e) => `- ${e}`).join("\n")}\n\nCurrent XML of ${describeSelector(pageSelector)}:\n\n${foldCells(targetPageXml(session.xml, pageSelector))}\n\nFix the operations against this XML and retry.`,
            )
        }
        if (outcome.fixes.length > 0) {
            log.info(`new_xml auto-fixed: ${outcome.fixes.join("; ")}`)
        }
        const result = outcome.xml

        // The pre-edit state goes to History for undo, only once the edit
        // applied: a rejected edit returns above without leaving a phantom
        // history entry.
        commitDocument(session, result, true, browserState?.svg)

        log.info(`Diagram edited successfully`)

        // The preview's version card counts only real changes: say which
        // updates changed nothing, so the model can tell the user
        const { unchanged } = outcome
        const unchangedNote =
            unchanged.length > 0
                ? ` ${unchanged.length} of them changed nothing (id ${unchanged.join(", ")} already matched), so ${outcome.applied - unchanged.length} operation(s) changed the diagram.`
                : ""
        const content: CallToolResult["content"] = [
            {
                type: "text",
                text: `Diagram edited successfully!\n\nApplied ${outcome.applied} operation(s) on ${describeSelector(pageSelector)}.${unchangedNote}\n\n${outlineNote()}`,
            },
        ]
        // Without a selector the edit went to the first page, while the
        // page on screen may be another tab: name the page, so the PNG
        // shows the edited one (a pageId export leaves the view alone)
        if (screenshot ?? config.autoScreenshot) {
            const shot = await captureScreenshot(
                session.id,
                result,
                hasPageSelector(pageSelector)
                    ? pageSelector
                    : { page_index: 0 },
                AFTER_WRITE_NEXT,
            )
            content.push(
                ...(shot.ok
                    ? shot.content
                    : [
                          {
                              type: "text" as const,
                              text: `Screenshot skipped: ${shot.note}`,
                          },
                      ]),
            )
        }
        return { content }
    },
    { write: true, needsSession: true },
)

// Tool: get_diagram
registerTool(
    "get_diagram",
    {
        title: "Get diagram",
        description:
            "Get the current diagram XML (fetches latest from browser, including user's manual edits). " +
            "Call this when you don't know the current diagram content (cell IDs, pages, structure) — " +
            "e.g. before editing a diagram you didn't create in this conversation, or after edit_diagram " +
            "was rejected because the user changed the diagram in the browser.\n\n" +
            "Returns the full <mxfile> by default. If a page selector is provided, returns just that page's <mxGraphModel> embedded in a one-page <mxfile> wrapper.",
        inputSchema: {
            ...pageSelectorSchema,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ page_id, page_name, page_index }) => {
        // start_session may replace currentSession while this waits
        const session = activeSession()
        // Request browser to push fresh state and wait for it (an
        // expired session first gets its saved file back to sync)
        let staleNote = ""
        restoreSavedSession(session.id)
        const syncRequested = requestSync(session.id)
        if (syncRequested) {
            const synced = await waitForSync(session.id)
            if (!synced) {
                log.warn("get_diagram: sync timeout - state may be stale")
                staleNote =
                    "\n\nNote: the browser did not respond, so this XML may not include the user's latest manual edits (is the preview tab open?)."
            }
        }

        // Fetch latest state from browser
        const browserState = syncFromBrowser(session)

        if (!session.xml) {
            return ok(
                "No diagram exists yet. Use create_new_diagram to create one.",
            )
        }

        const pageSelector: PageSelector = { page_id, page_name, page_index }

        // The model is now looking at the current state. Record the raw
        // store value — the gate's fast path is plain string equality
        // against the store, with a structural comparison as fallback.
        const liveXml = browserState?.xml || session.xml
        // What the user changed since the model last looked, computed
        // before lastSeenXml is overwritten below
        const changes = describeChanges(session.lastSeenXml, liveXml)
        const changesNote = changes ? `\n\nNote: ${changes}` : ""
        const pageList = describePages(
            session.xml,
            "No <mxfile> wrapper detected (legacy single-page session).",
        )

        // No selector → return full mxfile
        if (!hasPageSelector(pageSelector)) {
            session.lastSeenXml = liveXml
            const shown = foldCells(session.xml)
            const note = imageRefNote(shown)
            return ok(
                `Current diagram XML. ${COMPACT_NOTE}\n\n${shown}\n\n${note ? `${note}\n\n` : ""}${pageList}${staleNote}${changesNote}`,
            )
        }

        // Selector → return a single-page projection
        const projection = projectPage(session.xml, pageSelector)
        if (!projection.ok) {
            return fail(
                projection.reason === "parse"
                    ? `a page selector was given but the current session XML could not be parsed as a multi-page <mxfile> (it may be a legacy single-page document or malformed), so it has no addressable pages.\n\n${pageList}`
                    : `Page ${describeSelector(pageSelector)} not found.\n\n${pageList}`,
            )
        }
        // One page shown counts for all only if the others are as the
        // model saw them last
        session.lastSeenXml = markPageSeen(
            session.lastSeenXml,
            liveXml,
            pageSelector,
        )
        const otherPagesNote =
            session.lastSeenXml === liveXml
                ? ""
                : `\n\nNote: ${OTHER_PAGES_UNSEEN} Call get_diagram without a page selector before editing.`
        const shown = foldCells(projection.xml)
        const note = imageRefNote(shown)
        return ok(
            `Page ${projection.index} ("${projection.name}"). ${COMPACT_NOTE}\n\n${shown}\n\n${note ? `${note}\n\n` : ""}${pageList}${staleNote}${changesNote}${otherPagesNote}`,
        )
    },
    { needsSession: true },
)

// Tool: get_selection
registerTool(
    "get_selection",
    {
        title: "Get selection",
        description:
            "Return the cells the user has selected in the preview: their ids and labels, for edges the source and target ids, for shapes the position and size, and the page they are on. " +
            'Call this when the user refers to what they selected ("this box", "these arrows", "the selected shapes"), then act on the ids with edit_diagram. ' +
            "Says when nothing is selected. Needs the preview tab to be open.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
        const sessionId = activeSession().id
        // The classic preview page never answers: it has no access to the
        // editor (the shell reads it through the same-origin frame). It is
        // also what opens while the shell is not built
        if (activePreviewUi() !== "shell") {
            return ok(
                "The classic preview page cannot read the selection (DRAWIO_PREVIEW_UI=classic, or the canvas shell is not built: run npm run build in packages/mcp-server). Ask the user which shapes they mean, or call get_diagram.",
            )
        }
        if (previewStalled(sessionId))
            return fail(previewStalledNote(sessionId))
        if (sessionState(sessionId)?.lastPolled === undefined) {
            return fail(
                "The preview tab is not open, or has not connected yet.",
            )
        }
        const answer = await readSelection(sessionId)
        if (!answer) {
            return fail(
                "Reading the selection timed out. Make sure the preview tab is open and in front.",
            )
        }
        return ok(
            describeSelection(
                answer,
                isSameOriginDrawio() ? null : DRAWIO_BASE_URL,
            ),
        )
    },
    { needsSession: true },
)

// The browser bridge has one export slot per session, so export requests
// run one at a time: a concurrent call waits for the previous one.
let exportQueue: Promise<unknown> = Promise.resolve()

/**
 * Ask the browser to export (optionally via a page projection) and poll for
 * the resulting image data. Resolves to undefined on timeout.
 */
function exportViaBrowser(
    sessionId: string,
    format: ExportFormat,
    projectionXml?: string,
    options?: ExportOptions,
): Promise<string | undefined> {
    const run = exportQueue.then(async () => {
        requestExport(sessionId, format, projectionXml, options)

        // A projection export does an extra load + render round-trip in the
        // browser, so give it a longer window. Re-read the live store entry
        // each tick: setState() (from a concurrent autosave or tool call)
        // replaces the Map entry with a new object, so a captured reference
        // would go stale and never observe the browser's exportData.
        const timeoutMs = projectionXml ? 15000 : 10000
        const start = Date.now()
        let exportData: string | undefined
        while (Date.now() - start < timeoutMs) {
            exportData = getState(sessionId)?.exportData
            if (exportData) break
            await new Promise((r) => setTimeout(r, 200))
        }
        const live = getState(sessionId)
        if (live) {
            live.exportData = undefined
            live.exportFormat = undefined
            live.exportXml = undefined
            live.exportOptions = undefined
            live.exportId = undefined
        }
        return exportData
    })
    exportQueue = run.catch(() => {})
    return run
}

/**
 * True when the preview tab polled before but has gone quiet. Browsers
 * slow down timers in background tabs (Chrome: about once a minute after
 * 5 minutes hidden), so an export would just time out.
 */
function previewStalled(sessionId: string): boolean {
    const lastPolled = getState(sessionId)?.lastPolled
    return lastPolled !== undefined && Date.now() - lastPolled > 10_000
}

/**
 * `next` is what the model does once the tab is in front. The default
 * suits screenshot_diagram and export_diagram; a write tool whose edit
 * already succeeded must not run again, so it points to screenshot_diagram.
 */
function previewStalledNote(sessionId: string, next = "then retry") {
    return `The preview tab is not responding (browsers pause background tabs). Ask the user to bring the preview tab to the front (${previewUrl(getServerPort(), sessionId)}), ${next}.`
}

// Exported images get a margin, and a PNG a white background unless asked
// otherwise (draw.io keeps a page's own background color over it); the
// preview passes these on to draw.io's export
const IMAGE_MARGIN = 20
function imageOptions(
    format: ExportFormat,
    transparent = false,
): ExportOptions {
    if (format !== "png") return { border: IMAGE_MARGIN }
    return transparent
        ? { border: IMAGE_MARGIN, transparent: true }
        : { border: IMAGE_MARGIN, background: "#ffffff" }
}

/** A PNG's size from its IHDR chunk, which always comes first */
function pngSize(png: Buffer): { width: number; height: number } | null {
    if (png.length < 24 || png.toString("ascii", 12, 16) !== "IHDR") {
        return null
    }
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/** The <diagram id> of the page a selector targets, for draw.io's pageId. */
function pageIdFor(xml: string, selector: PageSelector): string | undefined {
    const doc = parseMxfile(xml)
    return (
        (doc && findPageElement(doc, selector)?.element.getAttribute("id")) ||
        undefined
    )
}

// Stalled-tab advice after a successful create_new_diagram or edit_diagram:
// "then retry" would make the model run the write again
const AFTER_WRITE_NEXT = "then call screenshot_diagram to see the result"

// Screenshot size: Claude Desktop caps a tool result at about 150,000
// characters, so retry smaller above 140,000 base64 characters. (Claude
// Code 2.1 accepted a 240,000 character image in testing.)
const SCREENSHOT_WIDTHS = [1000, 700]
const MAX_SCREENSHOT_CHARS = 140_000

// Adapted from the web app's vision check (lib/validation-prompts.ts)
const SCREENSHOT_CHECKLIST = `Check this rendering of the diagram for:
1. Overlapping shapes that cover each other or their labels (critical)
2. Edges crossing shapes that are not their source or target (critical)
3. Text that is cut off, overlapping or too small to read (warning)
4. Layout problems: cramped shapes, poor spacing or misalignment (warning)
5. Rendering errors: missing, incomplete or broken elements, such as an icon that did not load (critical)
6. Labels on top of lines or shape borders, arrowheads ending on text or icons, edges crossing other edges (warning)
Name the elements that have a problem, for example "the 'Login' box overlaps 'Register'".
Give concrete fixes, for example "move 'Login' 50 px left".
If there are critical issues, fix them with edit_diagram and take one more screenshot; fix the warnings in the same round when you can. Do at most two rounds of fixes. Diagrams with only 1 or 2 shapes pass unless something is clearly broken. Do not tell the user the check passed while problems remain: name the ones you left.`

/**
 * Have the preview tab render a page of xml as a PNG. Returns the image
 * block and the checklist for the model, or the reason there is no image
 * (a sentence without an "Error:" prefix: screenshot_diagram reports it as
 * an error, the write tools as a skipped screenshot).
 */
async function captureScreenshot(
    sessionId: string,
    xml: string,
    selector: PageSelector,
    /** What to do once a stalled tab is in front (see previewStalledNote) */
    next?: string,
): Promise<
    | { ok: true; content: CallToolResult["content"] }
    | { ok: false; note: string }
> {
    if (previewStalled(sessionId)) {
        return { ok: false, note: previewStalledNote(sessionId, next) }
    }
    // The tab never polled (right after start_session, or the state was
    // just restored from disk), so an export would only time out
    if (getState(sessionId)?.lastPolled === undefined) {
        return {
            ok: false,
            note: "The preview tab is not open, or has not connected yet.",
        }
    }
    if (!hasCells(xml)) {
        return { ok: false, note: "The diagram is empty." }
    }

    let pageId: string | undefined
    let projectionXml: string | undefined
    if (hasPageSelector(selector)) {
        const doc = normalizeToMxfile(xml) ?? xml
        pageId = pageIdFor(doc, selector)
        // A page without an id: load just that page and capture it, as
        // export_diagram does
        if (!pageId) {
            const projection = projectPage(doc, selector)
            if (!projection.ok) {
                return {
                    ok: false,
                    note: `Page ${describeSelector(selector)} not found.`,
                }
            }
            projectionXml = projection.xml
        }
    }

    let data: string | undefined
    for (const width of SCREENSHOT_WIDTHS) {
        data = await exportViaBrowser(sessionId, "png", projectionXml, {
            ...imageOptions("png"),
            width,
            pageId,
        })
        if (!data || data.length <= MAX_SCREENSHOT_CHARS) break
    }
    if (!data) {
        return {
            ok: false,
            note: "Screenshot timed out. Make sure the preview tab is open and in front.",
        }
    }
    return {
        ok: true,
        content: [
            {
                type: "image",
                data: data.replace(/^data:image\/png;base64,/, ""),
                mimeType: "image/png",
            },
            {
                type: "text",
                text: `Screenshot of ${hasPageSelector(selector) ? `page ${describeSelector(selector)}` : "the page on screen"}.\n\n${SCREENSHOT_CHECKLIST}`,
            },
        ],
    }
}

// Tool: screenshot_diagram
registerTool(
    "screenshot_diagram",
    {
        title: "Screenshot diagram",
        description:
            "Render the diagram in the preview and return it as a PNG image, so you can see your own result. " +
            "Call this once after drawing or heavily editing a complex diagram, then fix overlaps and edges that cross shapes. " +
            "Without a page selector it shows the page on screen; with one it renders that page without changing what the user sees. Needs the preview tab to be open.",
        inputSchema: { ...pageSelectorSchema },
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ page_id, page_name, page_index }) => {
        const session = activeSession()
        const xml = sessionState(session.id)?.xml || session.xml
        const shot = await captureScreenshot(session.id, xml, {
            page_id,
            page_name,
            page_index,
        })
        if (!shot.ok) return fail(shot.note)
        return { content: shot.content }
    },
    { needsSession: true },
)

// Tool: export_diagram
registerTool(
    "export_diagram",
    {
        title: "Export diagram",
        description:
            "Export the current diagram to a file. Supports .drawio (XML), .png, .svg, and .drawio.svg (an SVG with the diagram embedded, which draw.io and load_diagram can open again). " +
            "The format is auto-detected from the file extension, or can be specified explicitly. " +
            "Images get a 20 px margin; a PNG has a white background (or the page's own background color) unless transparent is true.\n\n" +
            "Multi-page behaviour:\n" +
            "- .drawio with NO page selector: writes the full <mxfile> (all pages).\n" +
            "- .drawio with a page selector: writes a single-page <mxfile> containing only that page.\n" +
            "- .png / .svg with NO page selector: exports the currently active page in the browser.\n" +
            "- .png with a page selector: renders that page without changing what the user sees.\n" +
            "- .svg / .drawio.svg with a page selector: temporarily loads that page into the browser, captures it, then restores the full document (the user sees a brief flicker).",
        inputSchema: {
            ...pageSelectorSchema,
            path: z
                .string()
                .describe(
                    "Absolute file path to save to (e.g. /Users/me/diagram.drawio, ~/diagram.png). Relative paths resolve against the MCP server's working directory, which is often not your project.",
                ),
            format: z
                .enum(["drawio", "png", "svg", "drawio.svg"])
                .optional()
                .describe(
                    "Export format. If omitted, detected from file extension. Defaults to drawio.",
                ),
            transparent: z
                .boolean()
                .optional()
                .describe(
                    "PNG only: a transparent background instead of white. Default false.",
                ),
        },
        annotations: { openWorldHint: false },
    },
    async ({
        path: rawPath,
        format,
        transparent,
        page_id,
        page_name,
        page_index,
    }) => {
        const path = expandHome(rawPath)
        // start_session may replace currentSession while this waits
        const session = activeSession()

        // Detect format from extension if not specified
        const lowerPath = path.toLowerCase()
        const detectedFormat =
            format ||
            (lowerPath.endsWith(".drawio.svg")
                ? "drawio.svg"
                : lowerPath.endsWith(".png")
                  ? "png"
                  : lowerPath.endsWith(".svg")
                    ? "svg"
                    : "drawio")

        // The .drawio file is written from the state, so get the
        // user's latest edits into it first, as get_diagram does (the
        // images are made by the browser from its canvas)
        let syncNote = ""
        if (detectedFormat === "drawio") {
            restoreSavedSession(session.id)
            if (!requestSync(session.id)) {
                syncNote =
                    "\n\nNote: the preview was not reachable, so the file may not include the user's latest manual edits."
            } else if (!(await waitForSync(session.id))) {
                log.warn("export_diagram: sync timeout - state may be stale")
                syncNote =
                    "\n\nNote: the browser did not respond, so the file may not include the user's latest manual edits (is the preview tab open?)."
            }
        }

        // Fetch latest state, so a page selector works on a bare
        // <mxGraphModel> pushed by the browser
        const browserState = syncFromBrowser(session)
        // A change while the file is written leaves it behind the preview
        const changesBefore = changeCount(session.id)

        if (!session.xml) {
            return fail("No diagram to export. Please create a diagram first.")
        }

        const pageSelector: PageSelector = { page_id, page_name, page_index }

        // .drawio path - write XML directly (no browser round-trip).
        if (detectedFormat === "drawio") {
            let filePath = path
            if (!filePath.toLowerCase().endsWith(".drawio")) {
                filePath = `${filePath}.drawio`
            }
            const absolutePath = resolve(filePath)

            let outXml = session.xml
            if (hasPageSelector(pageSelector)) {
                const projection = projectPage(session.xml, pageSelector)
                if (!projection.ok) {
                    return fail(
                        projection.reason === "parse"
                            ? "Cannot parse current session XML as <mxfile>; cannot project a single page."
                            : `Page ${describeSelector(pageSelector)} not found for export.`,
                    )
                }
                outXml = projection.xml
            }

            await mkdir(dirname(absolutePath), { recursive: true })
            await writeFile(absolutePath, outXml, "utf-8")
            log.info(`Diagram exported to ${absolutePath}`)
            // The whole diagram is in this file now: the preview names it
            if (!hasPageSelector(pageSelector)) {
                setSessionFile(
                    session.id,
                    absolutePath,
                    changeCount(session.id) !== changesBefore,
                )
            }
            return ok(
                `Diagram exported successfully!\n\nFile: ${absolutePath}\nSize: ${outXml.length} characters\n${describePages(outXml)}${syncNote}`,
            )
        }

        // PNG or SVG: request browser to export via iframe. Replace a
        // known extension that does not match the format.
        let filePath = path
        const suffix = `.${detectedFormat}`
        if (!lowerPath.endsWith(suffix)) {
            const known = [".drawio.svg", ".drawio", ".png", ".svg"].find((e) =>
                lowerPath.endsWith(e),
            )
            if (known) filePath = filePath.slice(0, -known.length)
            filePath = `${filePath}${suffix}`
        }
        const absolutePath = resolve(filePath)
        // draw.io's name for an SVG with the diagram embedded
        const browserFormat =
            detectedFormat === "drawio.svg" ? "xmlsvg" : detectedFormat

        if (!browserState) {
            return fail("Session state not found. Is the browser open?")
        }
        if (previewStalled(session.id)) {
            return fail(previewStalledNote(session.id))
        }
        // -----------------------------------------------------------------
        // Page-targeted PNG/SVG export.
        //
        // drawio's JSON embed protocol has no working `selectPage` action,
        // so to export a specific page we build a single-page <mxfile>
        // projection and hand it to the browser bridge alongside the export
        // request. The bridge loads the projection, waits for draw.io's own
        // render, exports, then reloads the user's real document — entirely
        // browser-side. The canonical session state is never mutated here,
        // so there is no restore race and no concurrent-edit clobbering.
        // -----------------------------------------------------------------
        // PNG: draw.io renders any page by id, without touching the
        // page on screen. SVG export has no page option, so it still
        // needs the projection below.
        let projectionXml: string | undefined
        let pngPageId: string | undefined
        if (hasPageSelector(pageSelector) && detectedFormat === "png") {
            pngPageId = pageIdFor(session.xml, pageSelector)
        }
        if (hasPageSelector(pageSelector) && !pngPageId) {
            const projection = projectPage(session.xml, pageSelector)
            if (!projection.ok) {
                return fail(
                    projection.reason === "parse"
                        ? "Cannot parse current session XML as <mxfile>; cannot target page for export."
                        : `Page ${describeSelector(pageSelector)} not found for export.`,
                )
            }
            projectionXml = projection.xml
        }

        const pngTransparent = detectedFormat === "png" && transparent === true
        const exportData = await exportViaBrowser(
            session.id,
            browserFormat,
            projectionXml,
            {
                ...imageOptions(browserFormat, pngTransparent),
                ...(pngPageId && { pageId: pngPageId }),
            },
        )

        if (!exportData) {
            return fail(
                projectionXml
                    ? "Export timed out after loading the single-page projection. The browser may be closed or unresponsive."
                    : "Export timed out. Make sure the browser tab is open and the diagram is loaded.",
            )
        }

        // Decode and write; what the file holds goes in the result, so the
        // model need not open it to check
        const shows = hasPageSelector(pageSelector)
            ? `page ${describeSelector(pageSelector)}`
            : "the page on screen"
        let details = ""
        if (detectedFormat === "png") {
            const base64 = exportData.replace(/^data:image\/png;base64,/, "")
            const png = Buffer.from(base64, "base64")
            await mkdir(dirname(absolutePath), { recursive: true })
            await writeFile(absolutePath, png)
            const size = pngSize(png)
            details = `Image: ${size ? `${size.width} x ${size.height} px, ` : ""}${pngTransparent ? "transparent" : "white"} background, ${IMAGE_MARGIN} px margin, showing ${shows}`
        } else {
            let svgContent = exportData
            if (svgContent.startsWith("data:image/svg+xml;base64,")) {
                const base64 = svgContent.replace(
                    /^data:image\/svg\+xml;base64,/,
                    "",
                )
                svgContent = Buffer.from(base64, "base64").toString("utf-8")
            }
            await mkdir(dirname(absolutePath), { recursive: true })
            await writeFile(absolutePath, svgContent, "utf-8")
            details = `Image: ${IMAGE_MARGIN} px margin, showing ${shows}`
            if (detectedFormat === "drawio.svg") {
                // The file holds the diagram too (one page with a selector)
                details += `\nEmbedded diagram: ${describePages(projectionXml ?? session.xml)}`
                if (!projectionXml) {
                    setSessionFile(
                        session.id,
                        absolutePath,
                        changeCount(session.id) !== changesBefore,
                    )
                }
            }
        }

        const written = await stat(absolutePath)
        log.info(
            `Diagram exported to ${absolutePath} (${detectedFormat}, ${written.size} bytes)`,
        )
        return ok(
            `Diagram exported successfully!\n\nFile: ${absolutePath}\nFormat: ${detectedFormat}\nSize: ${written.size} bytes\n${details}`,
        )
    },
    { needsSession: true },
)

/**
 * Shared helper for page-CRUD tools.
 * Loads the latest session XML, normalises to mxfile if needed, returns a
 * parsed Document the caller can mutate, plus a writer that persists.
 */
async function loadMxfileForMutation(): Promise<
    | {
          ok: true
          doc: Document
          writeBack: (source?: HistorySource) => void
      }
    | { ok: false; message: string }
> {
    if (!currentSession) return { ok: false, message: NO_SESSION }
    const session = currentSession
    // Pull latest from browser so we don't clobber autosaved changes.
    const browserState = syncFromBrowser(session)
    if (!session.xml) {
        return {
            ok: false,
            message:
                "No diagram exists yet. Use create_new_diagram first, then page tools.",
        }
    }
    // Make sure the in-memory shape is canonical mxfile before any CRUD
    // (syncFromBrowser keeps XML it cannot normalise as it is).
    const normalized = normalizeToMxfile(session.xml)
    if (!normalized) {
        return {
            ok: false,
            message:
                "Current session XML is neither <mxGraphModel> nor <mxfile>; cannot perform page operations.",
        }
    }
    session.xml = normalized

    const doc = parseMxfile(session.xml)
    if (!doc) {
        return {
            ok: false,
            message: "Failed to parse current session XML as <mxfile>.",
        }
    }
    return {
        ok: true,
        doc,
        writeBack: (source?: HistorySource) => {
            // The store may hold user edits the model has not seen yet; the
            // result counts as seen only when the model built on the latest
            const sawLatest = checkEditGate(
                session.lastSeenXml,
                browserState?.xml ?? "",
            ).ok
            commitDocument(
                session,
                serializeMxfile(doc),
                sawLatest,
                browserState?.svg,
                source,
            )
        },
    }
}

// Tool: list_pages
registerTool(
    "list_pages",
    {
        title: "List pages",
        description:
            "List every page (tab) in the current diagram. Returns each page's id, name, 0-based index, and cell count. Use this to discover what pages exist before targeting one with edit_diagram, get_diagram, export_diagram, rename_page, or delete_page.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
        const loaded = await loadMxfileForMutation()
        if (!loaded.ok) return fail(loaded.message)
        const pages = listPagesFromDoc(loaded.doc)
        if (pages.length === 0) return ok("No pages in document.")
        const lines = pages.map(
            (p) =>
                `  [${p.index}] id="${p.id}" name="${p.name}" cells=${p.cellCount}`,
        )
        return ok(`Pages (${pages.length}):\n${lines.join("\n")}`)
    },
)

// Tool: add_page
registerTool(
    "add_page",
    {
        title: "Add page",
        description:
            'Append a new page (tab) to the current diagram WITHOUT touching existing pages or unsaved user changes. Use this when the user wants "another diagram alongside" — e.g. "add a CNN page" — instead of create_new_diagram which wipes everything.\n\n' +
            "Inputs:\n" +
            "- name: optional display name for the tab (defaults to Page-N where N = existing-page-count + 1)\n" +
            "- id: optional explicit page id; if omitted the server generates a short alphanumeric id\n" +
            '- xml: optional starting content: the mxCell elements of the page (root cells "0" and "1" are added), or a bare <mxGraphModel>. If omitted, the page starts blank.\n\n' +
            "Returns the new page's id, name, and index so the caller can immediately target it with edit_diagram.",
        inputSchema: {
            name: z
                .string()
                .optional()
                .describe(
                    'Optional display name for the new tab (e.g. "CNN"). Defaults to "Page-N".',
                ),
            id: z
                .string()
                .min(1)
                .optional()
                .describe(
                    "Optional explicit page id. If omitted the server generates one. Must be unique across pages.",
                ),
            xml: z
                .string()
                .optional()
                .describe(
                    "Optional starting content: the mxCell elements of the page, or a bare <mxGraphModel>. If omitted the page starts blank.",
                ),
        },
        annotations: { destructiveHint: false, openWorldHint: false },
    },
    async ({ name, id, xml }) => {
        const loaded = await loadMxfileForMutation()
        if (!loaded.ok) return fail(loaded.message)

        // The starting content is prepared like a new diagram's page, so a
        // half-broken model never gets into the session
        let cleanXml: string | undefined
        if (xml?.trim()) {
            // The pictures get_diagram showed as references go back in
            const prepared = prepareNewModel(
                restoreImageData(xml, currentSession?.xml),
            )
            if (!prepared.ok) return fail(prepared.error)
            if (prepared.fixes.length > 0) {
                log.info(
                    `add_page: starting XML auto-fixed: ${prepared.fixes.join(", ")}`,
                )
            }
            cleanXml = prepared.xml
        }

        // (throws on a page id in use or a whole <mxfile> as content)
        const info = addPageToDoc(loaded.doc, { id, name, xml: cleanXml })

        loaded.writeBack("add_page")
        log.info(
            `Added page id=${info.id} name="${info.name}" index=${info.index}`,
        )
        // With two tabs the default name of the first one says nothing
        const first = listPagesFromDoc(loaded.doc)[0]
        const renameHint =
            info.index === 1 && /^Page-\d+$/.test(first.name)
                ? `\n\nThe first page is still called "${first.name}": give it a name that says what it shows with rename_page.`
                : ""
        return ok(
            `Page added.\n\nid=${info.id}\nname=${info.name}\nindex=${info.index}\ncells=${info.cellCount}${renameHint}`,
        )
    },
    { write: true },
)

// Tool: rename_page
registerTool(
    "rename_page",
    {
        title: "Rename page",
        description:
            "Rename an existing page (tab). At least one of page_id / page_name / page_index is required to identify which page to rename. The new_name becomes the visible tab label in the editor.",
        inputSchema: {
            ...pageSelectorSchema,
            new_name: z
                .string()
                .min(1)
                .describe("The new display name for the page tab."),
        },
        annotations: { destructiveHint: false, openWorldHint: false },
    },
    async ({ new_name, page_id, page_name, page_index }) => {
        const loaded = await loadMxfileForMutation()
        if (!loaded.ok) return fail(loaded.message)

        const pageSelector: PageSelector = { page_id, page_name, page_index }
        if (!hasPageSelector(pageSelector)) {
            return fail(
                "rename_page requires one of page_id, page_name, or page_index to identify the page.",
            )
        }

        if (!renamePageInDoc(loaded.doc, pageSelector, new_name)) {
            return fail(`Page ${describeSelector(pageSelector)} not found.`)
        }

        loaded.writeBack()
        log.info(
            `Renamed page ${describeSelector(pageSelector)} → "${new_name}"`,
        )
        return ok(
            `Page ${describeSelector(pageSelector)} renamed to "${new_name}".`,
        )
    },
    { write: true },
)

// Tool: delete_page
registerTool(
    "delete_page",
    {
        title: "Delete page",
        description:
            "Delete a page (tab) from the current diagram. At least one of page_id / page_name / page_index is required. Refuses to delete the last remaining page — the editor needs at least one tab.",
        inputSchema: {
            ...pageSelectorSchema,
        },
        annotations: { openWorldHint: false },
    },
    async ({ page_id, page_name, page_index }) => {
        const loaded = await loadMxfileForMutation()
        if (!loaded.ok) return fail(loaded.message)

        const pageSelector: PageSelector = { page_id, page_name, page_index }
        if (!hasPageSelector(pageSelector)) {
            return fail(
                "delete_page requires one of page_id, page_name, or page_index to identify the page.",
            )
        }

        const outcome = deletePageFromDoc(loaded.doc, pageSelector)
        if (!outcome.ok) return fail(`${outcome.reason}.`)

        loaded.writeBack()
        log.info(
            `Deleted page id=${outcome.deletedId} index=${outcome.deletedIndex}`,
        )
        return ok(
            `Page deleted (id=${outcome.deletedId}, was at index ${outcome.deletedIndex}).`,
        )
    },
    { write: true },
)

// Who made a History entry, as restore_version names it; the AI's writes
// carry no source
const SOURCE_LABELS: Record<HistorySource, string> = {
    user: "edit by hand",
    recover: "edit by hand",
    restore: "restored copy",
    load: "opened file",
    add_page: "added a page",
}

/**
 * The versions restore_version can go to, numbered by steps_back, each
 * with who made it and what it changed from the entry before it, so the
 * model can match them with the preview's version cards. justLeft: right
 * after a restore, steps_back=1 is the version the canvas just left.
 */
function describeVersions(
    sessionId: string,
    entries: HistoryEntry[],
    justLeft = false,
): string {
    const history = getHistory(sessionId)
    return entries
        .slice(0, 20)
        .map((entry, i) => {
            const doc = parseMxfile(entry.xml)
            const pages = doc ? listPagesFromDoc(doc) : []
            const names =
                pages.length > 0
                    ? pages
                          .map((p) => `"${p.name}" (${p.cellCount} cells)`)
                          .join(", ")
                    : "no pages parsed"
            const at = history.findIndex((e) => e.id === entry.id)
            const previous = at > 0 ? history[at - 1] : undefined
            // An edit's own change; an opened file, a page or a restored
            // copy is told by what it is
            const counted =
                !entry.source ||
                entry.source === "user" ||
                entry.source === "recover"
            const by = entry.source ? SOURCE_LABELS[entry.source] : "AI change"
            const what = !hasCells(entry.xml)
                ? "blank page"
                : previous && counted
                  ? `${by}, ${countChanges(previous.xml, entry.xml) || "no shape changed"}`
                  : by
            const mark =
                justLeft && i === 0 ? " (the version you just left)" : ""
            return `steps_back=${i + 1}${mark}: ${what}; ${names}`
        })
        .join(" | ")
}

// Tool: restore_version
registerTool(
    "restore_version",
    {
        title: "Restore version",
        description:
            "Undo: put an earlier version of the diagram from History back on the canvas (the current canvas is kept in History, so this can be undone too). Use it when the user asks to undo, revert or go back.",
        inputSchema: {
            steps_back: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe(
                    "1 = the newest version that differs from the canvas (default), 2 = the one before it, and so on. After an undo, steps_back=1 returns to the version you just left (redo) and steps_back=2 goes further back.",
                ),
        },
        annotations: { destructiveHint: false, openWorldHint: false },
    },
    async ({ steps_back: stepsBack = 1 }) => {
        const session = activeSession()

        // The canvas, with the user's manual edits, is the state store
        const current = sessionState(session.id)?.xml || session.xml
        const candidates = otherVersions(session.id, current)
        if (candidates.length === 0) {
            return fail("No other version in History.")
        }
        if (candidates.length < stepsBack) {
            return fail(
                `Only ${candidates.length} other version(s) in History: ${describeVersions(session.id, candidates)}`,
            )
        }
        const entry = candidates[stepsBack - 1]

        // Manual edits since the last entry are not in History yet;
        // restoreHistoryEntry keeps them (a blank page excepted)
        const hadManual =
            contentFingerprint(current) !== contentFingerprint(BLANK_MXFILE) &&
            !isInHistory(session.id, current)

        restoreHistoryEntry(session.id, entry.id)
        session.xml = entry.xml
        // As load_diagram: the model may never have seen this XML, so
        // the edit gate requires one get_diagram before edits
        session.lastSeenXml = ""

        log.info(
            `Restored the version ${stepsBack} step(s) back (entry ${entry.id})`,
        )

        const manualNote = hadManual
            ? " Your manual changes were kept in History (steps_back=1 brings them back)."
            : ""
        const next =
            describeVersions(
                session.id,
                otherVersions(session.id, entry.xml),
                true,
            ) || "none"
        return ok(
            `Restored the version ${stepsBack} step(s) back.${manualNote}\n\n${describePages(entry.xml)}\n\nVersions you can go to now: ${next}\n\nCall get_diagram before edit_diagram.\n\n${outlineNote()}`,
        )
    },
    { write: true, needsSession: true },
)

// Graceful shutdown handler
let isShuttingDown = false
function gracefulShutdown(reason: string) {
    if (isShuttingDown) return
    isShuttingDown = true
    log.info(`Shutting down: ${reason}`)
    autosaver.flush()
    shutdown()
    process.exit(0)
}

// Handle stdin close (primary method - works on all platforms including Windows)
process.stdin.on("close", () => gracefulShutdown("stdin closed"))
process.stdin.on("end", () => gracefulShutdown("stdin ended"))

// Handle signals (may not work reliably on Windows)
process.on("SIGINT", () => gracefulShutdown("SIGINT"))
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))

// Handle broken pipe (writing to closed stdout)
process.stdout.on("error", (err) => {
    if (err.code === "EPIPE" || err.code === "ERR_STREAM_DESTROYED") {
        gracefulShutdown("stdout error")
    }
})

// Start the MCP server
async function main() {
    log.info("Starting MCP server for Next AI Draw.io (embedded mode)...")

    const transport = new StdioServerTransport()
    await server.connect(transport)

    log.info("MCP server running on stdio")
}

main().catch((error) => {
    log.error("Fatal error:", error)
    process.exit(1)
})
