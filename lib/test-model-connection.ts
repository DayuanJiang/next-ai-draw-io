import { streamText, tool } from "ai"
import { NextResponse } from "next/server"
import { z } from "zod"
import {
    edgeOneEndpoint,
    getAIModel,
    usesServerCredentials,
    usesServerEndpoint,
} from "@/lib/ai-providers"
import {
    checkAndIncrementRequest,
    isQuotaEnabled,
} from "@/lib/dynamo-quota-manager"
import { classifyLLMError } from "@/lib/llm-errors"
import { PROVIDERS, type ProviderName } from "@/lib/providers"
import { allowPrivateUrls, isPrivateUrl } from "@/lib/ssrf-protection"
import { normalizeBaseUrl } from "@/lib/types/model-config"
import { getUserIdFromRequest } from "@/lib/user-id"

export interface TestModelRequest {
    provider: ProviderName
    apiKey?: string
    baseUrl?: string
    modelId: string
    // AWS Bedrock specific
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsRegion?: string
    awsSessionToken?: string
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

/**
 * Run one tool call on a model, as the chat would, and report the result.
 * Shared by the Settings dialog's Test (/api/validate-model) and the admin
 * panel's Test (/api/admin/test-model). req supplies the EdgeOne endpoint,
 * cookies, access code and the user id for the quota. trustedBaseUrl marks
 * body.baseUrl as the server's own <P>_BASE_URL (the admin panel's Test of
 * an entry without a URL), not one a user typed: chat uses it as it is, so
 * no private-address or redirect rules, and no quota.
 */
export async function testModelConnection(
    req: Request,
    body: TestModelRequest,
    trustedBaseUrl: boolean,
): Promise<NextResponse> {
    try {
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
        // The body is untrusted: a key that is not a string (an object is
        // truthy) would count as the user's own, while an SDK that ignores
        // it (AI Gateway) falls back to the server's credentials
        const textFields = [
            "apiKey",
            "baseUrl",
            "modelId",
            "awsAccessKeyId",
            "awsSecretAccessKey",
            "awsRegion",
            "awsSessionToken",
            "vertexApiKey",
        ] as const
        if (
            textFields.some(
                (f) => body[f] != null && typeof body[f] !== "string",
            )
        ) {
            return NextResponse.json(
                { valid: false, error: "Invalid request body" },
                { status: 400 },
            )
        }
        // The body is untrusted: an unknown name has no record to read
        if (!Object.hasOwn(PROVIDERS, provider)) {
            return NextResponse.json(
                {
                    valid: false,
                    error: `Invalid provider: ${provider}. Allowed providers: ${Object.keys(PROVIDERS).join(", ")}`,
                },
                { status: 400 },
            )
        }
        const { credential } = PROVIDERS[provider]
        // The site's own function (EdgeOne) is this site's, as in the chat;
        // the admin panel's Test sends no URL, and a relative one cannot be
        // fetched
        const onSiteFunction = credential === "none"
        const baseUrl = onSiteFunction ? edgeOneEndpoint(req) : body.baseUrl

        // SECURITY: Block SSRF attacks via custom baseUrl
        if (
            baseUrl &&
            !trustedBaseUrl &&
            !allowPrivateUrls() &&
            (await isPrivateUrl(baseUrl))
        ) {
            return NextResponse.json(
                { valid: false, error: "Invalid base URL" },
                { status: 400 },
            )
        }

        // The credentials the provider's kind asks for
        switch (credential) {
            case "aws":
                if (
                    !(apiKey || (awsAccessKeyId && awsSecretAccessKey)) ||
                    !awsRegion
                ) {
                    return NextResponse.json(
                        {
                            valid: false,
                            error: "AWS credentials (a Bedrock API key, or an Access Key ID and Secret Access Key, and a Region) are required",
                        },
                        { status: 400 },
                    )
                }
                break
            case "vertexKey":
                if (!vertexApiKey) {
                    return NextResponse.json(
                        {
                            valid: false,
                            error: "Vertex AI API key is required for Express Mode",
                        },
                        { status: 400 },
                    )
                }
                break
            case "apiKey":
                if (!apiKey) {
                    return NextResponse.json(
                        { valid: false, error: "API key is required" },
                        { status: 400 },
                    )
                }
                break
            case "optionalKey":
            case "none":
                break
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
            !trustedBaseUrl &&
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
            trustedBaseUrl,
            awsAccessKeyId,
            awsSecretAccessKey,
            awsRegion,
            // Temporary AWS credentials need it, as in the chat
            awsSessionToken,
            vertexApiKey,
            // The site's function (EdgeOne) checks the Pages cookies and
            // the access code
            ...(onSiteFunction && {
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
            // Ends with the request: the user closed the dialog or the page
            abortSignal: req.signal,
            timeout: TEST_TIMEOUT_MS,
        })
        let calledTool = false
        let finishReason: string | undefined
        for await (const part of result.fullStream) {
            if (part.type === "error") throw part.error
            // The timeout (or the request's end) ends the stream with an
            // abort part, not an error
            if (part.type === "abort") {
                const timeout = new Error(
                    `The model did not answer within ${TEST_TIMEOUT_MS / 1000} s.`,
                )
                timeout.name = "TimeoutError"
                throw timeout
            }
            // A call of a tool that does not exist, or with unreadable
            // input, arrives marked invalid: no proof of tool support
            if (part.type === "tool-call" && !part.invalid) {
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
