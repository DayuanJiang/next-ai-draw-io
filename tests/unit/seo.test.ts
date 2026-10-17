import { describe, expect, it } from "vitest"
import { localeAlternates } from "@/lib/seo"

describe("localeAlternates", () => {
    it("points x-default at the English page, not the redirecting bare URL", () => {
        const alternates = localeAlternates("zh", "/gallery")
        expect(alternates.canonical).toBe("/zh/gallery")
        expect(alternates.languages).toMatchObject({
            en: "/en/gallery",
            zh: "/zh/gallery",
            "x-default": "/en/gallery",
        })
        expect(localeAlternates("ja", "").languages).toMatchObject({
            "x-default": "/en",
        })
    })
})
