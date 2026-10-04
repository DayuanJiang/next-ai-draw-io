// @vitest-environment node
import { simulateReadableStream } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as validateDiagram } from "@/app/api/validate-diagram/route"

const RESULT = {
    valid: false,
    issues: [
        {
            type: "overlap",
            severity: "critical",
            description: "Box A covers box B",
        },
    ],
    suggestions: ["Move box B to the right"],
}

// A vision model that answers with the JSON in a few text chunks
vi.mock("@/lib/ai-providers", () => ({
    getValidationModel: () =>
        new MockLanguageModelV3({
            doStream: (async () => {
                const json = JSON.stringify(RESULT)
                return {
                    stream: simulateReadableStream({
                        chunks: [
                            { type: "text-start", id: "t" },
                            ...[json.slice(0, 20), json.slice(20)].map(
                                (delta) => ({
                                    type: "text-delta",
                                    id: "t",
                                    delta,
                                }),
                            ),
                            { type: "text-end", id: "t" },
                            {
                                type: "finish",
                                finishReason: { unified: "stop", raw: "stop" },
                                usage: {
                                    inputTokens: { total: 1 },
                                    outputTokens: { total: 1 },
                                },
                            },
                        ],
                    }),
                }
            }) as any,
        }),
}))

const post = () =>
    new Request("http://localhost/api/validate-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: "data:image/png;base64,AAAA" }),
    })

afterEach(() => {
    delete process.env.ENABLE_VLM_VALIDATION
})

describe("POST /api/validate-diagram", () => {
    it("streams the model's result as JSON text for useObject", async () => {
        const res = await validateDiagram(post())
        expect(JSON.parse(await res.text())).toEqual(RESULT)
    })

    it("answers valid when the check is turned off", async () => {
        process.env.ENABLE_VLM_VALIDATION = "false"
        const res = await validateDiagram(post())
        expect(JSON.parse(await res.text())).toEqual({
            valid: true,
            issues: [],
            suggestions: [],
        })
    })
})
