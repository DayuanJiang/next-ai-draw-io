import { checkAdminAuth } from "@/lib/admin/auth"
import {
    AdminProvidersSchema,
    deriveEnvUpdates,
    loadAdminProviders,
    maskAdminProviders,
    mergeSecrets,
    validateAdminProviders,
} from "@/lib/admin/providers"
import { isSettingsWritable, saveSettings } from "@/lib/admin/settings"
import { loadEnvServerModelsConfig } from "@/lib/server-model-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function payload() {
    // Env-based providers (AI_MODELS_CONFIG / ai-models.json) are shown
    // read-only in the panel; their credentials live in the environment
    const envConfig = await loadEnvServerModelsConfig()
    const adminProviders = loadAdminProviders()
    // A panel default overrides any env default (matches the merge in
    // loadRawServerModelsConfig), so env stars must reflect that
    const adminHasDefault = adminProviders.some(
        (p) => p.isDefault && p.models.length > 0,
    )
    return {
        writable: isSettingsWritable(),
        providers: maskAdminProviders(adminProviders),
        envProviders:
            envConfig?.providers.map((p) => ({
                name: p.name,
                provider: p.provider,
                models: p.models,
                isDefault: !!p.default && !adminHasDefault,
            })) ?? [],
    }
}

export async function GET(req: Request) {
    const authError = checkAdminAuth(req)
    if (authError) return authError
    return Response.json(await payload())
}

export async function PUT(req: Request) {
    const authError = checkAdminAuth(req)
    if (authError) return authError

    if (!isSettingsWritable()) {
        return Response.json(
            {
                error: "Settings file is not writable on this deployment. Configure via environment variables instead.",
            },
            { status: 503 },
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = AdminProvidersSchema.safeParse(
        (body as { providers?: unknown })?.providers,
    )
    if (!parsed.success) {
        return Response.json(
            {
                error: `Invalid providers: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`,
            },
            { status: 400 },
        )
    }

    const stored = loadAdminProviders()
    const merged = mergeSecrets(parsed.data, stored)

    const envConfig = await loadEnvServerModelsConfig()
    const validationError = validateAdminProviders(merged, envConfig)
    if (validationError) {
        return Response.json({ error: validationError }, { status: 400 })
    }

    saveSettings(deriveEnvUpdates(merged, stored))

    return Response.json(await payload())
}
