import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
    GALLERY_CATEGORIES,
    GALLERY_ITEMS,
} from "@/components/site/gallery-items"

const publicDir = join(process.cwd(), "public")

describe("docs gallery", () => {
    it("shows pictures that exist, once each", () => {
        for (const item of GALLERY_ITEMS) {
            expect(existsSync(join(publicDir, item.src)), item.id).toBe(true)
        }
        const ids = GALLERY_ITEMS.map((item) => item.id)
        expect(new Set(ids).size).toBe(ids.length)
        const srcs = GALLERY_ITEMS.map((item) => item.src)
        expect(new Set(srcs).size).toBe(srcs.length)
    })

    it("uses every file of public/gallery, each with a title", () => {
        for (const file of readdirSync(join(publicDir, "gallery"))) {
            expect(
                GALLERY_ITEMS.some((item) => item.src === `/gallery/${file}`),
                file,
            ).toBe(true)
            expect(
                readFileSync(join(publicDir, "gallery", file), "utf8"),
                file,
            ).toMatch(/^<svg\b[^>]*><title>[^<]+<\/title>/)
        }
    })

    it("has something in every category", () => {
        for (const category of GALLERY_CATEGORIES) {
            expect(
                GALLERY_ITEMS.some((item) => item.category === category.id),
                category.id,
            ).toBe(true)
        }
    })
})
