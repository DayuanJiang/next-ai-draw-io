import { checkAdminAuth } from "@/lib/admin/auth"
import {
    AdminProvidersSchema,
    adminProvidersToConfig,
    deriveEnvUpdates,
    loadAdminProviders,
    maskAdminProviders,
    mergeSecrets,
    movedSecretError,
    validateAdminProviders,
} from "@/lib/admin/providers"
import {
    getEnvFallback,
    isSettingsWritable,
    saveSettings,
} from "@/lib/admin/settings"
import {
    loadEnvServerModelsConfig,
    loadRawServerModelsConfig,
} from "@/lib/server-model-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function payload() {
    const adminProviders = loadAdminProviders()
    // The environment's providers are shown read-only in the panel; their
    // credentials live in the environment. They are the ones the users'
    // model list holds before the panel's own: those of AI_MODELS_CONFIG /
    // ai-models.json, or a lone AI_MODEL that the list keeps next to the
    // panel's providers. A panel default has taken their default away.
    const listed = (await loadRawServerModelsConfig())?.providers ?? []
    const envProviders = listed.slice(
        0,
        listed.length - adminProvidersToConfig(adminProviders).providers.length,
    )
    const loneModel = !(await loadEnvServerModelsConfig())
    return {
        writable: isSettingsWritable(),
        providers: maskAdminProviders(adminProviders),
        envProviders: envProviders.map((p) => ({
            name: p.name,
            provider: p.provider,
            models: p.models,
            isDefault: !!p.default,
            // Not a config of its own: the panel may add this provider type
            loneModel,
        })),
        // Whether .env sets a default model. getEnvFallback skips the value
        // the panel overlays onto process.env, so a panel default doesn't count.
        envHasDefaultModel: !!getEnvFallback("AI_MODEL"),
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
    // A stored key is not kept under another base URL (see movedSecretError)
    for (const p of parsed.data) {
        const error = movedSecretError(
            p,
            stored.find((s) => s.id === p.id),
        )
        if (error) return Response.json({ error }, { status: 400 })
    }
    const merged = mergeSecrets(parsed.data, stored)

    const envConfig = await loadEnvServerModelsConfig()
    const validationError = validateAdminProviders(merged, envConfig)
    if (validationError) {
        return Response.json({ error: validationError }, { status: 400 })
    }

    saveSettings(deriveEnvUpdates(merged, stored))

    return Response.json(await payload())
}
