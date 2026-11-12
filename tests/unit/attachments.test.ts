// @vitest-environment node
import { describe, expect, it } from "vitest"
import { validateFiles } from "@/components/chat/attachments"
import en from "@/lib/i18n/dictionaries/en.json"

describe("validateFiles", () => {
    it("turns away an empty file, which would fail the request", () => {
        // Bedrock: "image.source.bytes ... must have length greater than or
        // equal to 1"
        const empty = new File([], "pasted.png", { type: "image/png" })
        const image = new File([new Uint8Array(10)], "ok.png", {
            type: "image/png",
        })
        const { validFiles, errors } = validateFiles([empty, image], 0, en)
        expect(validFiles).toEqual([image])
        expect(errors).toEqual([
            '"pasted.png" is empty (0 bytes). Copy or save it again, then attach it.',
        ])
    })

    it("names the files that are over the limit of five", () => {
        const picked = ["a", "b", "c", "d"].map(
            (name) => new File(["x"], `${name}.md`, { type: "text/markdown" }),
        )
        // Three are attached already: two more fit
        const { validFiles, errors } = validateFiles(picked, 3, en)
        expect(validFiles).toEqual(picked.slice(0, 2))
        expect(errors).toEqual([
            "Only 2 more file(s) allowed. Not attached: c.md, d.md",
        ])
    })
})
