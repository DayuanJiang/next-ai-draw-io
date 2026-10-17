import { getAssetUrl } from "@/lib/base-path"
import type { Locale } from "@/lib/i18n/config"
import { BLANK_MXFILE } from "@/packages/mcp-server/src/pages.ts"

/** External draw.io configured at build time (cross-origin, limited features) */
const EXTERNAL_DRAWIO_URL = process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || ""

/**
 * Where the editor comes from and how it starts. The web app fills it from
 * its build settings (webDrawioSource); the MCP's canvas shell from the
 * config its server writes into the page.
 */
export interface DrawioSource {
    /** The editor page: the bundled copy's index.html on this origin, or an
     * external draw.io (cross-origin, limited features) */
    editorUrl: string
    /** draw.io theme (its ui parameter); none: draw.io's default and the
     * user's own pick */
    ui?: string
    /** Language in draw.io's naming ("zh-tw"); none: draw.io's own pick */
    lang?: string
    /** No calls to external services (the desktop app) */
    offline?: boolean
    /** draw.io's custom libraries (File > New Library, Open Library from,
     * and the buttons under the shapes); the web app leaves them out */
    libraries?: boolean
}

/**
 * The web app's editor: the copy in public/drawio, served from our own
 * origin (index.html, as Next.js serves no directory indexes), or
 * NEXT_PUBLIC_DRAWIO_BASE_URL; the simple theme in the page's language.
 */
export function webDrawioSource(lang: Locale): DrawioSource {
    const isElectron = !!(window as { electronAPI?: unknown }).electronAPI
    return {
        editorUrl: EXTERNAL_DRAWIO_URL || getAssetUrl("/drawio/index.html"),
        ui: "simple",
        // draw.io names Traditional Chinese "zh-tw"
        lang: lang === "zh-Hant" ? "zh-tw" : lang,
        offline: isElectron && !EXTERNAL_DRAWIO_URL,
    }
}

/** URL of the draw.io editor iframe */
export function getDrawioSrc(source: DrawioSource, dark: boolean): string {
    const url = new URL(source.editorUrl, window.location.href)
    const params: Record<string, string> = {
        embed: "1",
        proto: "json",
        configure: "1",
    }
    // Without a fixed theme, embedded draw.io shows Extras > Theme only
    // with themes=1 (its isThemeMenuVisible)
    if (source.ui) params.ui = source.ui
    else params.themes = "1"
    Object.assign(params, {
        spin: "0",
        libraries: source.libraries ? "1" : "0",
        noSaveBtn: "1",
        noExitBtn: "1",
        saveAndExit: "0",
        // draw.io's own dark mode (switched in place later when the editor
        // can be driven directly)
        dark: dark ? "1" : "0",
    })
    if (source.lang) params.lang = source.lang
    if (source.offline) params.offline = "1"
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
    }
    return url.toString()
}

/**
 * Show the page (a white sheet with a grid) unless the diagram says
 * otherwise. AI output usually has a bare <mxGraphModel>, and draw.io's
 * simple UI would then show neither page nor grid.
 */
export function withPageDefaults(xml: string): string {
    return xml.replace(
        /<mxGraphModel\b([^>]*?)(\/?)>/g,
        (_match, attrs, slash) => {
            let next = attrs as string
            if (!/\spage\s*=/.test(next)) next += ' page="1"'
            if (!/\sgrid\s*=/.test(next)) next += ' grid="1"'
            if (!/\sgridSize\s*=/.test(next)) next += ' gridSize="10"'
            return `<mxGraphModel${next}${slash}>`
        },
    )
}

/** Empty document loaded when draw.io starts */
export const EMPTY_DRAWIO_DOCUMENT = withPageDefaults(BLANK_MXFILE)

/**
 * Editor defaults sent with draw.io's configure message. The simple UI turns
 * page view off for new diagrams; keep the white page on the canvas, as in
 * the classic UI.
 */
export const DRAWIO_CONFIG = {
    defaultPageVisible: true,
    defaultGridEnabled: true,
    // A loaded diagram leaves the focus where it is (draw.io focuses its
    // window otherwise, and keys typed for the chat would go to the canvas)
    noAutoFocus: true,
}

/**
 * CSS injected into draw.io: the table around the sheet and its toolbar in
 * light mode. Dark mode keeps draw.io's own colors: the rules only match
 * while draw.io is light (it puts geDarkMode on the body), so they need no
 * change when the theme switches. draw.io's link to its GitHub page (by
 * the page tabs) is hidden: on a phone it sits right above the tab bar.
 */
export const DRAWIO_CSS = `
body:not(.geDarkMode) {
    --workspace-color: #f4f5f7;
    --focus-color: #14181d;
}
body:not(.geDarkMode) .geDiagramContainer { background-color: #f4f5f7; }
body:not(.geDarkMode) .geBackgroundPage { box-shadow: 0 1px 2px rgba(20,24,29,.08), 0 12px 32px -12px rgba(20,24,29,.18) !important; }
body:not(.geDarkMode) .geSimpleMainMenu { border-bottom: 1px solid #e4e7eb !important; box-shadow: none !important; }
.geSidebarContainer[style*="width: 0px"] { border: none !important; }
a[href*="github.com/jgraph/drawio"] { display: none !important; }
`
