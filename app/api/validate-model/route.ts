import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek, deepseek } from "@ai-sdk/deepseek"
import { createGateway } from "@ai-sdk/gateway"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createOpenAI } from "@ai-sdk/openai"
import { createAihubmix } from "@aihubmix/ai-sdk-provider"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText } from "ai"
import { NextResponse } from "next/server"
import { createOllama } from "ollama-ai-provider-v2"
import { checkAccessCode } from "@/lib/access-code"
import {
    AIHUBMIX_APP_CODE,
    isAihubmixStandardBaseURL,
    normalizeMiniMaxBaseURL,
} from "@/lib/ai-providers"
import { allowPrivateUrls, isPrivateUrl } from "@/lib/ssrf-protection"
import { PROVIDER_INFO, type ProviderName } from "@/lib/types/model-config"

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

// With private URLs blocked, a public baseUrl could still redirect the
// request to an internal host, so redirects are refused in that case.
function redirectGuardedFetch(): typeof fetch | undefined {
    if (allowPrivateUrls()) return undefined
    return async (input, init) => {
        const response = await fetch(input, { ...init, redirect: "manual" })
        if (response.status >= 300 && response.status < 400) {
            throw new Error("Redirects are not allowed for custom base URLs")
        }
        return response
    }
}

export async function POST(req: Request) {
    // Lets the server send requests to arbitrary URLs, so require the access code
    const accessError = checkAccessCode(req)
    if (accessError) return accessError

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
        if (baseUrl && !allowPrivateUrls() && (await isPrivateUrl(baseUrl))) {
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

        const guardedFetch = redirectGuardedFetch()
        let model: any

        switch (provider) {
            case "openai": {
                const openai = createOpenAI({
                    apiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                    fetch: guardedFetch,
                })
                model = openai.chat(modelId)
                break
            }

            case "anthropic": {
                const anthropic = createAnthropic({
                    apiKey,
                    baseURL: baseUrl || "https://api.anthropic.com/v1",
                    fetch: guardedFetch,
                })
                model = anthropic(modelId)
                break
            }

            case "google": {
                const google = createGoogleGenerativeAI({
                    apiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                    fetch: guardedFetch,
                })
                model = google(modelId)
                break
            }

            case "vertexai": {
                const vertex = createVertex({
                    apiKey: vertexApiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                    fetch: guardedFetch,
                })
                model = vertex(modelId)
                break
            }

            case "azure": {
                const azure = createOpenAI({
                    apiKey,
                    baseURL: baseUrl,
                    fetch: guardedFetch,
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
                    fetch: guardedFetch,
                })
                model = openrouter(modelId)
                break
            }

            case "aihubmix": {
                const defaultBaseURL = PROVIDER_INFO.aihubmix.defaultBaseUrl

                if (
                    isAihubmixStandardBaseURL(baseUrl) ||
                    baseUrl === defaultBaseURL
                ) {
                    const aihubmix = createAihubmix({
                        apiKey,
                        appCode: AIHUBMIX_APP_CODE,
                    })
                    model = aihubmix(modelId)
                } else {
                    const aihubmixCompatible = createOpenAI({
                        apiKey,
                        baseURL: baseUrl,
                        fetch: guardedFetch,
                    })
                    model = aihubmixCompatible.chat(modelId)
                }
                break
            }

            case "deepseek": {
                if (baseUrl || apiKey) {
                    const ds = createDeepSeek({
                        apiKey,
                        ...(baseUrl && { baseURL: baseUrl }),
                        fetch: guardedFetch,
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
                    fetch: guardedFetch,
                })
                model = sf.chat(modelId)
                break
            }

            case "ollama": {
                // SECURITY: Mirror ai-providers.ts guard — only use server
                // OLLAMA_API_KEY when the URL is also from server config.
                const ollamaApiKey = baseUrl
                    ? apiKey || undefined
                    : apiKey || process.env.OLLAMA_API_KEY || undefined
                const ollamaProvider = createOllama({
                    baseURL:
                        baseUrl ||
                        process.env.OLLAMA_BASE_URL ||
                        "https://ollama.com/api",
                    fetch: guardedFetch,
                    ...(ollamaApiKey && {
                        headers: { Authorization: `Bearer ${ollamaApiKey}` },
                    }),
                })
                model = ollamaProvider(modelId)
                break
            }

            case "gateway": {
                const gw = createGateway({
                    apiKey,
                    ...(baseUrl && { baseURL: baseUrl }),
                    fetch: guardedFetch,
                })
                model = gw(modelId)
                break
            }

            case "edgeone": {
                // EdgeOne uses OpenAI-compatible API via Edge Functions
                // Need to pass cookies for EdgeOne Pages authentication,
                // and the access code, which the edge function also checks
                const cookieHeader = req.headers.get("cookie") || ""
                const edgeone = createOpenAI({
                    apiKey: "edgeone", // EdgeOne doesn't require API key
                    baseURL: baseUrl || "/api/edgeai",
                    fetch: guardedFetch,
                    headers: {
                        cookie: cookieHeader,
                        "x-access-code": req.headers.get("x-access-code") || "",
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
                    fetch: guardedFetch,
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
                        fetch: guardedFetch,
                    })
                    model = doubao(modelId)
                } else {
                    const doubao = createOpenAI({
                        apiKey,
                        baseURL: doubaoBaseUrl,
                        fetch: guardedFetch,
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
                    const response = await (guardedFetch ?? fetch)(
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
                        // Log the body but return only the status: the
                        // caller chooses baseUrl, so the body may come from
                        // any host the server can reach
                        console.error(
                            "[validate-model] ModelScope error body:",
                            await response.text(),
                        )
                        throw new Error(
                            `ModelScope API error (${response.status})`,
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

            case "minimax": {
                const rawUrl =
                    baseUrl ||
                    PROVIDER_INFO.minimax?.defaultBaseUrl ||
                    "https://api.minimaxi.com/anthropic"
                const { baseURL: minimaxBaseUrl, isAnthropicCompatible } =
                    normalizeMiniMaxBaseURL(rawUrl)

                if (isAnthropicCompatible) {
                    const minimax = createAnthropic({
                        apiKey,
                        baseURL: minimaxBaseUrl,
                        fetch: guardedFetch,
                    })
                    model = minimax.chat(modelId)
                } else {
                    const minimax = createOpenAI({
                        apiKey,
                        baseURL: minimaxBaseUrl,
                        fetch: guardedFetch,
                    })
                    model = minimax.chat(modelId)
                }
                break
            }

            // GLM, Qwen, Kimi, Qiniu, Novita, MiMo, Atlas Cloud - OpenAI compatible
            case "glm":
            case "qwen":
            case "kimi":
            case "qiniu":
            case "novita":
            case "atlascloud":
            case "mimo": {
                const baseURL =
                    baseUrl ||
                    PROVIDER_INFO[provider as ProviderName]?.defaultBaseUrl ||
                    ""

                if (!baseURL) {
                    return NextResponse.json(
                        {
                            valid: false,
                            error: `No base URL configured for provider: ${provider}`,
                        },
                        { status: 400 },
                    )
                }

                const openai = createOpenAI({
                    apiKey,
                    baseURL,
                    fetch: guardedFetch,
                })
                model = openai.chat(modelId)
                break
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
