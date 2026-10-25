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

    it("redirects the home page temporarily and other pages permanently", () => {
        const status = (path: string) =>
            proxy(new NextRequest(`http://localhost${path}`))?.status
        expect(status("/")).toBe(307)
        expect(status("/docs/editor")).toBe(308)
        expect(status("/mcp")).toBe(308)
    })
})
