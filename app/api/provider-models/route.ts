import { NextResponse } from "next/server"
import { checkAccessCode, rejectCrossSite } from "@/lib/access-code"
import { customHeadersOf } from "@/lib/custom-headers"
import { classifyLLMError } from "@/lib/llm-errors"
import {
    canListModels,
    listProviderModels,
    ModelListError,
} from "@/lib/provider-models"
import { PROVIDERS, type ProviderName } from "@/lib/providers"
import {
    allowPrivateUrls,
    isPrivateUrl,
    RedirectRefusedError,
    redirectGuardedFetch,
} from "@/lib/ssrf-protection"

export const runtime = "nodejs"

/**
 * The models a provider offers, for the "Fetch models" button in model
 * settings. Answers { models: null } for providers that cannot list them,
 * so the dialog keeps its suggested models.
 */
export async function POST(req: Request) {
    const crossSite = rejectCrossSite(req)
    if (crossSite) return crossSite
    // Sends requests to a URL the client chose, so require the access code
    const accessError = checkAccessCode(req)
    if (accessError) return accessError

    const { provider, apiKey, baseUrl, customHeaders } = (await req.json()) as {
        provider: ProviderName
        apiKey?: string
        baseUrl?: string
        customHeaders?: string
    }
    if (!canListModels(provider)) {
        return NextResponse.json({ models: null })
    }
    // The body is untrusted: only strings count as a key, URL or headers
    if (
        [apiKey, baseUrl, customHeaders].some(
            (v) => v != null && typeof v !== "string",
        )
    ) {
        return NextResponse.json(
            { error: "Invalid request body" },
            { status: 400 },
        )
    }
    // SECURITY: Block SSRF attacks via custom baseUrl
    if (baseUrl && !allowPrivateUrls() && (await isPrivateUrl(baseUrl))) {
        return NextResponse.json({ error: "Invalid base URL" }, { status: 400 })
    }
    const extraHeaders = customHeadersOf(customHeaders)
    if (!extraHeaders.ok) {
        return NextResponse.json(
            { error: extraHeaders.message },
            { status: 400 },
        )
    }
    // Public and local lists need no key
    if (!apiKey && !PROVIDERS[provider].listNeedsNoKey) {
        return NextResponse.json(
            { error: "API key is required" },
            { status: 400 },
        )
    }

    try {
        // Only the client's key is used, so the headers go with it, and
        // to no other origin
        const headerNames = Object.keys(extraHeaders.headers ?? {})
        const models = await listProviderModels(
            provider,
            { apiKey, baseUrl, customHeaders: extraHeaders.headers },
            ((baseUrl || headerNames.length) &&
                redirectGuardedFetch(headerNames)) ||
                fetch,
        )
        return NextResponse.json({ models })
    } catch (error) {
        console.warn("[provider-models] Listing failed:", error)
        // Only our own explanations go back: the URL may be an internal
        // address, whose answer or host names must not reach the caller.
        // The Gateway SDK wraps them, keeping ours as the cause.
        const isOwn = (e: unknown): e is Error =>
            e instanceof ModelListError || e instanceof RedirectRefusedError
        const cause = (error as { cause?: unknown })?.cause
        const own = isOwn(error) ? error : isOwn(cause) ? cause : null
        const { code } = classifyLLMError(own ?? error)
        return NextResponse.json({
            code,
            error: own?.message ?? "The model list request failed.",
        })
    }
}
