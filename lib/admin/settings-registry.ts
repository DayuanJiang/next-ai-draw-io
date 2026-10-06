// Declarative registry of the general env vars editable in the admin panel.
// Drives both server-side validation (app/api/admin/settings) and UI
// rendering (app/[lang]/admin). Keys are exactly the env var names.
//
// AI providers and models are managed separately in the panel's Models
// section (lib/admin/providers.ts), not here.
//
// Not listed here (and therefore rejected by the API):
// - NEXT_PUBLIC_* vars: baked into the client bundle at build time
// - ADMIN_PASSWORD / SETTINGS_FILE: bootstrap values, env-only to avoid lockout
// - Per-provider reasoning/thinking tuning vars: env-only (see env.example)

export type SettingType = "string" | "secret" | "number" | "boolean" | "enum"

export interface SettingDef {
    key: string
    group: string
    type: SettingType
    label: string
    description?: string
    options?: string[]
    min?: number
    max?: number
    placeholder?: string
    // Built-in default applied at runtime when the value is unset, so the UI
    // can reflect actual behavior (e.g. ALLOW_PRIVATE_URLS defaults to "true").
    default?: string
    // Value is only picked up at process start (module-load readers)
    restartRequired?: boolean
}

export interface SettingGroup {
    id: string
    title: string
    description: string
    // Optional sections gated by an on/off switch in the panel; fields are
    // grayed out until enabled. Starts on when any field is already set.
    toggleable?: boolean
}

export const SETTING_GROUPS: SettingGroup[] = [
    {
        id: "generation",
        title: "Generation",
        description: "Output parameters applied to all chat requests.",
    },
    {
        id: "access",
        title: "Access Control",
        description: "Restrict who can use this deployment.",
    },
    {
        id: "features",
        title: "Features",
        description: "Optional features and security toggles.",
    },
    {
        id: "observability",
        title: "Observability",
        description: "Langfuse tracing for LLM calls.",
        toggleable: true,
    },
    {
        id: "quota",
        title: "Quota & Rate Limits",
        description:
            "Per-IP usage limits. Enforcement requires a DynamoDB table.",
        toggleable: true,
    },
]

export const SETTINGS_REGISTRY: SettingDef[] = [
    // ── Generation ───────────────────────────────────────────────────
    {
        key: "TEMPERATURE",
        group: "generation",
        type: "number",
        label: "Temperature",
        description:
            "Leave unset for reasoning models that reject temperature.",
        min: 0,
        max: 2,
    },
    {
        key: "MAX_OUTPUT_TOKENS",
        group: "generation",
        type: "number",
        label: "Max Output Tokens",
        min: 1,
    },

    // ── Access Control ───────────────────────────────────────────────
    {
        key: "ACCESS_CODE_LIST",
        group: "access",
        type: "string",
        label: "Access Codes",
        description:
            "Comma-separated list. Users must enter one to chat. Empty = open access.",
        placeholder: "code1,code2",
    },

    // ── Features ─────────────────────────────────────────────────────
    {
        key: "ENABLE_VLM_VALIDATION",
        group: "features",
        type: "boolean",
        label: "VLM Diagram Validation",
        description:
            "Visually validate generated diagrams with a vision model.",
    },
    {
        key: "VALIDATION_MODEL",
        group: "features",
        type: "string",
        label: "Validation Model",
        description: "Falls back to the default AI model when empty.",
    },
    {
        key: "VALIDATION_TIMEOUT",
        group: "features",
        type: "number",
        label: "Validation Timeout (ms)",
        min: 1000,
    },
    {
        key: "ENABLE_HISTORY_XML_REPLACE",
        group: "features",
        type: "boolean",
        label: "History XML Compression",
        description: "Replace old diagram XML in history with placeholders.",
    },
    {
        key: "ALLOW_PRIVATE_URLS",
        group: "features",
        type: "boolean",
        label: "Allow Private URLs",
        description:
            "Turn off to block requests to private IPs and internal hostnames (SSRF protection).",
        // Unset means allowed at runtime (ssrf-protection: !== "false")
        default: "true",
    },

    // ── Observability ────────────────────────────────────────────────
    {
        key: "LANGFUSE_PUBLIC_KEY",
        group: "observability",
        type: "string",
        label: "Langfuse Public Key",
        placeholder: "pk-lf-…",
        restartRequired: true,
    },
    {
        key: "LANGFUSE_SECRET_KEY",
        group: "observability",
        type: "secret",
        label: "Langfuse Secret Key",
        restartRequired: true,
    },
    {
        key: "LANGFUSE_BASEURL",
        group: "observability",
        type: "string",
        label: "Langfuse Base URL",
        placeholder: "https://cloud.langfuse.com",
        restartRequired: true,
    },

    // ── Quota ────────────────────────────────────────────────────────
    {
        key: "DAILY_REQUEST_LIMIT",
        group: "quota",
        type: "number",
        label: "Daily Request Limit",
        description: "Per IP per day.",
        min: 1,
    },
    {
        key: "DAILY_TOKEN_LIMIT",
        group: "quota",
        type: "number",
        label: "Daily Token Limit",
        description: "Per IP per day.",
        min: 1,
    },
    {
        key: "TPM_LIMIT",
        group: "quota",
        type: "number",
        label: "Tokens Per Minute",
        min: 1,
    },
    {
        key: "DYNAMODB_QUOTA_TABLE",
        group: "quota",
        type: "string",
        label: "DynamoDB Table",
        description: "Quota enforcement is disabled when empty.",
        restartRequired: true,
    },
    {
        key: "DYNAMODB_REGION",
        group: "quota",
        type: "string",
        label: "DynamoDB Region",
        placeholder: "ap-northeast-1",
        restartRequired: true,
    },
    {
        key: "QUOTA_TIMEZONE",
        group: "quota",
        type: "string",
        label: "Quota Timezone",
        description: "Timezone for the daily reset boundary.",
        placeholder: "UTC",
        restartRequired: true,
    },
]

export const SETTINGS_BY_KEY: Map<string, SettingDef> = new Map(
    SETTINGS_REGISTRY.map((def) => [def.key, def]),
)

export const SETTINGS_BY_GROUP: Map<string, SettingDef[]> = new Map(
    SETTING_GROUPS.map((g) => [
        g.id,
        SETTINGS_REGISTRY.filter((d) => d.group === g.id),
    ]),
)
