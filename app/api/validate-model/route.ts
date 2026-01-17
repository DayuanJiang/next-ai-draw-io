import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek, deepseek } from "@ai-sdk/deepseek"
import { createGateway } from "@ai-sdk/gateway"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText } from "ai"
import { NextResponse } from "next/server"
import { createOllama } from "ollama-ai-provider-v2"
import { allowPrivateUrls, isPrivateUrl } from "@/lib/ssrf-protection"

export const runtime = "nodejs"

interface ValidateRequest {
    provider: string
    apiKey: string
    baseUrl?: string
    modelId: string
    // AWS Bedrock specific
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsRegion?: string
    // Vertex AI specific
    vertexApiKey?: string // Express Mode API key
}

export async function POST(req: Request) {
    try {
        const body: ValidateRequest = await req.json()
        const {
            provider,
            apiKey,
            baseUrl,
            modelId,
            awsAccessKeyId,
            awsSecretAccessKey,
            awsRegion,
            // Note: Express Mode only needs vertexApiKey
            vertexApiKey,
        } = body

        if (!provider || !modelId) {
            return NextResponse.json(
                { valid: false, error: "Provider and model ID are required" },
                { status: 400 },
            )
        }

        // SECURITY: Block SSRF attacks via custom baseUrl
        if (baseUrl && !allowPrivateUrls && isPrivateUrl(baseUrl)) {
            return NextResponse.json(
                { valid: false, error: "Invalid base URL" },
                { status: 400 },
            )
        }

        // Validate credentials based on provider
        if (provider === "bedrock") {
            if (!awsAccessKeyId || !awsSecretAccessKey || !awsRegion) {
                return NextResponse.json(
                    {
                        valid: false,
                        error: "AWS credentials (Access Key ID, Secret Access Key, Region) are required",
                    },
                    { status: 400 },
                )
            }
        } else if (provider === "vertexai") {
            if (!vertexApiKey) {
                return NextResponse.json(
                    {
                        valid: false,
                        error: "Vertex AI API key is required for Express Mode",
                    },
                    { status: 400 },
                )
            }
        } else if (provider !== "ollama" && provider !== "edgeone" && !apiKey) {
            return NextResponse.json(
                { valid: false, error: "API key is required" },
                { status: 400 },
            )
        }

        let model: any

        switch (provider) {
            case "openai": {
                const openai = createOpenAI({
                    apiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                })
                model = openai.chat(modelId)
                break
            }

            case "anthropic": {
                const anthropic = createAnthropic({
                    apiKey,
                    baseURL: baseUrl || "https://api.anthropic.com/v1",
                })
                model = anthropic(modelId)
                break
            }

            case "google": {
                const google = createGoogleGenerativeAI({
                    apiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                })
                model = google(modelId)
                break
            }

            case "vertexai": {
                const vertex = createVertex({
                    apiKey: vertexApiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                })
                model = vertex(modelId)
                break
            }

            case "azure": {
                const azure = createOpenAI({
                    apiKey,
                    baseURL: baseUrl,
                })
                model = azure.chat(modelId)
                break
            }

            case "bedrock": {
                const bedrock = createAmazonBedrock({
                    accessKeyId: awsAccessKeyId,
                    secretAccessKey: awsSecretAccessKey,
                    region: awsRegion,
                })
                model = bedrock(modelId)
                break
            }

            case "openrouter": {
                const openrouter = createOpenRouter({
                    apiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                })
                model = openrouter(modelId)
                break
            }

            case "deepseek": {
                if (baseUrl || apiKey) {
                    const ds = createDeepSeek({
                        apiKey,
                        ...(baseUrl && { baseURL: baseUrl }),
                    })
                    model = ds(modelId)
                } else {
                    model = deepseek(modelId)
                }
                break
            }

            case "siliconflow": {
                const sf = createOpenAI({
                    apiKey,
                    baseURL: baseUrl || "https://api.siliconflow.cn/v1",
                })
                model = sf.chat(modelId)
                break
            }

            case "ollama": {
                const ollama = createOllama({
                    baseURL: baseUrl || "http://localhost:11434",
                })
                model = ollama(modelId)
                break
            }

            case "gateway": {
                const gw = createGateway({
                    apiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                })
                model = gw(modelId)
                break
            }

            case "edgeone": {
                // EdgeOne uses OpenAI-compatible API via Edge Functions
                // Need to pass cookies for EdgeOne Pages authentication
                const cookieHeader = req.headers.get("cookie") || ""
                const edgeone = createOpenAI({
                    apiKey: "edgeone", // EdgeOne doesn't require API key
                    baseURL: baseUrl || "/api/edgeai",
                    headers: {
                        cookie: cookieHeader,
                    },
                })
                model = edgeone.chat(modelId)
                break
            }

            case "sglang": {
                // SGLang is OpenAI-compatible
                const sglang = createOpenAI({
                    apiKey: apiKey || "not-needed",
                    baseURL: baseUrl || "http://127.0.0.1:8000/v1",
                })
                model = sglang.chat(modelId)
                break
            }

            case "doubao": {
                // ByteDance Doubao: use DeepSeek for DeepSeek/Kimi models, OpenAI for others
                const doubaoBaseUrl =
                    baseUrl || "https://ark.cn-beijing.volces.com/api/v3"
                const lowerModelId = modelId.toLowerCase()
                if (
                    lowerModelId.includes("deepseek") ||
                    lowerModelId.includes("kimi")
                ) {
                    const doubao = createDeepSeek({
                        apiKey,
                        baseURL: doubaoBaseUrl,
                    })
                    model = doubao(modelId)
                } else {
                    const doubao = createOpenAI({
                        apiKey,
                        baseURL: doubaoBaseUrl,
                    })
                    model = doubao.chat(modelId)
                }
                break
            }

            case "modelscope": {
                const baseURL =
                    baseUrl || "https://api-inference.modelscope.cn/v1"
                const startTime = Date.now()

                try {
                    // Initiate a streaming request (required for QwQ-32B and certain Qwen3 models)
                    const response = await fetch(
                        `${baseURL}/chat/completions`,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${apiKey}`,
                            },
                            body: JSON.stringify({
                                model: modelId,
                                messages: [
                                    { role: "user", content: "Say 'OK'" },
                                ],
                                max_tokens: 20,
                                stream: true,
                                enable_thinking: false,
                            }),
                        },
                    )

                    if (!response.ok) {
                        const errorText = await response.text()
                        throw new Error(
                            `ModelScope API error (${response.status}): ${errorText}`,
                        )
                    }

                    const contentType =
                        response.headers.get("content-type") || ""
                    const isValidStreamingResponse =
                        response.status === 200 &&
                        (contentType.includes("text/event-stream") ||
                            contentType.includes("application/json"))

                    if (!isValidStreamingResponse) {
                        throw new Error(
                            `Unexpected response format: ${contentType}`,
                        )
                    }

                    const responseTime = Date.now() - startTime

                    if (response.body) {
                        response.body.cancel().catch(() => {
                            /* Ignore cancellation errors */
                        })
                    }

                    return NextResponse.json({
                        valid: true,
                        responseTime,
                        note: "ModelScope model validated (using streaming API)",
                    })
                } catch (error) {
                    console.error(
                        "[validate-model] ModelScope validation failed:",
                        error,
                    )
                    throw error
                }
            }

            default:
                return NextResponse.json(
                    { valid: false, error: `Unknown provider: ${provider}` },
                    { status: 400 },
                )
        }

        // Make a minimal test request
        const startTime = Date.now()
        await generateText({
            model,
            prompt: "Say 'OK'",
            maxOutputTokens: 20,
        })
        const responseTime = Date.now() - startTime

        return NextResponse.json({
            valid: true,
            responseTime,
        })
    } catch (error) {
        console.error("[validate-model] Error:", error)

        let errorMessage = "Validation failed"
        if (error instanceof Error) {
            // Extract meaningful error message
            if (
                error.message.includes("401") ||
                error.message.includes("Unauthorized")
            ) {
                errorMessage = "Invalid API key"
            } else if (
                error.message.includes("404") ||
                error.message.includes("not found")
            ) {
                errorMessage = "Model not found"
            } else if (
                error.message.includes("429") ||
                error.message.includes("rate limit")
            ) {
                errorMessage = "Rate limited - try again later"
            } else if (error.message.includes("ECONNREFUSED")) {
                errorMessage = "Cannot connect to server"
            } else {
                errorMessage = error.message.slice(0, 100)
            }
        }

        return NextResponse.json(
            { valid: false, error: errorMessage },
            { status: 200 }, // Return 200 so client can read error message
        )
    }
}
