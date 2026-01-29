"use client"

import { useCallback, useEffect, useState } from "react"
import { getApiEndpoint } from "@/lib/base-path"
import type { FlattenedServerModel } from "@/lib/server-model-config"
import { STORAGE_KEYS } from "@/lib/storage"
import {
    createEmptyConfig,
    createModelConfig,
    createProviderConfig,
    type FlattenedModel,
    findModelById,
    flattenModels,
    type ModelConfig,
    type MultiModelConfig,
    type ProviderConfig,
    type ProviderName,
} from "@/lib/types/model-config"

// Old storage keys for migration
const OLD_KEYS = {
    aiProvider: "next-ai-draw-io-ai-provider",
    aiBaseUrl: "next-ai-draw-io-ai-base-url",
    aiApiKey: "next-ai-draw-io-ai-api-key",
    aiModel: "next-ai-draw-io-ai-model",
}

/**
 * Migrate from old single-provider format to new multi-model format
 */
function migrateOldConfig(): MultiModelConfig | null {
    if (typeof window === "undefined") return null

    const oldProvider = localStorage.getItem(OLD_KEYS.aiProvider)
    const oldApiKey = localStorage.getItem(OLD_KEYS.aiApiKey)
    const oldModel = localStorage.getItem(OLD_KEYS.aiModel)

    // No old config to migrate
    if (!oldProvider || !oldApiKey || !oldModel) return null

    const oldBaseUrl = localStorage.getItem(OLD_KEYS.aiBaseUrl)

    // Create new config from old format
    const provider = createProviderConfig(oldProvider as ProviderName)
    provider.apiKey = oldApiKey
    if (oldBaseUrl) provider.baseUrl = oldBaseUrl

    const model = createModelConfig(oldModel)
    provider.models.push(model)

    const config: MultiModelConfig = {
        version: 1,
        providers: [provider],
        selectedModelId: model.id,
    }

    // Clear old keys after migration
    localStorage.removeItem(OLD_KEYS.aiProvider)
    localStorage.removeItem(OLD_KEYS.aiBaseUrl)
    localStorage.removeItem(OLD_KEYS.aiApiKey)
    localStorage.removeItem(OLD_KEYS.aiModel)

    return config
}

/**
 * Load config from localStorage
 */
function loadConfig(): MultiModelConfig {
    if (typeof window === "undefined") return createEmptyConfig()

    // First, check if new format exists
    const stored = localStorage.getItem(STORAGE_KEYS.modelConfigs)
    if (stored) {
        try {
            return JSON.parse(stored) as MultiModelConfig
        } catch {
            console.error("Failed to parse model config")
        }
    }

    // Try migration from old format
    const migrated = migrateOldConfig()
    if (migrated) {
        // Save migrated config
        localStorage.setItem(
            STORAGE_KEYS.modelConfigs,
            JSON.stringify(migrated),
        )
        return migrated
    }

    return createEmptyConfig()
}

/**
 * Save config to localStorage
 */
function saveConfig(config: MultiModelConfig): void {
    if (typeof window === "undefined") return
    localStorage.setItem(STORAGE_KEYS.modelConfigs, JSON.stringify(config))
}

export interface UseModelConfigReturn {
    // State
    config: MultiModelConfig
    isLoaded: boolean

    // Getters
    models: FlattenedModel[]
    selectedModel: FlattenedModel | undefined
    selectedModelId: string | undefined
    showUnvalidatedModels: boolean

    // Actions
    setSelectedModelId: (modelId: string | undefined) => void
    setShowUnvalidatedModels: (show: boolean) => void
    addProvider: (provider: ProviderName) => ProviderConfig
    updateProvider: (
        providerId: string,
        updates: Partial<ProviderConfig>,
    ) => void
    deleteProvider: (providerId: string) => void
    addModel: (providerId: string, modelId: string) => ModelConfig
    updateModel: (
        providerId: string,
        modelConfigId: string,
        updates: Partial<ModelConfig>,
    ) => void
    deleteModel: (providerId: string, modelConfigId: string) => void
    resetConfig: () => void
}

export function useModelConfig(): UseModelConfigReturn {
    const [config, setConfig] = useState<MultiModelConfig>(createEmptyConfig)
    const [isLoaded, setIsLoaded] = useState(false)
    const [serverModels, setServerModels] = useState<FlattenedServerModel[]>([])
    const [serverLoaded, setServerLoaded] = useState(false)

    // Load client config on mount
    useEffect(() => {
        const loaded = loadConfig()
        setConfig(loaded)
        setIsLoaded(true)
    }, [])

    // Load server models on mount (if any)
    useEffect(() => {
        if (typeof window === "undefined") return

        fetch(getApiEndpoint("/api/server-models"))
            .then((res) => {
                if (!res.ok) {
                    console.error(
                        "Failed to load server models:",
                        res.status,
                        res.statusText,
                    )
                    throw new Error(`Request failed with status ${res.status}`)
                }
                return res.json()
            })
            .then((data) => {
                const raw: FlattenedServerModel[] = data?.models || []
                setServerModels(raw)
                setServerLoaded(true)

                // Auto-select default server model if no model is currently selected
                setConfig((prev) => {
                    if (!prev.selectedModelId && raw.length > 0) {
                        const defaultModel = raw.find((m) => m.isDefault)
                        if (defaultModel) {
                            return { ...prev, selectedModelId: defaultModel.id }
                        }
                        // If no default marked, use first server model
                        return { ...prev, selectedModelId: raw[0].id }
                    }
                    return prev
                })
            })
            .catch((error) => {
                console.error("Error while loading server models:", error)
                setServerLoaded(true)
            })
    }, [])

    // Save config whenever it changes (after initial load)
    useEffect(() => {
        if (isLoaded) {
            saveConfig(config)
        }
    }, [config, isLoaded])

    // Derived state
    const userModels = flattenModels(config)

    const models: FlattenedModel[] = [
        // Server models (read-only, credentials from env)
        ...serverModels.map((m) => ({
            id: m.id,
            modelId: m.modelId,
            provider: m.provider,
            providerLabel: `Server · ${m.providerLabel}`,
            apiKey: "",
            baseUrl: undefined,
            awsAccessKeyId: undefined,
            awsSecretAccessKey: undefined,
            awsRegion: undefined,
            awsSessionToken: undefined,
            validated: true,
            source: "server" as const,
            isDefault: m.isDefault,
            apiKeyEnv: m.apiKeyEnv,
            baseUrlEnv: m.baseUrlEnv,
        })),
        // User models from local configuration
        ...userModels,
    ]

    const selectedModel = config.selectedModelId
        ? models.find((m) => m.id === config.selectedModelId)
        : undefined

    // Actions
    const setSelectedModelId = useCallback((modelId: string | undefined) => {
        setConfig((prev) => ({
            ...prev,
            selectedModelId: modelId,
        }))
    }, [])

    const setShowUnvalidatedModels = useCallback((show: boolean) => {
        setConfig((prev) => ({
            ...prev,
            showUnvalidatedModels: show,
        }))
    }, [])

    const addProvider = useCallback(
        (provider: ProviderName): ProviderConfig => {
            const newProvider = createProviderConfig(provider)
            setConfig((prev) => ({
                ...prev,
                providers: [...prev.providers, newProvider],
            }))
            return newProvider
        },
        [],
    )

    const updateProvider = useCallback(
        (providerId: string, updates: Partial<ProviderConfig>) => {
            setConfig((prev) => ({
                ...prev,
                providers: prev.providers.map((p) =>
                    p.id === providerId ? { ...p, ...updates } : p,
                ),
            }))
        },
        [],
    )

    const deleteProvider = useCallback((providerId: string) => {
        setConfig((prev) => {
            const provider = prev.providers.find((p) => p.id === providerId)
            const modelIds = provider?.models.map((m) => m.id) || []

            // Clear selected model if it belongs to deleted provider
            const newSelectedId =
                prev.selectedModelId && modelIds.includes(prev.selectedModelId)
                    ? undefined
                    : prev.selectedModelId

            return {
                ...prev,
                providers: prev.providers.filter((p) => p.id !== providerId),
                selectedModelId: newSelectedId,
            }
        })
    }, [])

    const addModel = useCallback(
        (providerId: string, modelId: string): ModelConfig => {
            const newModel = createModelConfig(modelId)
            setConfig((prev) => ({
                ...prev,
                providers: prev.providers.map((p) =>
                    p.id === providerId
                        ? { ...p, models: [...p.models, newModel] }
                        : p,
                ),
            }))
            return newModel
        },
        [],
    )

    const updateModel = useCallback(
        (
            providerId: string,
            modelConfigId: string,
            updates: Partial<ModelConfig>,
        ) => {
            setConfig((prev) => ({
                ...prev,
                providers: prev.providers.map((p) =>
                    p.id === providerId
                        ? {
                              ...p,
                              models: p.models.map((m) =>
                                  m.id === modelConfigId
                                      ? { ...m, ...updates }
                                      : m,
                              ),
                          }
                        : p,
                ),
            }))
        },
        [],
    )

    const deleteModel = useCallback(
        (providerId: string, modelConfigId: string) => {
            setConfig((prev) => ({
                ...prev,
                providers: prev.providers.map((p) =>
                    p.id === providerId
                        ? {
                              ...p,
                              models: p.models.filter(
                                  (m) => m.id !== modelConfigId,
                              ),
                          }
                        : p,
                ),
                // Clear selected model if it was deleted
                selectedModelId:
                    prev.selectedModelId === modelConfigId
                        ? undefined
                        : prev.selectedModelId,
            }))
        },
        [],
    )

    const resetConfig = useCallback(() => {
        setConfig(createEmptyConfig())
    }, [])

    return {
        config,
        isLoaded: isLoaded && serverLoaded,
        models,
        selectedModel,
        selectedModelId: config.selectedModelId,
        showUnvalidatedModels: config.showUnvalidatedModels ?? false,
        setSelectedModelId,
        setShowUnvalidatedModels,
        addProvider,
        updateProvider,
        deleteProvider,
        addModel,
        updateModel,
        deleteModel,
        resetConfig,
    }
}

/**
 * Get the AI config for the currently selected model.
 * Returns format compatible with existing getAIConfig() usage.
 */
export function getSelectedAIConfig(): {
    accessCode: string
    aiProvider: string
    aiBaseUrl: string
    aiApiKey: string
    aiModel: string
    // AWS Bedrock credentials
    awsAccessKeyId: string
    awsSecretAccessKey: string
    awsRegion: string
    awsSessionToken: string
    // Selected model ID (for server model lookup)
    selectedModelId: string
    // Vertex AI credentials (Express Mode)
    vertexApiKey: string
} {
    const empty = {
        accessCode: "",
        aiProvider: "",
        aiBaseUrl: "",
        aiApiKey: "",
        aiModel: "",
        awsAccessKeyId: "",
        awsSecretAccessKey: "",
        awsRegion: "",
        awsSessionToken: "",
        selectedModelId: "",
        vertexApiKey: "",
    }

    if (typeof window === "undefined") return empty

    // Get access code (separate from model config)
    const accessCode = localStorage.getItem(STORAGE_KEYS.accessCode) || ""

    // Load multi-model config
    const stored = localStorage.getItem(STORAGE_KEYS.modelConfigs)
    if (!stored) {
        // Fallback to old format for backward compatibility
        return {
            accessCode,
            aiProvider: localStorage.getItem(OLD_KEYS.aiProvider) || "",
            aiBaseUrl: localStorage.getItem(OLD_KEYS.aiBaseUrl) || "",
            aiApiKey: localStorage.getItem(OLD_KEYS.aiApiKey) || "",
            aiModel: localStorage.getItem(OLD_KEYS.aiModel) || "",
            // Old format didn't support AWS
            awsAccessKeyId: "",
            awsSecretAccessKey: "",
            awsRegion: "",
            awsSessionToken: "",
            selectedModelId: "",
            vertexApiKey: "",
        }
    }

    let config: MultiModelConfig
    try {
        config = JSON.parse(stored)
    } catch {
        return { ...empty, accessCode }
    }

    // No selected model = use server default (AI_PROVIDER/AI_MODEL/env auto-detect)
    if (!config.selectedModelId) {
        return { ...empty, accessCode }
    }

    // Server-side model selection (id = "server:<name-slug>:<modelId>")
    // Provider is resolved server-side via findServerModelById()
    if (config.selectedModelId.startsWith("server:")) {
        const parts = config.selectedModelId.split(":")
        const nameSlug = parts[1] || ""
        const modelId = parts.slice(2).join(":") // Preserve Bedrock-style IDs

        return {
            ...empty,
            accessCode,
            // Note: nameSlug is NOT the provider, but we send it for backwards compat
            // Server uses selectedModelId to lookup the actual provider
            aiProvider: nameSlug,
            aiBaseUrl: "",
            aiApiKey: "",
            aiModel: modelId,
            selectedModelId: config.selectedModelId,
        }
    }

    // Find selected user-defined model
    const model = findModelById(config, config.selectedModelId)
    if (!model) {
        return { ...empty, accessCode }
    }

    return {
        accessCode,
        aiProvider: model.provider,
        aiBaseUrl: model.baseUrl || "",
        aiApiKey: model.apiKey,
        aiModel: model.modelId,
        // AWS Bedrock credentials
        awsAccessKeyId: model.awsAccessKeyId || "",
        awsSecretAccessKey: model.awsSecretAccessKey || "",
        awsRegion: model.awsRegion || "",
        awsSessionToken: model.awsSessionToken || "",
        selectedModelId: config.selectedModelId || "",
        // Vertex AI credentials (Express Mode)
        vertexApiKey: model.vertexApiKey || "",
    }
}
