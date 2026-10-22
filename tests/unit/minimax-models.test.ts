// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import {
    applyThinkingSwitch,
    getAIModel,
    getValidationModel,
} from "@/lib/ai-providers"
import { getModelInfo, listCatalogModels } from "@/lib/model-catalog"
import { currentModelSuggestions } from "@/lib/model-suggestions"
import { listProviderModels } from "@/lib/provider-models"
import { PROVIDERS } from "@/lib/providers"
import { flattenModels } from "@/lib/types/model-config"

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

const flash = "MiniMax-M3.1-Flash"
const openrouterFlash = "minimax/minimax-m3.1-flash:free"

describe("MiniMax model suggestions", () => {
    it("starts new text configurations with Flash while retaining legacy metadata", () => {
        expect(PROVIDERS.minimax.models).toEqual([flash, "MiniMax-M3"])
        expect(listCatalogModels("minimax")).toEqual([flash, "MiniMax-M3"])
        expect(getModelInfo("minimax", "MiniMax-M2.7")).toBeDefined()
        expect(getModelInfo("minimax", flash)).toMatchObject({
            context: 1000000,
            output: 524288,
            cost: { input: 0.15, output: 0.6, cacheRead: 0.015 },
        })
        expect(getModelInfo("openrouter", openrouterFlash)?.cost).toEqual({
            input: 0,
            output: 0,
        })
        expect(getModelInfo("openrouter", "minimax/minimax-m3")).toMatchObject({
            context: 1048576,
            cost: { input: 0.3, output: 1.2, cacheRead: 0.06 },
        })
    })

    it("keeps non-text entries and other models without inventing gateway Flash routes", () => {
        const models = [
            "other-model",
            "minimax/minimax-m2.7",
            "minimax/minimax-m3",
            "minimax/image-01",
            openrouterFlash,
        ].map((id) => ({ id }))
        expect(
            currentModelSuggestions("openrouter", models).map((m) => m.id),
        ).toEqual([
            "other-model",
            openrouterFlash,
            "minimax/minimax-m3",
            "minimax/image-01",
        ])
        expect(
            currentModelSuggestions("gateway", models).map((m) => m.id),
        ).toEqual(["other-model", "minimax/minimax-m3", "minimax/image-01"])
        expect(currentModelSuggestions("custom", models)).toBe(models)
    })

    it("filters live official suggestions but preserves custom endpoint lists", async () => {
        const data = [
            "minimax/minimax-m2.7",
            "minimax/minimax-m3",
            openrouterFlash,
        ].map((id) => ({ id, supported_parameters: ["tools"] }))
        const fetchModels = async () => Response.json({ data })
        const official = await listProviderModels("openrouter", {}, fetchModels)
        expect(official.map((m) => m.id)).toEqual([
            openrouterFlash,
            "minimax/minimax-m3",
        ])
        const custom = await listProviderModels(
            "openrouter",
            {
                baseUrl: "https://custom.example/v1",
            },
            fetchModels,
        )
        expect(custom.map((m) => m.id)).toEqual(data.map((m) => m.id))
    })

    it("retains explicit saved model IDs and selections", () => {
        const saved = {
            version: 1 as const,
            selectedModelId: "saved",
            providers: [
                {
                    id: "provider",
                    provider: "minimax" as const,
                    apiKey: "test-key",
                    models: [{ id: "saved", modelId: "MiniMax-M2.7" }],
                },
            ],
        }
        expect(flattenModels(saved)[0].modelId).toBe("MiniMax-M2.7")
        expect(saved.selectedModelId).toBe("saved")
    })
})

describe("MiniMax serialized SDK requests", () => {
    for (const host of ["api.minimax.io", "api.minimaxi.com"]) {
        for (const protocol of ["anthropic", "openai"]) {
            for (const modelId of [
                flash,
                "MiniMax-M3",
                "MiniMax-M2.7",
                "custom-deployment",
            ]) {
                it(`${host} ${protocol} preserves ${modelId}, tools and image content`, async () => {
                    let request: { url: string; body: any } | undefined
                    vi.stubGlobal(
                        "fetch",
                        async (url: string, init: RequestInit) => {
                            request = {
                                url: String(url),
                                body: JSON.parse(String(init.body)),
                            }
                            if (request.body.stream) {
                                return new Response("data: [DONE]\n\n", {
                                    headers: {
                                        "content-type": "text/event-stream",
                                    },
                                })
                            }
                            return Response.json(
                                protocol === "anthropic"
                                    ? {
                                          id: "message-test",
                                          type: "message",
                                          role: "assistant",
                                          model: modelId,
                                          content: [
                                              { type: "text", text: "done" },
                                          ],
                                          stop_reason: "end_turn",
                                          stop_sequence: null,
                                          usage: {
                                              input_tokens: 10,
                                              output_tokens: 1,
                                          },
                                      }
                                    : {
                                          id: "completion-test",
                                          object: "chat.completion",
                                          created: 1,
                                          model: modelId,
                                          choices: [
                                              {
                                                  index: 0,
                                                  message: {
                                                      role: "assistant",
                                                      content: "done",
                                                  },
                                                  finish_reason: "stop",
                                              },
                                          ],
                                          usage: {
                                              prompt_tokens: 10,
                                              completion_tokens: 1,
                                              total_tokens: 11,
                                          },
                                      },
                            )
                        },
                    )
                    const { model, providerOptions } = getAIModel({
                        provider: "minimax",
                        apiKey: "test-key",
                        modelId:
                            modelId === flash
                                ? PROVIDERS.minimax.models?.[0]
                                : modelId,
                        baseUrl: `https://${host}/${protocol === "anthropic" ? "anthropic" : "v1"}`,
                    })
                    const params = {
                        maxOutputTokens: 1024,
                        providerOptions: applyThinkingSwitch(
                            providerOptions,
                            "minimax",
                            modelId,
                            false,
                        ),
                        tools: [
                            {
                                type: "function",
                                name: "display_diagram",
                                inputSchema: { type: "object" },
                            },
                        ],
                        prompt: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: "Draw a diagram" },
                                ],
                            },
                            {
                                role: "assistant",
                                content: [
                                    {
                                        type: "tool-call",
                                        toolCallId: "call-1",
                                        toolName: "display_diagram",
                                        input: { xml: "<mxfile/>" },
                                    },
                                ],
                            },
                            {
                                role: "tool",
                                content: [
                                    {
                                        type: "tool-result",
                                        toolCallId: "call-1",
                                        toolName: "display_diagram",
                                        output: {
                                            type: "json",
                                            value: { success: true },
                                        },
                                    },
                                ],
                            },
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: "Check this image" },
                                    {
                                        type: "file",
                                        data: new URL(
                                            "https://example.com/diagram.png",
                                        ),
                                        mediaType: "image/png",
                                    },
                                ],
                            },
                        ],
                    }
                    await model.doGenerate(params)
                    await model.doStream(params)
                    expect(request?.body.stream).toBe(true)
                    expect(request?.url).toBe(
                        `https://${host}/${protocol === "anthropic" ? "anthropic/v1/messages" : "v1/chat/completions"}`,
                    )
                    expect(request?.body.model).toBe(modelId)
                    expect(request?.body.tools).toHaveLength(1)
                    const body = JSON.stringify(request?.body)
                    expect(body).toContain("diagram.png")
                    expect(body).toContain("call-1")
                    expect(body).toContain("<mxfile/>")
                    expect(body).toContain("success")
                    expect(request?.body.thinking?.type).not.toBe("disabled")
                    expect(request?.body.reasoning_effort).not.toBe("none")
                    expect(request?.body.service_tier).toBeUndefined()
                    expect(request?.body.reasoning_split).toBeUndefined()
                })
            }
        }
    }

    it("sends the verified OpenRouter Flash ID through its real streaming SDK", async () => {
        let request: { url: string; body: any } | undefined
        vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
            request = { url: String(url), body: JSON.parse(String(init.body)) }
            return new Response("data: [DONE]\n\n", {
                headers: { "content-type": "text/event-stream" },
            })
        })
        const { model } = getAIModel({
            provider: "openrouter",
            apiKey: "test-key",
            modelId: listCatalogModels("openrouter").find((id) =>
                id.startsWith("minimax/"),
            ),
        })
        await model.doStream({
            prompt: [
                {
                    role: "user",
                    content: [{ type: "text", text: "Draw a diagram" }],
                },
            ],
        })
        expect(request?.url).toBe(
            "https://openrouter.ai/api/v1/chat/completions",
        )
        expect(request?.body.model).toBe(openrouterFlash)
        expect(request?.body.stream).toBe(true)
    })

    it("uses the provider's new default and leaves explicit visual validation on M3", () => {
        expect(
            getAIModel({
                provider: "minimax",
                apiKey: "test-key",
                modelId: PROVIDERS.minimax.models?.[0],
            }).modelId,
        ).toBe(flash)
        vi.stubEnv("AI_PROVIDER", "minimax")
        vi.stubEnv("MINIMAX_API_KEY", "test-key")
        vi.stubEnv("AI_MODEL", "MiniMax-M3")
        expect(getValidationModel().modelId).toBe("MiniMax-M3")
        vi.stubEnv("VALIDATION_MODEL", "MiniMax-M2.7")
        expect(getValidationModel().modelId).toBe("MiniMax-M2.7")
    })
})
