import { checkAdminAuth } from "@/lib/admin/auth"
import {
    AdminProviderSchema,
    loadAdminProviders,
    mergeSecrets,
    movedSecretError,
} from "@/lib/admin/providers"
import { getEnvFallback } from "@/lib/admin/settings"
import { envVarsOf, globalBaseUrl } from "@/lib/ai-providers"
import { testModelConnection } from "@/lib/test-model-connection"

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
    // stored key to an arbitrary host. Mismatches must re-supply plaintext,
    // and are told so: "API key is required" would not say why.
    const stored = loadAdminProviders().find((p) => p.id === parsed.data.id)
    const error = movedSecretError(parsed.data, stored)
    if (error) return Response.json({ valid: false, error }, { status: 400 })
    const [resolved] = mergeSecrets([parsed.data], stored ? [stored] : [])

    // Without a URL of its own, chat sends the entry's key to the server's
    // <P>_BASE_URL: test that endpoint, not another one. Either URL is the
    // deployment's own (the entry's becomes the server's when saved), which
    // chat uses without the checks for a URL a user typed.
    // The admin's own request supplies the EdgeOne endpoint, cookies and
    // access code, as a chat request would.
    const serverUrl = globalBaseUrl(resolved.provider)
    // Without credentials of its own either, chat runs the entry on the
    // server's: the environment's key of that provider, or for Bedrock the
    // server's IAM role. The Test does the same when the server has that
    // key. With a URL of its own the entry needs its own key, so that the
    // server's key never goes to a URL that was just typed.
    const keyVar = envVarsOf(resolved.provider).apiKey
    const serverCredentials =
        !resolved.baseUrl && (!keyVar || !!getEnvFallback(keyVar))
    return testModelConnection(
        req,
        {
            provider: resolved.provider,
            apiKey: resolved.apiKey,
            baseUrl: resolved.baseUrl || serverUrl,
            modelId: body.modelId,
            awsAccessKeyId: resolved.awsAccessKeyId,
            awsSecretAccessKey: resolved.awsSecretAccessKey,
            awsRegion: resolved.awsRegion,
            vertexApiKey: resolved.vertexApiKey,
        },
        true,
        serverCredentials,
    )
}
