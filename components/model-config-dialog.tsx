"use client"

import {
    AlertCircle,
    Check,
    ChevronRight,
    Clock,
    Eye,
    EyeOff,
    Key,
    Loader2,
    Plus,
    Server,
    Settings2,
    Sparkles,
    Trash2,
    X,
    Zap,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
    ProviderCredentialsFields,
    type SecretField,
} from "@/components/provider-credentials-fields"
import { ProviderLogo } from "@/components/provider-logo"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useDictionary } from "@/hooks/use-dictionary"
import type { UseModelConfigReturn } from "@/hooks/use-model-config"
import { getApiEndpoint } from "@/lib/base-path"
import { formatMessage } from "@/lib/i18n/utils"
import type { ProviderConfig, ProviderName } from "@/lib/types/model-config"
import { PROVIDER_INFO, SUGGESTED_MODELS } from "@/lib/types/model-config"
import { cn } from "@/lib/utils"

interface ModelConfigDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    modelConfig: UseModelConfigReturn
}

type ValidationStatus = "idle" | "validating" | "success" | "error"

// Configuration section with title and optional action
function ConfigSection({
    title,
    icon: Icon,
    action,
    children,
}: {
    title: string
    icon: React.ComponentType<{ className?: string }>
    action?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {title}
                    </span>
                </div>
                {action}
            </div>
            {children}
        </div>
    )
}

// Card wrapper with subtle depth
function ConfigCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-border-subtle bg-surface-2/50 p-5 space-y-5">
            {children}
        </div>
    )
}

export function ModelConfigDialog({
    open,
    onOpenChange,
    modelConfig,
}: ModelConfigDialogProps) {
    const dict = useDictionary()
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
        null,
    )
    const [showApiKey, setShowApiKey] = useState(false)
    const [validationStatus, setValidationStatus] =
        useState<ValidationStatus>("idle")
    const [validationError, setValidationError] = useState<string>("")
    const [customModelInput, setCustomModelInput] = useState("")
    const scrollRef = useRef<HTMLDivElement>(null)
    const validationResetTimeoutRef = useRef<ReturnType<
        typeof setTimeout
    > | null>(null)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState("")
    const [validatingModelIndex, setValidatingModelIndex] = useState<
        number | null
    >(null)
    const [duplicateError, setDuplicateError] = useState<string>("")
    const [editError, setEditError] = useState<{
        modelId: string
        message: string
    } | null>(null)
    const [dynamicSuggestedModels, setDynamicSuggestedModels] = useState<
        Partial<Record<ProviderName, string[]>>
    >({})
    const [loadedSuggestedProviders, setLoadedSuggestedProviders] = useState<
        Partial<Record<ProviderName, boolean>>
    >({})
    const [loadingSuggestedProvider, setLoadingSuggestedProvider] =
        useState<ProviderName | null>(null)

    const {
        config,
        addProvider,
        updateProvider,
        deleteProvider,
        addModel,
        updateModel,
        deleteModel,
    } = modelConfig

    // Get selected provider
    const selectedProvider = config.providers.find(
        (p) => p.id === selectedProviderId,
    )

    // Cleanup validation reset timeout on unmount
    useEffect(() => {
        return () => {
            if (validationResetTimeoutRef.current) {
                clearTimeout(validationResetTimeoutRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (
            !open ||
            selectedProvider?.provider !== "aihubmix" ||
            loadedSuggestedProviders.aihubmix
        ) {
            return
        }

        let cancelled = false
        setLoadingSuggestedProvider("aihubmix")

        fetch(getApiEndpoint("/api/aihubmix-models"))
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load models: ${response.status}`)
                }
                return response.json()
            })
            .then((data: { models?: unknown }) => {
                if (cancelled || !Array.isArray(data.models)) {
                    return
                }

                const models = data.models.filter(
                    (model): model is string => typeof model === "string",
                )
                if (models.length > 0) {
                    setDynamicSuggestedModels((current) => ({
                        ...current,
                        aihubmix: models,
                    }))
                }
            })
            .catch((error) => {
                console.warn("Failed to load AIHubMix models:", error)
            })
            .finally(() => {
                if (cancelled) {
                    return
                }

                setLoadedSuggestedProviders((current) => ({
                    ...current,
                    aihubmix: true,
                }))
                setLoadingSuggestedProvider(null)
            })

        return () => {
            cancelled = true
        }
    }, [open, selectedProvider?.provider, loadedSuggestedProviders.aihubmix])

    // Get suggested models for current provider
    const suggestedModels = selectedProvider
        ? dynamicSuggestedModels[selectedProvider.provider] ||
          SUGGESTED_MODELS[selectedProvider.provider] ||
          []
        : []
    const isLoadingSuggestedModels =
        selectedProvider?.provider === loadingSuggestedProvider

    // Filter out already-added models from suggestions
    const existingModelIds =
        selectedProvider?.models.map((m) => m.modelId) || []
    const availableSuggestions = suggestedModels.filter(
        (modelId) => !existingModelIds.includes(modelId),
    )
    const emptyStateSuggestions = selectedProvider
        ? (SUGGESTED_MODELS[selectedProvider.provider] || [])
              .filter((modelId) => !existingModelIds.includes(modelId))
              .slice(0, 4)
        : []

    // Handle adding a new provider
    const handleAddProvider = (providerType: ProviderName) => {
        const newProvider = addProvider(providerType)
        setSelectedProviderId(newProvider.id)
        setValidationStatus("idle")
    }

    // Handle provider field updates
    const handleProviderUpdate = (
        field: keyof ProviderConfig,
        value: string | boolean,
    ) => {
        if (!selectedProviderId) return
        updateProvider(selectedProviderId, { [field]: value })
        // Reset validation when credentials change
        const credentialFields = [
            "apiKey",
            "baseUrl",
            "awsAccessKeyId",
            "awsSecretAccessKey",
            "awsRegion",
            "vertexApiKey",
        ]
        if (credentialFields.includes(field)) {
            setValidationStatus("idle")
            updateProvider(selectedProviderId, { validated: false })
        }
    }

    // Handle adding a model to current provider
    // Returns true if model was added successfully, false otherwise
    const handleAddModel = (modelId: string): boolean => {
        if (!selectedProviderId || !selectedProvider) return false
        // Prevent duplicate model IDs
        if (existingModelIds.includes(modelId)) {
            setDuplicateError(`Model "${modelId}" already exists`)
            return false
        }
        setDuplicateError("")
        addModel(selectedProviderId, modelId)
        return true
    }

    // Handle deleting a model
    const handleDeleteModel = (modelConfigId: string) => {
        if (!selectedProviderId) return
        deleteModel(selectedProviderId, modelConfigId)
    }

    // Handle deleting the provider
    const handleDeleteProvider = () => {
        if (!selectedProviderId) return
        deleteProvider(selectedProviderId)
        setSelectedProviderId(null)
        setValidationStatus("idle")
        setDeleteConfirmOpen(false)
    }

    // Validate all models
    const handleValidate = useCallback(async () => {
        if (!selectedProvider || !selectedProviderId) return

        // Check credentials based on provider type
        const isBedrock = selectedProvider.provider === "bedrock"
        const isEdgeOne = selectedProvider.provider === "edgeone"
        const isOllama = selectedProvider.provider === "ollama"
        const isVertexAI = selectedProvider.provider === "vertexai"
        if (isBedrock) {
            if (
                !selectedProvider.awsAccessKeyId ||
                !selectedProvider.awsSecretAccessKey ||
                !selectedProvider.awsRegion
            ) {
                return
            }
        } else if (isVertexAI) {
            // Vertex AI requires vertexApiKey for Express Mode
            if (!selectedProvider.vertexApiKey) {
                return
            }
        } else if (!isEdgeOne && !isOllama && !selectedProvider.apiKey) {
            return
        }

        // Need at least one model to validate
        if (selectedProvider.models.length === 0) {
            setValidationError("Add at least one model to validate")
            setValidationStatus("error")
            return
        }

        setValidationStatus("validating")
        setValidationError("")

        let allValid = true
        let errorCount = 0

        // Validate each model
        for (let i = 0; i < selectedProvider.models.length; i++) {
            const model = selectedProvider.models[i]
            setValidatingModelIndex(i)

            try {
                // For EdgeOne, construct baseUrl from current origin
                const baseUrl = isEdgeOne
                    ? `${window.location.origin}/api/edgeai`
                    : selectedProvider.baseUrl

                const response = await fetch("/api/validate-model", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        provider: selectedProvider.provider,
                        apiKey: selectedProvider.apiKey,
                        baseUrl,
                        modelId: model.modelId,
                        // AWS Bedrock credentials
                        awsAccessKeyId: selectedProvider.awsAccessKeyId,
                        awsSecretAccessKey: selectedProvider.awsSecretAccessKey,
                        awsRegion: selectedProvider.awsRegion,
                        // Vertex AI credentials (Express Mode)
                        vertexApiKey: selectedProvider.vertexApiKey,
                    }),
                })
                const data = await response.json()

                if (data.valid) {
                    updateModel(selectedProviderId, model.id, {
                        validated: true,
                        validationError: undefined,
                    })
                } else {
                    allValid = false
                    errorCount++
                    updateModel(selectedProviderId, model.id, {
                        validated: false,
                        validationError: data.error || "Validation failed",
                    })
                }
            } catch {
                allValid = false
                errorCount++
                updateModel(selectedProviderId, model.id, {
                    validated: false,
                    validationError: "Network error",
                })
            }
        }

        setValidatingModelIndex(null)

        if (allValid) {
            setValidationStatus("success")
            updateProvider(selectedProviderId, { validated: true })
            // Reset to idle after showing success briefly (with cleanup)
            if (validationResetTimeoutRef.current) {
                clearTimeout(validationResetTimeoutRef.current)
            }
            validationResetTimeoutRef.current = setTimeout(() => {
                setValidationStatus("idle")
                validationResetTimeoutRef.current = null
            }, 1500)
        } else {
            setValidationStatus("error")
            setValidationError(`${errorCount} model(s) failed validation`)
        }
    }, [selectedProvider, selectedProviderId, updateProvider, updateModel])

    // Get all available provider types
    const availableProviders = Object.keys(PROVIDER_INFO) as ProviderName[]

    // Get display name for provider
    const getProviderDisplayName = (provider: ProviderConfig) => {
        return provider.name || PROVIDER_INFO[provider.provider].label
    }

    // Inline Test button + error, shared across credential layouts. Disabled
    // until the relevant credentials are present.
    const renderTestButton = (canValidate: boolean) => (
        <div className="flex items-center gap-2">
            <Button
                variant={validationStatus === "success" ? "outline" : "default"}
                size="sm"
                onClick={handleValidate}
                disabled={!canValidate || validationStatus === "validating"}
                className={cn(
                    "h-9 px-4",
                    validationStatus === "success" &&
                        "text-success border-success/30 bg-success-muted hover:bg-success-muted",
                )}
            >
                {validationStatus === "validating" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : validationStatus === "success" ? (
                    <>
                        <Check className="h-4 w-4 mr-1.5 animate-check-pop" />
                        {dict.modelConfig.verified}
                    </>
                ) : (
                    dict.modelConfig.test
                )}
            </Button>
            {validationStatus === "error" && validationError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                    <X className="h-3 w-3" />
                    {validationError}
                </p>
            )}
        </div>
    )

    // Plaintext secret input with show/hide toggle (the user dialog stores
    // keys client-side, so values are shown directly — unlike the masked
    // admin panel). The primary key field carries the inline Test button.
    const renderProviderSecret = (field: SecretField, id: string) => {
        if (!selectedProvider) return null
        const value = (selectedProvider[field] as string | undefined) ?? ""
        // The "primary" credential sits beside the Test button; for Bedrock
        // the test lives below the region, so its inputs have no inline test.
        const isBedrock = selectedProvider.provider === "bedrock"
        const withInlineTest =
            !isBedrock && (field === "apiKey" || field === "vertexApiKey")
        const canValidate =
            field === "vertexApiKey"
                ? !!selectedProvider.vertexApiKey
                : selectedProvider.provider === "ollama" ||
                  !!selectedProvider.apiKey
        const input = (
            <div className="relative flex-1">
                <Input
                    id={id}
                    type={showApiKey ? "text" : "password"}
                    value={value}
                    onChange={(e) =>
                        handleProviderUpdate(field, e.target.value)
                    }
                    placeholder={
                        field === "awsSecretAccessKey"
                            ? dict.modelConfig.enterSecretKey
                            : field === "awsAccessKeyId"
                              ? "AKIA..."
                              : dict.modelConfig.enterApiKey
                    }
                    className="h-9 pr-10 font-mono text-xs"
                />
                <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={
                        showApiKey
                            ? dict.modelConfig.hideValue
                            : dict.modelConfig.showValue
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                >
                    {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                    ) : (
                        <Eye className="h-4 w-4" />
                    )}
                </button>
            </div>
        )
        if (!withInlineTest) return input
        return (
            <div className="space-y-2">
                <div className="flex gap-2">
                    {input}
                    {renderTestButton(canValidate)}
                </div>
            </div>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl h-[80vh] max-h-[800px] overflow-hidden flex flex-col gap-0 p-0">
                {/* Header */}
                <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
                    <DialogTitle className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-surface-2">
                            <Server className="h-5 w-5 text-primary" />
                        </div>
                        {dict.modelConfig?.title || "AI Model Configuration"}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                        {dict.modelConfig?.description ||
                            "Configure multiple AI providers and models for your workspace"}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 min-h-0 overflow-hidden border-t border-border-subtle">
                    {/* Provider List (Left Sidebar) */}
                    <div className="w-60 shrink-0 flex flex-col bg-surface-1/50 border-r border-border-subtle">
                        <div className="px-4 py-3">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {dict.modelConfig.providers}
                            </span>
                        </div>

                        <ScrollArea className="flex-1 px-2 min-h-0">
                            <div className="space-y-1 pb-2">
                                {config.providers.length === 0 ? (
                                    <div className="px-3 py-8 text-center">
                                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-surface-2 mb-3">
                                            <Plus className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {dict.modelConfig.addProviderHint}
                                        </p>
                                    </div>
                                ) : (
                                    config.providers.map((provider) => (
                                        <button
                                            key={provider.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedProviderId(
                                                    provider.id,
                                                )
                                                setValidationStatus("idle")
                                                setShowApiKey(false)
                                            }}
                                            className={cn(
                                                "group flex items-center gap-3 px-3 py-2.5 rounded-xl w-full",
                                                "text-left text-sm transition-all duration-150 border border-transparent",
                                                "hover:bg-interactive-hover",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                                selectedProviderId ===
                                                    provider.id &&
                                                    "bg-surface-0 shadow-sm border-border-subtle",
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                                    "bg-surface-2 transition-colors duration-150",
                                                    selectedProviderId ===
                                                        provider.id &&
                                                        "bg-primary/10",
                                                )}
                                            >
                                                <ProviderLogo
                                                    provider={provider.provider}
                                                    className="flex-shrink-0"
                                                />
                                            </div>
                                            <span className="flex-1 truncate font-medium">
                                                {getProviderDisplayName(
                                                    provider,
                                                )}
                                            </span>
                                            {provider.validated ? (
                                                <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-success-muted">
                                                    <Check className="h-3 w-3 text-success" />
                                                </div>
                                            ) : (
                                                <ChevronRight
                                                    className={cn(
                                                        "h-4 w-4 text-muted-foreground/50 transition-transform duration-150",
                                                        selectedProviderId ===
                                                            provider.id &&
                                                            "translate-x-0.5",
                                                    )}
                                                />
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </ScrollArea>

                        {/* Add Provider */}
                        <div className="p-3 border-t border-border-subtle">
                            <Select
                                onValueChange={(v) =>
                                    handleAddProvider(v as ProviderName)
                                }
                            >
                                <SelectTrigger className="w-full h-9 rounded-xl bg-surface-0 border-border-subtle hover:bg-interactive-hover">
                                    <Plus className="h-4 w-4 mr-2 text-muted-foreground" />
                                    <SelectValue
                                        placeholder={
                                            dict.modelConfig.addProvider
                                        }
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableProviders.map((p) => (
                                        <SelectItem
                                            key={p}
                                            value={p}
                                            className="cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2">
                                                <ProviderLogo provider={p} />
                                                <span>
                                                    {PROVIDER_INFO[p].label}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Provider Details (Right Panel) */}
                    <div className="flex-1 min-w-0 flex flex-col overflow-auto scrollbar-thin">
                        {selectedProvider ? (
                            <ScrollArea className="flex-1" ref={scrollRef}>
                                <div className="p-6 space-y-8">
                                    {/* Provider Header */}
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-2">
                                            <ProviderLogo
                                                provider={
                                                    selectedProvider.provider
                                                }
                                                className="h-6 w-6"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-lg tracking-tight">
                                                {
                                                    PROVIDER_INFO[
                                                        selectedProvider
                                                            .provider
                                                    ].label
                                                }
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {selectedProvider.models
                                                    .length === 0
                                                    ? dict.modelConfig
                                                          .noModelsConfigured
                                                    : formatMessage(
                                                          dict.modelConfig
                                                              .modelsConfiguredCount,
                                                          {
                                                              count: selectedProvider
                                                                  .models
                                                                  .length,
                                                          },
                                                      )}
                                            </p>
                                        </div>
                                        {selectedProvider.validated && (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success-muted text-success">
                                                <Check className="h-3.5 w-3.5 animate-check-pop" />
                                                <span className="text-xs font-medium">
                                                    {dict.modelConfig.verified}
                                                </span>
                                            </div>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                setDeleteConfirmOpen(true)
                                            }
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="h-4 w-4 mr-1.5" />
                                            {dict.modelConfig.deleteProvider}
                                        </Button>
                                    </div>

                                    {/* Configuration Section */}
                                    <ConfigSection
                                        title={dict.modelConfig.configuration}
                                        icon={Settings2}
                                    >
                                        <ConfigCard>
                                            <ProviderCredentialsFields
                                                provider={
                                                    selectedProvider.provider
                                                }
                                                name={selectedProvider.name}
                                                baseUrl={
                                                    selectedProvider.baseUrl
                                                }
                                                awsRegion={
                                                    selectedProvider.awsRegion
                                                }
                                                onChange={(field, value) =>
                                                    handleProviderUpdate(
                                                        field,
                                                        value,
                                                    )
                                                }
                                                renderSecret={({ field, id }) =>
                                                    renderProviderSecret(
                                                        field,
                                                        id,
                                                    )
                                                }
                                                footer={
                                                    selectedProvider.provider ===
                                                    "bedrock"
                                                        ? renderTestButton(
                                                              !!selectedProvider.awsAccessKeyId &&
                                                                  !!selectedProvider.awsSecretAccessKey &&
                                                                  !!selectedProvider.awsRegion,
                                                          )
                                                        : selectedProvider.provider ===
                                                            "edgeone"
                                                          ? renderTestButton(
                                                                true,
                                                            )
                                                          : undefined
                                                }
                                            />
                                        </ConfigCard>
                                    </ConfigSection>

                                    {/* Models Section */}
                                    <ConfigSection
                                        title={dict.modelConfig.models}
                                        icon={Sparkles}
                                        action={
                                            <div className="flex items-center gap-2">
                                                <div className="relative">
                                                    <Input
                                                        placeholder={
                                                            dict.modelConfig
                                                                .customModelId
                                                        }
                                                        value={customModelInput}
                                                        onChange={(e) => {
                                                            setCustomModelInput(
                                                                e.target.value,
                                                            )
                                                            if (
                                                                duplicateError
                                                            ) {
                                                                setDuplicateError(
                                                                    "",
                                                                )
                                                            }
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key ===
                                                                    "Enter" &&
                                                                customModelInput.trim()
                                                            ) {
                                                                const success =
                                                                    handleAddModel(
                                                                        customModelInput.trim(),
                                                                    )
                                                                if (success) {
                                                                    setCustomModelInput(
                                                                        "",
                                                                    )
                                                                }
                                                            }
                                                        }}
                                                        className={cn(
                                                            "h-8 w-44 rounded-lg font-mono text-xs",
                                                            duplicateError &&
                                                                "border-destructive focus-visible:ring-destructive",
                                                        )}
                                                    />
                                                    {duplicateError && (
                                                        <p className="absolute top-full left-0 mt-1 text-[11px] text-destructive">
                                                            {duplicateError}
                                                        </p>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 rounded-lg"
                                                    onClick={() => {
                                                        if (
                                                            customModelInput.trim()
                                                        ) {
                                                            const success =
                                                                handleAddModel(
                                                                    customModelInput.trim(),
                                                                )
                                                            if (success) {
                                                                setCustomModelInput(
                                                                    "",
                                                                )
                                                            }
                                                        }
                                                    }}
                                                    disabled={
                                                        !customModelInput.trim()
                                                    }
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                                <Select
                                                    onValueChange={(value) => {
                                                        if (value) {
                                                            handleAddModel(
                                                                value,
                                                            )
                                                        }
                                                    }}
                                                    disabled={
                                                        isLoadingSuggestedModels ||
                                                        availableSuggestions.length ===
                                                            0
                                                    }
                                                >
                                                    <SelectTrigger className="w-28 h-8 rounded-lg hover:bg-interactive-hover">
                                                        {isLoadingSuggestedModels ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <span className="text-xs">
                                                                {availableSuggestions.length ===
                                                                0
                                                                    ? dict
                                                                          .modelConfig
                                                                          .allAdded
                                                                    : dict
                                                                          .modelConfig
                                                                          .suggested}
                                                            </span>
                                                        )}
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-72">
                                                        {availableSuggestions.map(
                                                            (modelId) => (
                                                                <SelectItem
                                                                    key={
                                                                        modelId
                                                                    }
                                                                    value={
                                                                        modelId
                                                                    }
                                                                    className="font-mono text-xs"
                                                                >
                                                                    {modelId}
                                                                </SelectItem>
                                                            ),
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        }
                                    >
                                        {/* Model List */}
                                        <div className="rounded-2xl border border-border-subtle bg-surface-2/30 overflow-hidden min-h-[120px]">
                                            {selectedProvider.models.length ===
                                            0 ? (
                                                <div className="p-6 text-center h-full flex flex-col items-center justify-center">
                                                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-surface-2 mb-3">
                                                        <ProviderLogo
                                                            provider={
                                                                selectedProvider.provider
                                                            }
                                                            className="size-5 text-muted-foreground"
                                                        />
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {
                                                            dict.modelConfig
                                                                .noModelsConfigured
                                                        }
                                                    </p>
                                                    {emptyStateSuggestions.length >
                                                        0 && (
                                                        <div className="mt-4 flex max-w-full flex-wrap items-center justify-center gap-2">
                                                            {emptyStateSuggestions.map(
                                                                (modelId) => (
                                                                    <Button
                                                                        key={
                                                                            modelId
                                                                        }
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-7 max-w-[220px] rounded-lg px-2 font-mono text-[11px]"
                                                                        onClick={() =>
                                                                            handleAddModel(
                                                                                modelId,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Plus className="h-3 w-3 shrink-0" />
                                                                        <span className="truncate">
                                                                            {
                                                                                modelId
                                                                            }
                                                                        </span>
                                                                    </Button>
                                                                ),
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-border-subtle">
                                                    {selectedProvider.models.map(
                                                        (model, index) => (
                                                            <div
                                                                key={model.id}
                                                                className={cn(
                                                                    "transition-colors duration-150 hover:bg-interactive-hover/50",
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-3 p-3 min-w-0">
                                                                    {/* Status icon */}
                                                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0">
                                                                        {validatingModelIndex !==
                                                                            null &&
                                                                        index ===
                                                                            validatingModelIndex ? (
                                                                            // Currently validating
                                                                            <div className="w-full h-full rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                                                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                                                                            </div>
                                                                        ) : validatingModelIndex !==
                                                                              null &&
                                                                          index >
                                                                              validatingModelIndex &&
                                                                          model.validated ===
                                                                              undefined ? (
                                                                            // Queued
                                                                            <div className="w-full h-full rounded-lg bg-muted flex items-center justify-center">
                                                                                <Clock className="h-4 w-4 text-muted-foreground" />
                                                                            </div>
                                                                        ) : model.validated ===
                                                                          true ? (
                                                                            // Valid
                                                                            <div className="w-full h-full rounded-lg bg-success-muted flex items-center justify-center">
                                                                                <Check className="h-4 w-4 text-success" />
                                                                            </div>
                                                                        ) : model.validated ===
                                                                          false ? (
                                                                            // Invalid
                                                                            <div className="w-full h-full rounded-lg bg-destructive/10 flex items-center justify-center">
                                                                                <AlertCircle className="h-4 w-4 text-destructive" />
                                                                            </div>
                                                                        ) : (
                                                                            // Not validated yet
                                                                            <div className="w-full h-full rounded-lg bg-primary/5 flex items-center justify-center">
                                                                                <Zap className="h-4 w-4 text-primary" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <Input
                                                                        value={
                                                                            model.modelId
                                                                        }
                                                                        title={
                                                                            model.modelId
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) => {
                                                                            // Allow free typing - validation happens on blur
                                                                            // Clear edit error when typing
                                                                            if (
                                                                                editError?.modelId ===
                                                                                model.id
                                                                            ) {
                                                                                setEditError(
                                                                                    null,
                                                                                )
                                                                            }
                                                                            if (
                                                                                selectedProviderId
                                                                            ) {
                                                                                updateModel(
                                                                                    selectedProviderId,
                                                                                    model.id,
                                                                                    {
                                                                                        modelId:
                                                                                            e
                                                                                                .target
                                                                                                .value,
                                                                                        validated:
                                                                                            undefined,
                                                                                        validationError:
                                                                                            undefined,
                                                                                    },
                                                                                )
                                                                            }
                                                                        }}
                                                                        onKeyDown={(
                                                                            e,
                                                                        ) => {
                                                                            if (
                                                                                e.key ===
                                                                                "Enter"
                                                                            ) {
                                                                                e.currentTarget.blur()
                                                                            }
                                                                        }}
                                                                        onBlur={(
                                                                            e,
                                                                        ) => {
                                                                            const newModelId =
                                                                                e.target.value.trim()

                                                                            // Helper to show error with shake
                                                                            const showError =
                                                                                (
                                                                                    message: string,
                                                                                ) => {
                                                                                    setEditError(
                                                                                        {
                                                                                            modelId:
                                                                                                model.id,
                                                                                            message,
                                                                                        },
                                                                                    )
                                                                                    e.target.animate(
                                                                                        [
                                                                                            {
                                                                                                transform:
                                                                                                    "translateX(0)",
                                                                                            },
                                                                                            {
                                                                                                transform:
                                                                                                    "translateX(-4px)",
                                                                                            },
                                                                                            {
                                                                                                transform:
                                                                                                    "translateX(4px)",
                                                                                            },
                                                                                            {
                                                                                                transform:
                                                                                                    "translateX(-4px)",
                                                                                            },
                                                                                            {
                                                                                                transform:
                                                                                                    "translateX(4px)",
                                                                                            },
                                                                                            {
                                                                                                transform:
                                                                                                    "translateX(0)",
                                                                                            },
                                                                                        ],
                                                                                        {
                                                                                            duration: 400,
                                                                                            easing: "ease-in-out",
                                                                                        },
                                                                                    )
                                                                                    e.target.focus()
                                                                                }

                                                                            // Check for empty model name
                                                                            if (
                                                                                !newModelId
                                                                            ) {
                                                                                showError(
                                                                                    dict
                                                                                        .modelConfig
                                                                                        .modelIdEmpty,
                                                                                )
                                                                                return
                                                                            }

                                                                            // Check for duplicate
                                                                            const otherModelIds =
                                                                                selectedProvider?.models
                                                                                    .filter(
                                                                                        (
                                                                                            m,
                                                                                        ) =>
                                                                                            m.id !==
                                                                                            model.id,
                                                                                    )
                                                                                    .map(
                                                                                        (
                                                                                            m,
                                                                                        ) =>
                                                                                            m.modelId,
                                                                                    ) ||
                                                                                []
                                                                            if (
                                                                                otherModelIds.includes(
                                                                                    newModelId,
                                                                                )
                                                                            ) {
                                                                                showError(
                                                                                    dict
                                                                                        .modelConfig
                                                                                        .modelIdExists,
                                                                                )
                                                                                return
                                                                            }

                                                                            // Clear error on valid blur
                                                                            setEditError(
                                                                                null,
                                                                            )
                                                                        }}
                                                                        className="flex-1 min-w-0 font-mono text-sm h-8 border-0 bg-transparent focus-visible:bg-background focus-visible:ring-1"
                                                                    />
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                                        onClick={() =>
                                                                            handleDeleteModel(
                                                                                model.id,
                                                                            )
                                                                        }
                                                                        aria-label={`Delete ${model.modelId}`}
                                                                    >
                                                                        <X className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                                {/* Show validation error inline */}
                                                                {model.validated ===
                                                                    false &&
                                                                    model.validationError && (
                                                                        <p className="text-[11px] text-destructive px-3 pb-2 pl-14">
                                                                            {
                                                                                model.validationError
                                                                            }
                                                                        </p>
                                                                    )}
                                                                {/* Show edit error inline */}
                                                                {editError?.modelId ===
                                                                    model.id && (
                                                                    <p className="text-[11px] text-destructive px-3 pb-2 pl-14">
                                                                        {
                                                                            editError.message
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </ConfigSection>
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2 mb-4">
                                    <Server className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <h3 className="font-semibold text-lg tracking-tight mb-1">
                                    {dict.modelConfig.configureProviders}
                                </h3>
                                <p className="text-sm text-muted-foreground max-w-xs">
                                    {dict.modelConfig.selectProviderHint}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-border-subtle bg-surface-1/30 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Switch
                                id="show-unvalidated-models"
                                checked={modelConfig.showUnvalidatedModels}
                                onCheckedChange={
                                    modelConfig.setShowUnvalidatedModels
                                }
                            />
                            <Label
                                htmlFor="show-unvalidated-models"
                                className="text-xs text-muted-foreground cursor-pointer"
                            >
                                {dict.modelConfig.showUnvalidatedModels}
                            </Label>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Key className="h-3 w-3" />
                            {dict.modelConfig.apiKeyStored}
                        </p>
                    </div>
                </div>
            </DialogContent>

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteConfirmOpen}
                onOpenChange={(open) => {
                    setDeleteConfirmOpen(open)
                    if (!open) setDeleteConfirmText("")
                }}
            >
                <AlertDialogContent className="border-destructive/30">
                    <AlertDialogHeader>
                        <div className="mx-auto mb-3 p-3 rounded-full bg-destructive/10">
                            <AlertCircle className="h-6 w-6 text-destructive" />
                        </div>
                        <AlertDialogTitle className="text-center">
                            {dict.modelConfig.deleteProvider}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center">
                            {formatMessage(dict.modelConfig.deleteConfirmDesc, {
                                name: selectedProvider
                                    ? selectedProvider.name ||
                                      PROVIDER_INFO[selectedProvider.provider]
                                          .label
                                    : "this provider",
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {selectedProvider &&
                        selectedProvider.models.length >= 3 && (
                            <div className="mt-2 space-y-2">
                                <Label
                                    htmlFor="delete-confirm"
                                    className="text-sm text-muted-foreground"
                                >
                                    {formatMessage(
                                        dict.modelConfig.typeToConfirm,
                                        {
                                            name:
                                                selectedProvider.name ||
                                                PROVIDER_INFO[
                                                    selectedProvider.provider
                                                ].label,
                                        },
                                    )}
                                </Label>
                                <Input
                                    id="delete-confirm"
                                    value={deleteConfirmText}
                                    onChange={(e) =>
                                        setDeleteConfirmText(e.target.value)
                                    }
                                    placeholder={
                                        dict.modelConfig.typeProviderName
                                    }
                                    className="h-9"
                                />
                            </div>
                        )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {dict.modelConfig.cancel}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteProvider}
                            disabled={
                                selectedProvider &&
                                selectedProvider.models.length >= 3 &&
                                deleteConfirmText !==
                                    (selectedProvider.name ||
                                        PROVIDER_INFO[selectedProvider.provider]
                                            .label)
                            }
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                        >
                            {dict.modelConfig.delete}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    )
}
