import { describe, expect, it } from "vitest"
import {
    CACHED_EXAMPLE_RESPONSES,
    findCachedResponse,
} from "@/lib/cached-responses"

describe("findCachedResponse", () => {
    it("returns cached response for exact match without image", () => {
        const result = findCachedResponse(
            "Give me a **animated connector** diagram of transformer's architecture",
            false,
        )
        expect(result).toBeDefined()
        expect(result?.xml).toContain("Transformer Architecture")
    })

    it("returns cached response for exact match with image", () => {
        const result = findCachedResponse("Replicate this in aws style", true)
        expect(result).toBeDefined()
        expect(result?.xml).toContain("AWS")
    })

    it("returns undefined for non-matching prompt", () => {
        const result = findCachedResponse(
            "random prompt that doesn't exist",
            false,
        )
        expect(result).toBeUndefined()
    })

    it("returns undefined when hasImage doesn't match", () => {
        // This prompt exists but requires hasImage=true
        const result = findCachedResponse("Replicate this in aws style", false)
        expect(result).toBeUndefined()
    })

    it("returns undefined for partial match", () => {
        const result = findCachedResponse("Give me a diagram", false)
        expect(result).toBeUndefined()
    })

    it("returns response for Draw a cat prompt", () => {
        const result = findCachedResponse("Draw a cat for me", false)
        expect(result).toBeDefined()
        expect(result?.xml).toContain("ellipse")
    })

    it("all cached responses have non-empty xml", () => {
        for (const response of CACHED_EXAMPLE_RESPONSES) {
            expect(response.xml).not.toBe("")
            expect(response.xml.length).toBeGreaterThan(0)
        }
    })
})
