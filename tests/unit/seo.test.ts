import { describe, expect, it } from "vitest"
import { i18n } from "@/lib/i18n/config"
import { APP_DESCRIPTION, KEYWORDS, localeAlternates } from "@/lib/seo"

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

describe("the keywords and the description every page carries", () => {
    it("are written in each language, not copied from English", () => {
        for (const locale of i18n.locales.filter((l) => l !== "en")) {
            expect(KEYWORDS[locale]).toHaveLength(KEYWORDS.en.length)
            // The product name is the same everywhere
            expect(
                KEYWORDS[locale].filter(
                    (word) => word !== "draw.io" && KEYWORDS.en.includes(word),
                ),
            ).toEqual([])
            expect(APP_DESCRIPTION[locale]).toMatch(/[\u3040-\u9fff]/)
        }
    })
})
