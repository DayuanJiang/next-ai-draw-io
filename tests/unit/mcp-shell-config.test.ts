/**
 * The MCP's canvas shell takes its settings from the config the server
 * writes into the page, and picks its language and theme in the browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { getDrawioSrc } from "@/lib/drawio/drawio-config"
import { i18n } from "@/lib/i18n/config"
import {
    getShellDictionary,
    matchLocale,
    pickLocale,
} from "@/packages/mcp-server/shell/dictionary"
import { readShellConfig } from "@/packages/mcp-server/shell/runtime-config"
import {
    isDarkPreferred,
    THEME_STORAGE_KEY,
} from "@/packages/mcp-server/shell/theme"

const shellDir = join(process.cwd(), "packages/mcp-server/shell")

describe("shell runtime config", () => {
    it("takes the server's values", () => {
        const config = readShellConfig({
            sessionId: "mcp-abc",
            token: "0123",
            apiBase: "/api",
            drawioBaseUrl: "https://embed.diagrams.net/",
            drawioUi: "sketch",
            drawioLang: "ja",
            drawioDark: "dark",
            lang: "ja",
        })
        expect(config.sessionId).toBe("mcp-abc")
        expect(config.drawioBaseUrl).toBe("https://embed.diagrams.net/")
        expect(config.drawioUi).toBe("sketch")
        expect(config.drawioDark).toBe("dark")
    })

    it("fills in defaults for what is missing or malformed", () => {
        expect(readShellConfig(undefined)).toEqual({
            sessionId: "",
            token: "",
            apiBase: "/api",
            drawioBaseUrl: "/drawio/index.html",
            drawioUi: "",
            drawioLang: "",
            drawioDark: "auto",
            lang: "",
        })
        const odd = readShellConfig({
            sessionId: 42,
            drawioDark: "sometimes",
            token: "t",
        })
        expect(odd.sessionId).toBe("")
        expect(odd.drawioDark).toBe("auto")
        expect(odd.token).toBe("t")
    })
})

describe("shell draw.io URL", () => {
    it("offers draw.io's theme menu unless a theme is fixed", () => {
        // Embedded draw.io shows Extras > Theme only with themes=1 and no ui
        const free = new URL(
            getDrawioSrc({ editorUrl: "/drawio/index.html" }, false),
        )
        expect(free.searchParams.get("themes")).toBe("1")
        expect(free.searchParams.get("ui")).toBeNull()
        const fixed = new URL(
            getDrawioSrc(
                { editorUrl: "/drawio/index.html", ui: "kennedy" },
                false,
            ),
        )
        expect(fixed.searchParams.get("ui")).toBe("kennedy")
        expect(fixed.searchParams.get("themes")).toBeNull()
    })

    it("offers draw.io's custom libraries when asked, as the classic page did", () => {
        const withLibraries = new URL(
            getDrawioSrc(
                { editorUrl: "/drawio/index.html", libraries: true },
                false,
            ),
        )
        expect(withLibraries.searchParams.get("libraries")).toBe("1")
        const without = new URL(
            getDrawioSrc({ editorUrl: "/drawio/index.html" }, false),
        )
        expect(without.searchParams.get("libraries")).toBe("0")
    })
})

describe("shell language", () => {
    it("maps language tags to the dictionaries we have", () => {
        expect(matchLocale("en-US")).toBe("en")
        expect(matchLocale("zh")).toBe("zh")
        expect(matchLocale("zh-CN")).toBe("zh")
        expect(matchLocale("zh-Hans-CN")).toBe("zh")
        expect(matchLocale("zh-TW")).toBe("zh-Hant")
        expect(matchLocale("zh-Hant")).toBe("zh-Hant")
        expect(matchLocale("ZH-HK")).toBe("zh-Hant")
        expect(matchLocale("ja-JP")).toBe("ja")
        expect(matchLocale("de")).toBeNull()
        expect(matchLocale("")).toBeNull()
    })

    it("prefers the server's language, then the browser's, then English", () => {
        expect(pickLocale("zh-tw", ["en-US"])).toBe("zh-Hant")
        expect(pickLocale("", ["de-DE", "ja-JP", "en"])).toBe("ja")
        expect(pickLocale("de", ["fr"])).toBe("en")
        expect(pickLocale("", [])).toBe("en")
    })

    it("has every dictionary, with the shell's own texts", () => {
        for (const locale of i18n.locales) {
            const dict = getShellDictionary(locale)
            expect(Object.keys(dict.shell).sort(), locale).toEqual([
                "addedPage",
                "aiChanged",
                "connected",
                "fileChanged",
                "fileChangedHint",
                "hideVersions",
                "historyChanged",
                "offline",
                "openedFile",
                "restoreFailed",
                "restoredFromFile",
                "showVersions",
                "toggleTheme",
                "tooLarge",
                "unreachable",
                "userEdit",
                "waiting",
            ])
            expect(dict.shell.waiting, locale).toBeTruthy()
            expect(dict.workspace.canvasLoading, locale).toBeTruthy()
        }
    })
})

describe("shell theme", () => {
    it("follows the stored choice, then the server, then the system", () => {
        expect(isDarkPreferred("true", "light", false)).toBe(true)
        expect(isDarkPreferred("false", "dark", true)).toBe(false)
        expect(isDarkPreferred(null, "dark", false)).toBe(true)
        expect(isDarkPreferred(null, "light", true)).toBe(false)
        expect(isDarkPreferred(null, "auto", true)).toBe(true)
        expect(isDarkPreferred(null, "auto", false)).toBe(false)
        expect(isDarkPreferred("maybe", "auto", true)).toBe(true)
    })

    it("is applied before the first paint by the page's own script", () => {
        const html = readFileSync(join(shellDir, "index.html"), "utf8")
        expect(THEME_STORAGE_KEY.startsWith("mcp:")).toBe(true)
        expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`)
        expect(html).toContain("window.__MCP_CONFIG__ = {{CONFIG_JSON}};")
        expect(html).toContain('src="/shell/shell.js"')
        expect(html).toContain('href="/shell/shell.css"')
    })
})
