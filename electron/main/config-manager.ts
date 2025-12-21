import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { app } from "electron"

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
 */
export function loadPresets(): ConfigPresetsFile {
    const configPath = getConfigFilePath()

    if (!existsSync(configPath)) {
        return {
            version: 1,
            currentPresetId: null,
            presets: [],
        }
    }

    try {
        const content = readFileSync(configPath, "utf-8")
        const data = JSON.parse(content) as ConfigPresetsFile
        return data
    } catch (error) {
        console.error("Failed to load config presets:", error)
        return {
            version: 1,
            currentPresetId: null,
            presets: [],
        }
    }
}

/**
 * Save presets to the config file
 */
export function savePresets(data: ConfigPresetsFile): void {
    const configPath = getConfigFilePath()
    const userDataPath = app.getPath("userData")

    // Ensure the directory exists
    if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true })
    }

    try {
        writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8")
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
