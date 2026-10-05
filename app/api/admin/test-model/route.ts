import { POST as validateModel } from "@/app/api/validate-model/route"
import { checkAdminAuth } from "@/lib/admin/auth"
import {
    AdminProviderSchema,
    loadAdminProviders,
    mergeSecrets,
} from "@/lib/admin/providers"
import { globalBaseUrl } from "@/lib/ai-providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Test a model with the client's CURRENT provider state (which may be
// unsaved). Secret fields arrive either as plaintext (newly typed) or as
// masked {isSet} markers, which are resolved against settings.json — so
// testing works both before and after saving.
export async function POST(req: Request) {
    const authError = checkAdminAuth(req)
    if (authError) return authError

    let body: { provider?: unknown; modelId?: string }
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = AdminProviderSchema.safeParse(body.provider)
    if (!parsed.success || !body.modelId) {
        return Response.json(
            { valid: false, error: "Invalid provider or model" },
            { status: 400 },
        )
    }

    // SECURITY: a stored secret is only resolved from an {isSet} marker if
    // the endpoint it would be sent to (provider + baseUrl) still matches
    // the stored entry. Otherwise a tampered baseUrl could exfiltrate the
    // stored key to an arbitrary host. Mismatches must re-supply plaintext.
    const stored = loadAdminProviders().find((p) => p.id === parsed.data.id)
    const sameEndpoint =
        stored &&
        stored.provider === parsed.data.provider &&
        (stored.baseUrl ?? "") === (parsed.data.baseUrl ?? "") &&
        (stored.awsRegion ?? "") === (parsed.data.awsRegion ?? "")
    const [resolved] = mergeSecrets(
        [parsed.data],
        sameEndpoint && stored ? [stored] : [],
    )

    const serverUrl = globalBaseUrl(resolved.provider)
    return validateModel(
        new Request(new URL("/api/validate-model", req.url), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Checked again there, in place of an access code
                "x-admin-password": req.headers.get("x-admin-password") || "",
                // The EdgeOne function checks the access code and Pages
                // cookies, and its URL is built from the page's origin
                "x-access-code": req.headers.get("x-access-code") || "",
                cookie: req.headers.get("cookie") || "",
                ...(req.headers.get("origin") && {
                    origin: req.headers.get("origin") as string,
                }),
            },
            body: JSON.stringify({
                provider: resolved.provider,
                apiKey: resolved.apiKey,
                // Without a URL of its own, chat sends the entry's key to
                // the server's <P>_BASE_URL: test that endpoint, not
                // another one. It is the server's own, which chat uses
                // without the checks for a URL a user typed.
                baseUrl: resolved.baseUrl || serverUrl,
                ...(!resolved.baseUrl && serverUrl && { serverBaseUrl: true }),
                modelId: body.modelId,
                awsAccessKeyId: resolved.awsAccessKeyId,
                awsSecretAccessKey: resolved.awsSecretAccessKey,
                awsRegion: resolved.awsRegion,
                vertexApiKey: resolved.vertexApiKey,
            }),
        }),
    )
}
