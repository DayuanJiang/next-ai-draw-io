import { checkAdminAuth, maskSecret } from "@/lib/admin/auth"
import {
    getEnvFallback,
    getValueSource,
    isSettingsWritable,
    loadSettings,
    saveSettings,
} from "@/lib/admin/settings"
import {
    SETTINGS_BY_KEY,
    SETTINGS_REGISTRY,
    type SettingDef,
} from "@/lib/admin/settings-registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function serializeSettings() {
    const fileValues = loadSettings()
    return SETTINGS_REGISTRY.map((def) => {
        const source = getValueSource(def.key)
        const raw =
            source === "file"
                ? fileValues[def.key]
                : (getEnvFallback(def.key) ?? null)
        const value = def.type === "secret" && raw ? maskSecret(raw) : raw
        return { key: def.key, source, value }
    })
}

export async function GET(req: Request) {
    const authError = checkAdminAuth(req)
    if (authError) return authError

    return Response.json({
        writable: isSettingsWritable(),
        settings: serializeSettings(),
    })
}

function validateValue(def: SettingDef, value: string): string | null {
    switch (def.type) {
        case "number": {
            const num = Number(value)
            if (!Number.isFinite(num)) return "Must be a number"
            if (def.min !== undefined && num < def.min)
                return `Must be at least ${def.min}`
            if (def.max !== undefined && num > def.max)
                return `Must be at most ${def.max}`
            return null
        }
        case "boolean":
            return value === "true" || value === "false"
                ? null
                : 'Must be "true" or "false"'
        case "enum":
            return def.options?.includes(value)
                ? null
                : `Must be one of: ${def.options?.join(", ")}`
        default:
            return null
    }
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

    let body: { values?: Record<string, unknown> }
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    if (!body.values || typeof body.values !== "object") {
        return Response.json(
            { error: "Body must contain a values object" },
            { status: 400 },
        )
    }

    const updates: Record<string, string | null> = {}
    const errors: Record<string, string> = {}

    for (const [key, value] of Object.entries(body.values)) {
        const def = SETTINGS_BY_KEY.get(key)
        if (!def) {
            errors[key] = "Unknown setting"
            continue
        }
        if (value === null || value === "") {
            updates[key] = null
            continue
        }
        if (typeof value !== "string") {
            errors[key] = "Value must be a string"
            continue
        }
        const error = validateValue(def, value)
        if (error) {
            errors[key] = error
            continue
        }
        updates[key] = value
    }

    if (Object.keys(errors).length > 0) {
        return Response.json({ errors }, { status: 400 })
    }

    saveSettings(updates)

    return Response.json({
        writable: true,
        settings: serializeSettings(),
    })
}
