import { streamText, tool } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"
import { checkAccessCode, rejectCrossSite } from "@/lib/access-code"
import { checkAdminAuth } from "@/lib/admin/auth"
import {
    edgeOneEndpoint,
    getAIModel,
    globalBaseUrl,
    usesServerCredentials,
    usesServerEndpoint,
} from "@/lib/ai-providers"
import {
    checkAndIncrementRequest,
    isQuotaEnabled,
} from "@/lib/dynamo-quota-manager"
import { classifyLLMError } from "@/lib/llm-errors"
import { allowPrivateUrls, isPrivateUrl } from "@/lib/ssrf-protection"
import { normalizeBaseUrl, type ProviderName } from "@/lib/types/model-config"
import { getUserIdFromRequest } from "@/lib/user-id"

export const runtime = "nodejs"

interface ValidateRequest {
    provider: ProviderName
    apiKey: string
    baseUrl?: string
    modelId: string
    // AWS Bedrock specific
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsRegion?: string
    awsSessionToken?: string
    // Vertex AI specific
    vertexApiKey?: string // Express Mode API key
    // Set by the admin panel's Test: baseUrl is the server's <P>_BASE_URL
    serverBaseUrl?: boolean
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
    const crossSite = rejectCrossSite(req)
    if (crossSite) return crossSite
    // Lets the server send requests to arbitrary URLs, so require the access
    // code, or the admin password (the admin panel's Test button)
    const accessError = checkAccessCode(req)
    if (accessError && checkAdminAuth(req)) return accessError

    try {
        const body: ValidateRequest = await req.json()
        const {
            provider,
            apiKey,
            modelId,
            awsAccessKeyId,
            awsSecretAccessKey,
            awsRegion,
            awsSessionToken,
            // Note: Express Mode only needs vertexApiKey
            vertexApiKey,
        } = body

        if (!provider || !modelId) {
            return NextResponse.json(
                { valid: false, error: "Provider and model ID are required" },
                { status: 400 },
            )
        }
        // EdgeOne is this site's own function, as in the chat; the admin
        // panel's Test sends no URL, and a relative one cannot be fetched
        const baseUrl =
            provider === "edgeone" ? edgeOneEndpoint(req) : body.baseUrl
        // The admin panel's Test of an entry without a URL sends the
        // server's own <P>_BASE_URL, which chat uses as it is: not a URL a
        // user chose, so no private-address or redirect rules
        const serverUrl =
            body.serverBaseUrl === true &&
            !!baseUrl &&
            baseUrl === globalBaseUrl(provider) &&
            !checkAdminAuth(req)

        // SECURITY: Block SSRF attacks via custom baseUrl
        if (
            baseUrl &&
            !serverUrl &&
            !allowPrivateUrls() &&
            (await isPrivateUrl(baseUrl))
        ) {
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
        // The Test button checks the user's own provider. On the server's
        // keys (Ollama Cloud without a key or URL) anyone could run any model.
        if (
            usesServerCredentials(provider, {
                apiKey,
                baseUrl,
                awsAccessKeyId,
                awsSecretAccessKey,
                vertexApiKey,
            })
        ) {
            return NextResponse.json(
                { valid: false, error: "API key is required" },
                { status: 400 },
            )
        }

        // On the deployment's own endpoints a Test runs a model as a chat
        // does, so with the quota on it counts as a chat request (an
        // admin's Test of the server's URL does not)
        const userId = getUserIdFromRequest(req)
        if (
            isQuotaEnabled() &&
            !serverUrl &&
            userId !== "anonymous" &&
            (await usesServerEndpoint(
                provider,
                normalizeBaseUrl(body.baseUrl ?? ""),
                apiKey,
            ))
        ) {
            const quotaCheck = await checkAndIncrementRequest(userId, {
                requests: Number(process.env.DAILY_REQUEST_LIMIT) || 10,
                tokens: Number(process.env.DAILY_TOKEN_LIMIT) || 200000,
                tpm: Number(process.env.TPM_LIMIT) || 20000,
            })
            if (!quotaCheck.allowed) {
                return NextResponse.json(
                    { valid: false, error: quotaCheck.error },
                    { status: 429 },
                )
            }
        }

        // The same model the chat would use. A client base URL makes it
        // refuse redirects to internal hosts.
        const { model } = getAIModel({
            provider,
            modelId,
            apiKey,
            baseUrl,
            trustedBaseUrl: serverUrl,
            awsAccessKeyId,
            awsSecretAccessKey,
            awsRegion,
            // Temporary AWS credentials need it, as in the chat
            awsSessionToken,
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
            // The timeout ends the stream with an abort part, not an error
            if (part.type === "abort") {
                const timeout = new Error(
                    `The model did not answer within ${TEST_TIMEOUT_MS / 1000} s.`,
                )
                timeout.name = "TimeoutError"
                throw timeout
            }
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

        const { code, message } = classifyLLMError(error)
        return NextResponse.json(
            { valid: false, code, error: message },
            { status: 200 }, // Return 200 so client can read error message
        )
    }
}
