"use client"

import { useCallback, useEffect, useState } from "react"
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
    PROVIDER_INFO,
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

    // Actions
    setSelectedModelId: (modelId: string | undefined) => void
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

    // Load config on mount
    useEffect(() => {
        const loaded = loadConfig()
        setConfig(loaded)
        setIsLoaded(true)
    }, [])

    // Save config whenever it changes (after initial load)
    useEffect(() => {
        if (isLoaded) {
            saveConfig(config)
        }
    }, [config, isLoaded])

    // Derived state
    const models = flattenModels(config)
    const selectedModel = config.selectedModelId
        ? findModelById(config, config.selectedModelId)
        : undefined

    // Actions
    const setSelectedModelId = useCallback((modelId: string | undefined) => {
        setConfig((prev) => ({
            ...prev,
            selectedModelId: modelId,
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
        isLoaded,
        models,
        selectedModel,
        selectedModelId: config.selectedModelId,
        setSelectedModelId,
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
        }
    }

    let config: MultiModelConfig
    try {
        config = JSON.parse(stored)
    } catch {
        return { ...empty, accessCode }
    }

    // No selected model = use server default
    if (!config.selectedModelId) {
        return { ...empty, accessCode }
    }

    // Find selected model
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
    }
}
