import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { proxy } from "@/proxy"

// The locale that a page without one redirects to
const redirectFor = (acceptLanguage?: string, path = "/") => {
    const response = proxy(
        new NextRequest(`http://localhost${path}`, {
            headers: acceptLanguage
                ? { "accept-language": acceptLanguage }
                : {},
        }),
    )
    return response?.headers.get("location")
}

describe("locale redirect", () => {
    it("sends Taiwan, Hong Kong and Macau to Traditional Chinese", () => {
        expect(redirectFor("zh-TW,zh;q=0.9")).toBe("http://localhost/zh-Hant")
        expect(redirectFor("zh-HK")).toBe("http://localhost/zh-Hant")
        expect(redirectFor("zh-MO")).toBe("http://localhost/zh-Hant")
        expect(redirectFor("zh-Hant-TW")).toBe("http://localhost/zh-Hant")
    })

    it("sends other Chinese, Japanese and English to their locale", () => {
        expect(redirectFor("zh-CN,zh;q=0.9")).toBe("http://localhost/zh")
        expect(redirectFor("ja-JP,ja;q=0.9")).toBe("http://localhost/ja")
        expect(redirectFor("en-US,en;q=0.9")).toBe("http://localhost/en")
    })

    it("follows the order of preference", () => {
        expect(redirectFor("fr-FR,ja;q=0.8,en;q=0.5")).toBe(
            "http://localhost/ja",
        )
    })

    it("falls back to English", () => {
        expect(redirectFor()).toBe("http://localhost/en")
        expect(redirectFor("*")).toBe("http://localhost/en")
        expect(redirectFor("de-DE")).toBe("http://localhost/en")
    })

    it("skips a malformed tag and uses the next one", () => {
        expect(redirectFor("en_US,ja;q=0.8")).toBe("http://localhost/ja")
    })

    it("keeps the rest of the path", () => {
        expect(redirectFor("zh-TW", "/about")).toBe(
            "http://localhost/zh-Hant/about",
        )
    })

    it("sends a locale written another way to the page's own address", () => {
        // Whatever the browser's language: the address names the locale
        expect(redirectFor("en-US", "/zh-hant/about")).toBe(
            "http://localhost/zh-Hant/about",
        )
        expect(redirectFor("zh-TW", "/EN")).toBe("http://localhost/en")
        expect(redirectFor("en-US", "/JA/docs/faq?x=1")).toBe(
            "http://localhost/ja/docs/faq?x=1",
        )
        expect(redirectFor("en-US", "/zh-TW/docs")).toBe(
            "http://localhost/zh-Hant/docs",
        )
        expect(redirectFor("en-US", "/zh-hk")).toBe("http://localhost/zh-Hant")
        expect(redirectFor("ja", "/zh-CN/mcp")).toBe("http://localhost/zh/mcp")
        expect(redirectFor("ja", "/zh-Hans/mcp")).toBe(
            "http://localhost/zh/mcp",
        )
    })

    it("sends a locale with a region after it to the locale's page", () => {
        expect(redirectFor("zh-TW", "/en-US/about")).toBe(
            "http://localhost/en/about",
        )
        expect(redirectFor("en-US", "/ja-JP/docs")).toBe(
            "http://localhost/ja/docs",
        )
        expect(redirectFor("ja", "/en-gb")).toBe("http://localhost/en")
        // Not a locale: a page's name, which gets the browser's locale
        expect(redirectFor("ja", "/enx/about")).toBe(
            "http://localhost/ja/enx/about",
        )
        expect(redirectFor("ja", "/en-USA")).toBe("http://localhost/ja/en-USA")
    })

    it("leaves a page at its locale alone", () => {
        for (const path of ["/en", "/zh/about", "/ja/docs", "/zh-Hant/mcp"]) {
            expect(redirectFor("zh-TW", path)).toBeUndefined()
        }
    })

    it("redirects the home page temporarily and other pages permanently", () => {
        const status = (path: string) =>
            proxy(new NextRequest(`http://localhost${path}`))?.status
        expect(status("/")).toBe(307)
        expect(status("/docs/editor")).toBe(308)
        expect(status("/mcp")).toBe(308)
    })
})
