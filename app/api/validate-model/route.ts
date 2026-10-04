import { streamText, tool } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"
import { checkAccessCode } from "@/lib/access-code"
import { getAIModel } from "@/lib/ai-providers"
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

const TEST_TIMEOUT_MS = 15_000

// Drawing works through tool calls, so the test asks for one
const PING_TOOL = tool({
    description: "Report that the connection works.",
    inputSchema: z.object({}),
})

const NO_TOOL_CALL_WARNING =
    "Connected, but the model answered without calling a tool. It may not support tool calls, which drawing needs."

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

        // The same model the chat would use. A client base URL makes it
        // refuse redirects to internal hosts.
        const { model } = getAIModel({
            provider,
            modelId,
            apiKey,
            baseUrl,
            awsAccessKeyId,
            awsSecretAccessKey,
            awsRegion,
            vertexApiKey,
            // EdgeOne checks the Pages cookies and the access code
            ...(provider === "edgeone" && {
                headers: {
                    cookie: req.headers.get("cookie") || "",
                    "x-access-code": req.headers.get("x-access-code") || "",
                },
            }),
        })

        // Streaming, like the chat (some models only stream). Stop at the
        // first tool call; a reasoning model that runs out of tokens first
        // proves the connection but not tool support.
        const startTime = Date.now()
        const result = streamText({
            model,
            prompt: "Call the ping tool.",
            tools: { ping: PING_TOOL },
            maxOutputTokens: 1024,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        })
        let calledTool = false
        let finishReason: string | undefined
        for await (const part of result.fullStream) {
            if (part.type === "error") throw part.error
            if (part.type === "tool-call") {
                calledTool = true
                break
            }
            if (part.type === "finish") finishReason = part.finishReason
        }
        const responseTime = Date.now() - startTime

        return NextResponse.json({
            valid: true,
            responseTime,
            ...(!calledTool &&
                finishReason !== "length" && { warning: NO_TOOL_CALL_WARNING }),
        })
    } catch (error) {
        console.error("[validate-model] Error:", error)

        let errorMessage = "Validation failed"
        if (error instanceof Error) {
            // Extract meaningful error message
            if (error.name === "TimeoutError") {
                errorMessage = `No answer within ${TEST_TIMEOUT_MS / 1000} seconds`
            } else if (
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
