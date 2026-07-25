import { getApiEndpoint } from "@/lib/base-path"
import type { ProviderName } from "@/lib/types/model-config"

export const SESSION_PASSWORD_KEY = "next-ai-draw-io-admin-password"

// ── Shared types ─────────────────────────────────────────────────────

export type SecretValue = { isSet: true; hint: string }

export function isSecretValue(v: unknown): v is SecretValue {
    return typeof v === "object" && v !== null && "isSet" in v
}

export interface SettingState {
    key: string
    source: "file" | "env" | "default"
    value: string | SecretValue | null
}

export type SettingsMap = Record<string, SettingState>

// Editable text of a saved setting; secrets have none (write-only)
export function savedTextOf(state: SettingState | undefined): string {
    return state && !isSecretValue(state.value) ? (state.value ?? "") : ""
}

// Admin provider in client state. Secret fields hold either a masked
// marker (unchanged) or a plaintext string (new value).
export interface AdminProvider {
    id: string
    provider: ProviderName
    name?: string
    apiKey?: string | SecretValue
    baseUrl?: string
    awsAccessKeyId?: string | SecretValue
    awsSecretAccessKey?: string | SecretValue
    awsRegion?: string
    vertexApiKey?: string | SecretValue
    models: string[]
    isDefault?: boolean
}

// Provider defined in AI_MODELS_CONFIG / ai-models.json — shown read-only
export interface EnvProvider {
    name: string
    provider: ProviderName
    models: string[]
    isDefault: boolean
}

export async function adminFetch(path: string, pw: string, init?: RequestInit) {
    const res = await fetch(getApiEndpoint(path), {
        ...init,
        headers: {
            ...init?.headers,
            "x-admin-password": pw,
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`)
    }
    return data
}
