// @vitest-environment node
import { describe, expect, it } from "vitest"
import { sanitizeMessage } from "@/lib/session-storage"

describe("sanitizeMessage", () => {
    it("preserves assistant metadata for persisted sessions", () => {
        const sanitized = sanitizeMessage({
            id: "assistant-1",
            role: "assistant",
            metadata: {
                provider: "openai",
                modelId: "gpt-4o",
                usage: {
                    inputTokens: 120,
                    outputTokens: 80,
                    totalTokens: 200,
                    estimatedCostUsd: 0.0012,
                    costAvailable: true,
                },
            },
            parts: [{ type: "text", text: "Done" }],
        })

        expect(sanitized?.metadata).toEqual({
            provider: "openai",
            modelId: "gpt-4o",
            usage: {
                inputTokens: 120,
                outputTokens: 80,
                totalTokens: 200,
                estimatedCostUsd: 0.0012,
                costAvailable: true,
            },
        })
    })

    it("drops non-cloneable metadata instead of throwing", () => {
        expect(() =>
            sanitizeMessage({
                id: "assistant-2",
                role: "assistant",
                metadata: { bad: () => "not cloneable" },
                parts: [{ type: "text", text: "Done" }],
            }),
        ).not.toThrow()

        const sanitized = sanitizeMessage({
            id: "assistant-2",
            role: "assistant",
            metadata: { bad: () => "not cloneable" },
            parts: [{ type: "text", text: "Done" }],
        })

        expect(sanitized?.metadata).toBeUndefined()
    })
})
