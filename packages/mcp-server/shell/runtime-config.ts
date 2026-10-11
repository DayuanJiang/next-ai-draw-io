/**
 * What the MCP server writes into the shell page as window.__MCP_CONFIG__
 * (http-server.ts fills the {{CONFIG_JSON}} placeholder of index.html).
 */
export interface ShellConfig {
    sessionId: string
    /** Every /api request carries it in the X-Drawio-Token header */
    token: string
    /** Prefix of the server's API paths */
    apiBase: string
    /** The editor page: the bundled copy's index.html on this origin, or an
     * external draw.io */
    drawioBaseUrl: string
    /** draw.io theme fixed by DRAWIO_UI; "" leaves the pick to draw.io */
    drawioUi: string
    /** Editor language fixed by DRAWIO_LANG, in draw.io's naming; "" leaves
     * the pick to draw.io */
    drawioLang: string
    /** DRAWIO_DARK: the theme when the user has not chosen one here */
    drawioDark: "dark" | "light" | "auto"
    /** DRAWIO_LANG as given, for the shell's own texts */
    lang: string
}

const DEFAULTS: ShellConfig = {
    sessionId: "",
    token: "",
    apiBase: "/api",
    drawioBaseUrl: "/drawio/index.html",
    drawioUi: "",
    drawioLang: "",
    drawioDark: "auto",
    lang: "",
}

/**
 * The page's config with every field present: a missing or malformed one
 * (another server version) takes its default.
 */
export function readShellConfig(source: unknown): ShellConfig {
    const given =
        source && typeof source === "object"
            ? (source as Record<string, unknown>)
            : {}
    const config = { ...DEFAULTS }
    for (const key of Object.keys(DEFAULTS) as (keyof ShellConfig)[]) {
        const value = given[key]
        if (key === "drawioDark") {
            if (value === "dark" || value === "light" || value === "auto") {
                config.drawioDark = value
            }
        } else if (typeof value === "string") {
            config[key] = value
        }
    }
    return config
}

/** The config the server wrote into this page */
export function pageShellConfig(): ShellConfig {
    return readShellConfig(
        (window as { __MCP_CONFIG__?: unknown }).__MCP_CONFIG__,
    )
}
