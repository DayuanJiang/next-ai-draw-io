import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek, deepseek } from "@ai-sdk/deepseek"
import { createGateway } from "@ai-sdk/gateway"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { generateText } from "ai"
import { NextResponse } from "next/server"
import { createOllama } from "ollama-ai-provider-v2"

export const runtime = "nodejs"

/**
 * SECURITY: Check if URL points to private/internal network (SSRF protection)
 * Blocks: localhost, private IPs, link-local, AWS metadata service
 */
function isPrivateUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString)
        const hostname = url.hostname.toLowerCase()

        // Block localhost
        if (
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1"
        ) {
            return true
        }

        // Block AWS/cloud metadata endpoints
        if (
            hostname === "169.254.169.254" ||
            hostname === "metadata.google.internal"
        ) {
            return true
        }

        // Check for private IPv4 ranges
        const ipv4Match = hostname.match(
            /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
        )
        if (ipv4Match) {
            const [, a, b] = ipv4Match.map(Number)
            // 10.0.0.0/8
            if (a === 10) return true
            // 172.16.0.0/12
            if (a === 172 && b >= 16 && b <= 31) return true
            // 192.168.0.0/16
            if (a === 192 && b === 168) return true
            // 169.254.0.0/16 (link-local)
            if (a === 169 && b === 254) return true
            // 127.0.0.0/8 (loopback)
            if (a === 127) return true
        }

        // Block common internal hostnames
        if (
            hostname.endsWith(".local") ||
            hostname.endsWith(".internal") ||
            hostname.endsWith(".localhost")
        ) {
            return true
        }

        return false
    } catch {
        // Invalid URL - block it
        return true
    }
}

interface ValidateRequest {
    provider: string
    apiKey: string
    baseUrl?: string
    modelId: string
    // AWS Bedrock specific
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsRegion?: string
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
        } = body

        if (!provider || !modelId) {
            return NextResponse.json(
                { valid: false, error: "Provider and model ID are required" },
                { status: 400 },
            )
        }

        // SECURITY: Block SSRF attacks via custom baseUrl
        if (baseUrl && isPrivateUrl(baseUrl)) {
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
        } else if (provider !== "ollama" && !apiKey) {
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
                    baseURL: baseUrl || "https://api.siliconflow.com/v1",
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
