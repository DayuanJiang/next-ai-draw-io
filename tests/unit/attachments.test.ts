// @vitest-environment node
import { describe, expect, it } from "vitest"
import { readImageTypes, validateFiles } from "@/components/chat/attachments"
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
