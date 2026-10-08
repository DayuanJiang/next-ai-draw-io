import { getAssetUrl } from "@/lib/base-path"
import type { Locale } from "@/lib/i18n/config"
import { BLANK_MXFILE } from "@/packages/mcp-server/src/pages.ts"

/** External draw.io configured at build time (cross-origin, limited features) */
const EXTERNAL_DRAWIO_URL = process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || ""

/**
 * URL of the draw.io editor iframe. By default this is the copy bundled in
 * public/drawio, served from our own origin.
 */
export function getDrawioSrc({
    lang,
    isElectron,
    dark,
}: {
    lang: Locale
    isElectron: boolean
    dark: boolean
}): string {
    // index.html: Next.js does not serve directory indexes
    const base =
        EXTERNAL_DRAWIO_URL ||
        `${window.location.origin}${getAssetUrl("/drawio/index.html")}`
    const url = new URL(base)
    const params: Record<string, string> = {
        embed: "1",
        proto: "json",
        configure: "1",
        ui: "simple",
        spin: "0",
        libraries: "0",
        noSaveBtn: "1",
        noExitBtn: "1",
        saveAndExit: "0",
        // draw.io's own dark mode (switched in place later when the editor
        // can be driven directly)
        dark: dark ? "1" : "0",
        // draw.io names Traditional Chinese "zh-tw"
        lang: lang === "zh-Hant" ? "zh-tw" : lang,
    }
    // No calls to external services from the desktop app
    if (isElectron && !EXTERNAL_DRAWIO_URL) params.offline = "1"
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
 * change when the theme switches.
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
`
