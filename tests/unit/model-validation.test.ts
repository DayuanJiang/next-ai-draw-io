import { describe, expect, it } from "vitest"
import {
    DEFAULT_MODEL_VALIDATION_MAX_TOKENS,
    MAX_MODEL_VALIDATION_MAX_TOKENS,
    parseModelValidationMaxTokens,
    resolveModelValidationMaxTokens,
} from "@/lib/model-validation"

describe("model validation token budget", () => {
    it("defaults to a larger reasoning-friendly budget", () => {
        expect(resolveModelValidationMaxTokens()).toBe(
            DEFAULT_MODEL_VALIDATION_MAX_TOKENS,
        )
    })

    it("prefers the first valid source", () => {
        expect(resolveModelValidationMaxTokens(2000, 3000)).toBe(2000)
        expect(resolveModelValidationMaxTokens("bad", "3000")).toBe(3000)
    })

    it("rejects invalid values", () => {
        expect(parseModelValidationMaxTokens(0)).toBeNull()
        expect(parseModelValidationMaxTokens(-1)).toBeNull()
        expect(parseModelValidationMaxTokens(1.5)).toBeNull()
        expect(parseModelValidationMaxTokens("abc")).toBeNull()
    })

    it("caps very large values", () => {
        expect(
            resolveModelValidationMaxTokens(
                MAX_MODEL_VALIDATION_MAX_TOKENS + 1,
            ),
        ).toBe(MAX_MODEL_VALIDATION_MAX_TOKENS)
    })
})
