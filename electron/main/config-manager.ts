import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { app, safeStorage } from "electron"

/**
 * Fields that contain sensitive data and should be encrypted
 */
const SENSITIVE_FIELDS = ["AI_API_KEY"] as const

/**
 * Prefix to identify encrypted values
 */
const ENCRYPTED_PREFIX = "encrypted:"

/**
 * Check if safeStorage encryption is available
 */
function isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
}

/**
 * Track if we've already warned about plaintext storage
 */
let hasWarnedAboutPlaintext = false

/**
 * Encrypt a sensitive value using safeStorage
 * Warns if encryption is not available (API key stored in plaintext)
 */
function encryptValue(value: string): string {
    if (!value) {
        return value
    }

    if (!isEncryptionAvailable()) {
        if (!hasWarnedAboutPlaintext) {
            console.warn(
                "⚠️ SECURITY WARNING: safeStorage not available. " +
                    "API keys will be stored in PLAINTEXT. " +
                    "On Linux, install gnome-keyring or similar for secure storage.",
            )
            hasWarnedAboutPlaintext = true
        }
        return value
    }

    try {
        const encrypted = safeStorage.encryptString(value)
        return ENCRYPTED_PREFIX + encrypted.toString("base64")
    } catch (error) {
        console.error("Encryption failed:", error)
        // Fail secure: don't store if encryption fails
        throw new Error(
            "Failed to encrypt API key. Cannot securely store credentials.",
        )
    }
}

/**
 * Decrypt a sensitive value using safeStorage
 * Returns the original value if it's not encrypted or decryption fails
 */
function decryptValue(value: string): string {
    if (!value || !value.startsWith(ENCRYPTED_PREFIX)) {
        return value
    }
    if (!isEncryptionAvailable()) {
        console.warn(
            "Cannot decrypt value: safeStorage encryption is not available",
        )
        return value
    }
    try {
        const base64Data = value.slice(ENCRYPTED_PREFIX.length)
        const buffer = Buffer.from(base64Data, "base64")
        return safeStorage.decryptString(buffer)
    } catch (error) {
        console.error("Failed to decrypt value:", error)
        return value
    }
}

/**
 * Encrypt sensitive fields in a config object
 */
function encryptConfig(
    config: Record<string, string | undefined>,
): Record<string, string | undefined> {
    const encrypted = { ...config }
    for (const field of SENSITIVE_FIELDS) {
        if (encrypted[field]) {
            encrypted[field] = encryptValue(encrypted[field] as string)
        }
    }
    return encrypted
}

/**
 * Decrypt sensitive fields in a config object
 */
function decryptConfig(
    config: Record<string, string | undefined>,
): Record<string, string | undefined> {
    const decrypted = { ...config }
    for (const field of SENSITIVE_FIELDS) {
        if (decrypted[field]) {
            decrypted[field] = decryptValue(decrypted[field] as string)
        }
    }
    return decrypted
}

/**
 * Configuration preset interface
 */
export interface ConfigPreset {
    id: string
    name: string
    createdAt: number
    updatedAt: number
    config: {
        AI_PROVIDER?: string
        AI_MODEL?: string
        AI_API_KEY?: string
        AI_BASE_URL?: string
        TEMPERATURE?: string
        [key: string]: string | undefined
    }
}

/**
 * Configuration file structure
 */
interface ConfigPresetsFile {
    version: 1
    currentPresetId: string | null
    presets: ConfigPreset[]
    userLocale?: "en" | "zh" | "ja" | "zh-Hant"
}

const CONFIG_FILE_NAME = "config-presets.json"

/**
 * Get the path to the config file
 */
function getConfigFilePath(): string {
    const userDataPath = app.getPath("userData")
    return path.join(userDataPath, CONFIG_FILE_NAME)
}

/**
 * Load presets from the config file
 * Decrypts sensitive fields automatically
 */
export function loadPresets(): ConfigPresetsFile {
    const configPath = getConfigFilePath()

    if (!existsSync(configPath)) {
        return {
            version: 1,
            currentPresetId: null,
            presets: [],
            userLocale: undefined,
        }
    }

    try {
        const content = readFileSync(configPath, "utf-8")
        const data = JSON.parse(content) as ConfigPresetsFile

        // Decrypt sensitive fields in each preset
        data.presets = data.presets.map((preset) => ({
            ...preset,
            config: decryptConfig(preset.config) as ConfigPreset["config"],
        }))

        return data
    } catch (error) {
        console.error("Failed to load config presets:", error)
        return {
            version: 1,
            currentPresetId: null,
            presets: [],
            userLocale: undefined,
        }
    }
}

/**
 * Save presets to the config file
 * Encrypts sensitive fields automatically
 */
export function savePresets(data: ConfigPresetsFile): void {
    const configPath = getConfigFilePath()
    const userDataPath = app.getPath("userData")

    // Ensure the directory exists
    if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true })
    }

    // Encrypt sensitive fields before saving
    const dataToSave: ConfigPresetsFile = {
        ...data,
        presets: data.presets.map((preset) => ({
            ...preset,
            config: encryptConfig(preset.config) as ConfigPreset["config"],
        })),
    }

    try {
        writeFileSync(configPath, JSON.stringify(dataToSave, null, 2), "utf-8")
    } catch (error) {
        console.error("Failed to save config presets:", error)
        throw error
    }
}

/**
 * Get all presets
 */
export function getAllPresets(): ConfigPreset[] {
    const data = loadPresets()
    return data.presets
}

/**
 * Get current preset ID
 */
export function getCurrentPresetId(): string | null {
    const data = loadPresets()
    return data.currentPresetId
}

/**
 * Get current preset
 */
export function getCurrentPreset(): ConfigPreset | null {
    const data = loadPresets()
    if (!data.currentPresetId) {
        return null
    }
    return data.presets.find((p) => p.id === data.currentPresetId) || null
}

/**
 * Create a new preset
 */
export function createPreset(
    preset: Omit<ConfigPreset, "id" | "createdAt" | "updatedAt">,
): ConfigPreset {
    const data = loadPresets()
    const now = Date.now()

    const newPreset: ConfigPreset = {
        id: randomUUID(),
        name: preset.name,
        config: preset.config,
        createdAt: now,
        updatedAt: now,
    }

    data.presets.push(newPreset)
    savePresets(data)

    return newPreset
}

/**
 * Update an existing preset
 */
export function updatePreset(
    id: string,
    updates: Partial<Omit<ConfigPreset, "id" | "createdAt">>,
): ConfigPreset | null {
    const data = loadPresets()
    const index = data.presets.findIndex((p) => p.id === id)

    if (index === -1) {
        return null
    }

    const updatedPreset: ConfigPreset = {
        ...data.presets[index],
        ...updates,
        updatedAt: Date.now(),
    }

    data.presets[index] = updatedPreset
    savePresets(data)

    return updatedPreset
}

/**
 * Delete a preset
 */
export function deletePreset(id: string): boolean {
    const data = loadPresets()
    const index = data.presets.findIndex((p) => p.id === id)

    if (index === -1) {
        return false
    }

    data.presets.splice(index, 1)

    // Clear current preset if it was deleted
    if (data.currentPresetId === id) {
        data.currentPresetId = null
    }

    savePresets(data)
    return true
}

/**
 * Set the current preset
 */
export function setCurrentPreset(id: string | null): boolean {
    const data = loadPresets()

    if (id !== null) {
        const preset = data.presets.find((p) => p.id === id)
        if (!preset) {
            return false
        }
    }

    data.currentPresetId = id
    savePresets(data)
    return true
}

/**
 * Map generic AI_API_KEY and AI_BASE_URL to provider-specific environment variables
 */
const PROVIDER_ENV_MAP: Record<string, { apiKey: string; baseUrl: string }> = {
    openai: { apiKey: "OPENAI_API_KEY", baseUrl: "OPENAI_BASE_URL" },
    anthropic: { apiKey: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL" },
    google: {
        apiKey: "GOOGLE_GENERATIVE_AI_API_KEY",
        baseUrl: "GOOGLE_BASE_URL",
    },
    azure: { apiKey: "AZURE_API_KEY", baseUrl: "AZURE_BASE_URL" },
    openrouter: {
        apiKey: "OPENROUTER_API_KEY",
        baseUrl: "OPENROUTER_BASE_URL",
    },
    deepseek: { apiKey: "DEEPSEEK_API_KEY", baseUrl: "DEEPSEEK_BASE_URL" },
    siliconflow: {
        apiKey: "SILICONFLOW_API_KEY",
        baseUrl: "SILICONFLOW_BASE_URL",
    },
    modelscope: {
        apiKey: "MODELSCOPE_API_KEY",
        baseUrl: "MODELSCOPE_BASE_URL",
    },
    gateway: { apiKey: "AI_GATEWAY_API_KEY", baseUrl: "AI_GATEWAY_BASE_URL" },
    // bedrock and ollama don't use API keys in the same way
    bedrock: { apiKey: "", baseUrl: "" },
    ollama: { apiKey: "", baseUrl: "OLLAMA_BASE_URL" },
}

/**
 * Apply preset environment variables to the current process
 * Returns the environment variables that were applied
 */
export function applyPresetToEnv(id: string): Record<string, string> | null {
    const data = loadPresets()
    const preset = data.presets.find((p) => p.id === id)

    if (!preset) {
        return null
    }

    const appliedEnv: Record<string, string> = {}
    const provider = preset.config.AI_PROVIDER?.toLowerCase()

    for (const [key, value] of Object.entries(preset.config)) {
        if (value !== undefined && value !== "") {
            // Map generic AI_API_KEY to provider-specific key
            if (
                key === "AI_API_KEY" &&
                provider &&
                PROVIDER_ENV_MAP[provider]
            ) {
                const providerApiKey = PROVIDER_ENV_MAP[provider].apiKey
                if (providerApiKey) {
                    process.env[providerApiKey] = value
                    appliedEnv[providerApiKey] = value
                }
            }
            // Map generic AI_BASE_URL to provider-specific key
            else if (
                key === "AI_BASE_URL" &&
                provider &&
                PROVIDER_ENV_MAP[provider]
            ) {
                const providerBaseUrl = PROVIDER_ENV_MAP[provider].baseUrl
                if (providerBaseUrl) {
                    process.env[providerBaseUrl] = value
                    appliedEnv[providerBaseUrl] = value
                }
            }
            // Apply other env vars directly
            else {
                process.env[key] = value
                appliedEnv[key] = value
            }
        }
    }

    // Set as current preset
    data.currentPresetId = id
    savePresets(data)

    return appliedEnv
}

/**
 * Get environment variables from current preset
 * Maps generic AI_API_KEY/AI_BASE_URL to provider-specific keys
 */
export function getCurrentPresetEnv(): Record<string, string> {
    const preset = getCurrentPreset()
    if (!preset) {
        return {}
    }

    const env: Record<string, string> = {}
    const provider = preset.config.AI_PROVIDER?.toLowerCase()

    for (const [key, value] of Object.entries(preset.config)) {
        if (value !== undefined && value !== "") {
            // Map generic AI_API_KEY to provider-specific key
            if (
                key === "AI_API_KEY" &&
                provider &&
                PROVIDER_ENV_MAP[provider]
            ) {
                const providerApiKey = PROVIDER_ENV_MAP[provider].apiKey
                if (providerApiKey) {
                    env[providerApiKey] = value
                }
            }
            // Map generic AI_BASE_URL to provider-specific key
            else if (
                key === "AI_BASE_URL" &&
                provider &&
                PROVIDER_ENV_MAP[provider]
            ) {
                const providerBaseUrl = PROVIDER_ENV_MAP[provider].baseUrl
                if (providerBaseUrl) {
                    env[providerBaseUrl] = value
                }
            }
            // Apply other env vars directly
            else {
                env[key] = value
            }
        }
    }
    return env
}

/**
 * Get user's preferred locale from config
 * Returns undefined if not set
 */
export function getUserLocale(): "en" | "zh" | "ja" | "zh-Hant" | undefined {
    const data = loadPresets()
    return data.userLocale
}

/**
 * Set user's preferred locale in config
 */
export function setUserLocale(
    locale: "en" | "zh" | "ja" | "zh-Hant" | null,
): void {
    const data = loadPresets()
    data.userLocale = locale === null ? undefined : locale
    savePresets(data)
}
