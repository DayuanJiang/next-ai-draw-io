import { describe, expect, it } from "vitest"
import { isTextFile } from "@/lib/pdf-utils"

describe("isTextFile", () => {
    it("treats SVG files as text so their markup is sent to the model", () => {
        const svg = new File(["<svg/>"], "diagram.svg", {
            type: "image/svg+xml",
        })
        expect(isTextFile(svg)).toBe(true)
    })

    it("does not treat raster images as text", () => {
        const png = new File(["x"], "photo.png", { type: "image/png" })
        expect(isTextFile(png)).toBe(false)
    })
})
