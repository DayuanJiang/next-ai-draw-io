// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
    pngSizeEstimate,
    readImageTypes,
    shareOf,
    validateFiles,
} from "@/components/chat/attachments"
import { imageBudgetOf } from "@/lib/chat-helpers"
import en from "@/lib/i18n/dictionaries/en.json"

// As the message box does: read what the pictures are, then validate
const validate = async (files: File[], attached = 0) =>
    validateFiles(files, attached, en, await readImageTypes(files))

// The first bytes of a PNG, a HEIC photo and an Office file
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
const HEIC = new TextEncoder().encode("\0\0\0\x18ftypheic\0\0\0\0mif1")
const OFFICE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

describe("validateFiles", () => {
    it("turns away an empty file, which would fail the request", async () => {
        // Bedrock: "image.source.bytes ... must have length greater than or
        // equal to 1"
        const empty = new File([], "pasted.png", { type: "image/png" })
        const image = new File([PNG], "ok.png", { type: "image/png" })
        const { validFiles, errors } = await validate([empty, image])
        expect(validFiles).toEqual([image])
        expect(errors).toEqual([
            '"pasted.png" is empty (0 bytes). Copy or save it again, then attach it.',
        ])
    })

    it("names the files that are over the limit of five", async () => {
        const picked = ["a", "b", "c", "d"].map(
            (name) => new File(["x"], `${name}.md`, { type: "text/markdown" }),
        )
        // Three are attached already: two more fit
        const { validFiles, errors } = await validate(picked, 3)
        expect(validFiles).toEqual(picked.slice(0, 2))
        expect(errors).toEqual([
            "Only 2 more file(s) allowed. Not attached: c.md, d.md",
        ])
    })

    it("turns away a file named as a picture that is none", async () => {
        // Bedrock: "image processing failed: cannot measure image
        // dimensions: The image format could not be determined"
        const photo = new File([HEIC], "IMG_2041.jpg", { type: "image/jpeg" })
        const report = new File([OFFICE], "report.jpg", { type: "image/jpeg" })
        const { validFiles, errors } = await validate([photo, report])
        expect(validFiles).toEqual([])
        expect(errors).toEqual([
            '"IMG_2041.jpg" is named as an image, but its content is in another format. Open it, save it as PNG or JPEG, then attach it again.',
            '"report.jpg" is named as an image, but its content is in another format. Open it, save it as PNG or JPEG, then attach it again.',
        ])
    })

    it("attaches a picture named as another format as what it is", async () => {
        // Claude: "The image was specified using the image/jpeg media type,
        // but the image appears to be a image/png image"
        const picked = new File([PNG], "screenshot.jpg", {
            type: "image/jpeg",
            lastModified: 1_700_000_000_000,
        })
        const { validFiles, errors } = await validate([picked])
        expect(errors).toEqual([])
        expect(validFiles).toHaveLength(1)
        const [attached] = validFiles
        expect(attached.type).toBe("image/png")
        expect(attached.name).toBe("screenshot.jpg")
        expect(attached.size).toBe(picked.size)
        // By these a file picked a second time is known
        expect(attached.lastModified).toBe(picked.lastModified)
    })
})

// GPT-6 Luna on Amazon Bedrock refuses a request whose pictures hold too
// much data: the largest pictures are scaled down before they are sent
describe("pictures for a model that takes only so much picture data", () => {
    it("knows the limit of OpenAI models on Bedrock, and of no other", () => {
        expect(imageBudgetOf("global.openai.gpt-6-luna")).toBeGreaterThan(0)
        expect(imageBudgetOf("openai.gpt-6-luna")).toBeGreaterThan(0)
        // OpenAI's own API, OpenRouter, Claude on Bedrock, no model
        expect(imageBudgetOf("gpt-6-luna")).toBeUndefined()
        expect(imageBudgetOf("openai/gpt-6-luna")).toBeUndefined()
        expect(
            imageBudgetOf("global.anthropic.claude-sonnet-5-5"),
        ).toBeUndefined()
        expect(imageBudgetOf(undefined)).toBeUndefined()
    })

    it("lets the small pictures keep their size", () => {
        // All fit
        expect(shareOf([100, 100, 100], 300)).toBe(Number.POSITIVE_INFINITY)
        // A diagram of 10 next to two photos of 500: the photos share 400
        expect(shareOf([500, 10, 500], 410)).toBe(200)
        // One picture alone gets the whole budget
        expect(shareOf([1000], 130)).toBe(130)
        expect(shareOf([10, 20, 1000], 130)).toBe(100)
    })

    it("counts a flat picture as next to nothing and noise in full", () => {
        const width = 100
        const flat = new Uint8ClampedArray(width * 100 * 4).fill(255)
        expect(pngSizeEstimate(flat, width)).toBeLessThan(400)

        // The same numbers on every run
        let seed = 1
        const noise = new Uint8ClampedArray(width * 100 * 4)
        for (let i = 0; i < noise.length; i++) {
            seed = (seed * 48271) % 2147483647
            noise[i] = i % 4 === 3 ? 255 : (seed >> 8) & 255
        }
        // Three bytes a pixel that nothing can make smaller
        const size = pngSizeEstimate(noise, width)
        expect(size).toBeGreaterThan(29_000)
        expect(size).toBeLessThan(30_500)
    })
})
