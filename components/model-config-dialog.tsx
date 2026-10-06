"use client"

import {
    AlertCircle,
    Check,
    ChevronRight,
    Eye,
    EyeOff,
    Key,
    Loader2,
    Plus,
    RefreshCw,
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
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
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
import type { ListedModel } from "@/lib/provider-models"
import { STORAGE_KEYS } from "@/lib/storage"
import type {
    ModelConfig,
    ProviderConfig,
    ProviderName,
} from "@/lib/types/model-config"
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
    // Models whose test is running (they are all tested at once)
    const [validatingModelIds, setValidatingModelIds] = useState<Set<string>>(
        () => new Set(),
    )
    const [duplicateError, setDuplicateError] = useState<string>("")
    const [editError, setEditError] = useState<{
        modelId: string
        message: string
    } | null>(null)
    // Model ID being typed; written to the config only when valid on blur
    const [modelIdDraft, setModelIdDraft] = useState<{
        id: string
        value: string
    } | null>(null)
    // Models fetched from the provider, per provider config
    const [fetchedModels, setFetchedModels] = useState<
        Record<string, ListedModel[]>
    >({})
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchModelsError, setFetchModelsError] = useState("")
    const [modelPickerOpen, setModelPickerOpen] = useState(false)
    // models.dev data for hints, loaded with the dialog (it is ~180 KB)
    const [getModelInfo, setGetModelInfo] = useState<
        typeof import("@/lib/model-catalog").getModelInfo | null
    >(null)

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
    // For requests that finish after the user switched provider or edited
    // a model id
    const selectedProviderIdRef = useRef(selectedProviderId)
    selectedProviderIdRef.current = selectedProviderId
    const configRef = useRef(config)
    configRef.current = config
    // Number of the latest Test click: only that test may reset the busy
    // state when its credentials changed meanwhile
    const validationRunRef = useRef(0)
    // A model list or test result belongs to the credentials it was asked
    // with; they can change meanwhile, here or in another tab
    const credentialsOf = (providerId: string) => {
        const p = configRef.current.providers.find((x) => x.id === providerId)
        return JSON.stringify([
            p?.provider,
            p?.apiKey,
            p?.baseUrl,
            p?.awsAccessKeyId,
            p?.awsSecretAccessKey,
            p?.awsRegion,
            p?.awsSessionToken,
            p?.vertexApiKey,
        ])
    }

    // Discard an unfinished model ID edit when the dialog closes
    useEffect(() => {
        if (!open) setModelIdDraft(null)
    }, [open])

    // Cleanup validation reset timeout on unmount
    useEffect(() => {
        return () => {
            if (validationResetTimeoutRef.current) {
                clearTimeout(validationResetTimeoutRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (!open || getModelInfo) return
        import("@/lib/model-catalog").then((catalog) =>
            setGetModelInfo(() => catalog.getModelInfo),
        )
    }, [open, getModelInfo])

    const handleFetchModels = async () => {
        if (!selectedProvider) return
        const providerId = selectedProvider.id
        const askedWith = credentialsOf(providerId)
        setFetchingModels(true)
        setFetchModelsError("")
        try {
            const response = await fetch(
                getApiEndpoint("/api/provider-models"),
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-access-code":
                            localStorage.getItem(STORAGE_KEYS.accessCode) || "",
                    },
                    body: JSON.stringify({
                        provider: selectedProvider.provider,
                        apiKey: selectedProvider.apiKey,
                        baseUrl: selectedProvider.baseUrl,
                    }),
                },
            )
            const data = await response.json().catch(() => ({}))
            if (credentialsOf(providerId) !== askedWith) return
            // The picker and the error belong to the provider shown
            const stillShown = selectedProviderIdRef.current === providerId
            if (Array.isArray(data.models)) {
                setFetchedModels((current) => ({
                    ...current,
                    [providerId]: data.models,
                }))
                if (stillShown) setModelPickerOpen(true)
            } else if (stillShown) {
                const hints = dict.errors.llm as Record<string, string>
                setFetchModelsError(
                    [hints[data.code], data.error].filter(Boolean).join(" ") ||
                        `Request failed (${response.status})`,
                )
            }
        } catch {
            if (
                selectedProviderIdRef.current === providerId &&
                credentialsOf(providerId) === askedWith
            ) {
                setFetchModelsError(dict.errors.networkError)
            }
        } finally {
            setFetchingModels(false)
        }
    }

    // The provider's own list once fetched, else the suggested models
    const suggestedModels: ListedModel[] = selectedProvider
        ? fetchedModels[selectedProvider.id] ||
          (SUGGESTED_MODELS[selectedProvider.provider] || []).map((id) => ({
              id,
          }))
        : []
    // Tool calls are what drawing needs: false when known to be missing
    const supportsTools = (model: ListedModel) =>
        selectedProvider
            ? (model.tools ??
              getModelInfo?.(selectedProvider.provider, model.id)?.tools)
            : undefined

    // Filter out already-added models from suggestions
    const existingModelIds =
        selectedProvider?.models.map((m) => m.modelId) || []
    const availableSuggestions = suggestedModels.filter(
        (model) => !existingModelIds.includes(model.id),
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
        setFetchModelsError("")
        setModelPickerOpen(false)
    }

    // Handle provider field updates
    const handleProviderUpdate = (
        field: keyof ProviderConfig,
        value: string | boolean,
    ) => {
        if (!selectedProviderId || !selectedProvider) return
        const updates: Partial<ProviderConfig> = { [field]: value }
        // Reset validation of the provider and its models when credentials change
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
            setValidatingModelIds(new Set())
            setFetchedModels(({ [selectedProviderId]: _, ...rest }) => rest)
            setFetchModelsError("")
            updates.validated = false
            updates.models = selectedProvider.models.map((m) => ({
                ...m,
                validated: undefined,
                validationError: undefined,
                validationWarning: undefined,
                responseTime: undefined,
            }))
        }
        updateProvider(selectedProviderId, updates)
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
        let idChanged = false
        const askedWith = credentialsOf(selectedProviderId)
        const run = ++validationRunRef.current

        // For EdgeOne, construct baseUrl from current origin
        const baseUrl = isEdgeOne
            ? `${window.location.origin}/api/edgeai`
            : selectedProvider.baseUrl

        // Test every model at once; each row updates when its answer arrives
        setValidatingModelIds(new Set(selectedProvider.models.map((m) => m.id)))
        await Promise.all(
            selectedProvider.models.map(async (model) => {
                let update: Partial<ModelConfig>
                try {
                    const response = await fetch(
                        getApiEndpoint("/api/validate-model"),
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-access-code":
                                    localStorage.getItem(
                                        STORAGE_KEYS.accessCode,
                                    ) || "",
                            },
                            body: JSON.stringify({
                                provider: selectedProvider.provider,
                                apiKey: selectedProvider.apiKey,
                                baseUrl,
                                modelId: model.modelId,
                                // AWS Bedrock credentials
                                awsAccessKeyId: selectedProvider.awsAccessKeyId,
                                awsSecretAccessKey:
                                    selectedProvider.awsSecretAccessKey,
                                awsRegion: selectedProvider.awsRegion,
                                // Temporary AWS credentials, as the chat sends
                                awsSessionToken:
                                    selectedProvider.awsSessionToken,
                                // Vertex AI credentials (Express Mode)
                                vertexApiKey: selectedProvider.vertexApiKey,
                            }),
                        },
                    )
                    const data = await response.json().catch(() => ({}))
                    update = data.valid
                        ? {
                              validated: true,
                              validationError: undefined,
                              validationWarning: data.warning,
                              responseTime: data.responseTime,
                          }
                        : {
                              validated: false,
                              // The hint for the error's kind, then the
                              // provider's own message
                              validationError:
                                  [
                                      (
                                          dict.errors.llm as Record<
                                              string,
                                              string
                                          >
                                      )[data.code],
                                      data.error,
                                  ]
                                      .filter(Boolean)
                                      .join(" ") ||
                                  (response.ok
                                      ? "Validation failed"
                                      : `Request failed (${response.status})`),
                              validationWarning: undefined,
                          }
                } catch {
                    update = {
                        validated: false,
                        validationError: "Network error",
                        validationWarning: undefined,
                    }
                }
                // A newer test started: its own results and spinners count,
                // whatever the credentials are now (they may have come back)
                if (run !== validationRunRef.current) return
                // Credentials changed during the test: drop the result. A
                // change in another tab left the spinner on, so clear it
                // (model ids are unique, whatever provider is shown).
                if (credentialsOf(selectedProviderId) !== askedWith) {
                    setValidatingModelIds((prev) => {
                        const next = new Set(prev)
                        next.delete(model.id)
                        return next
                    })
                    return
                }
                // So did this model's id: the result is for the old one
                const current = configRef.current.providers
                    .find((p) => p.id === selectedProviderId)
                    ?.models.find((m) => m.id === model.id)
                if (current?.modelId !== model.modelId) {
                    idChanged = true
                    setValidatingModelIds((prev) => {
                        const next = new Set(prev)
                        next.delete(model.id)
                        return next
                    })
                    return
                }
                if (update.validated === false) {
                    allValid = false
                    errorCount++
                }
                updateModel(selectedProviderId, model.id, update)
                setValidatingModelIds((prev) => {
                    const next = new Set(prev)
                    next.delete(model.id)
                    return next
                })
            }),
        )
        if (run !== validationRunRef.current) return
        if (credentialsOf(selectedProviderId) !== askedWith) {
            // The status line is about the provider shown now
            if (selectedProviderIdRef.current === selectedProviderId) {
                setValidationStatus("idle")
            }
            return
        }

        // A model whose id changed was not tested
        if (allValid && !idChanged) {
            updateProvider(selectedProviderId, { validated: true })
        }
        // The status line is about the provider shown now
        if (selectedProviderIdRef.current !== selectedProviderId) return
        if (idChanged) {
            setValidationStatus("idle")
        } else if (allValid) {
            setValidationStatus("success")
            // Reset to idle after showing success briefly (with cleanup)
            if (validationResetTimeoutRef.current) {
                clearTimeout(validationResetTimeoutRef.current)
            }
            validationResetTimeoutRef.current = setTimeout(() => {
                validationResetTimeoutRef.current = null
                if (run !== validationRunRef.current) return
                setValidationStatus("idle")
            }, 1500)
        } else {
            setValidationStatus("error")
            setValidationError(`${errorCount} model(s) failed validation`)
        }
    }, [
        selectedProvider,
        selectedProviderId,
        updateProvider,
        updateModel,
        dict,
    ])

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
                                                // These belong to the
                                                // provider shown before
                                                setFetchModelsError("")
                                                setModelPickerOpen(false)
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
                            {/* Always empty so picking the same type again still fires */}
                            <Select
                                value=""
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
                                                {PROVIDER_INFO[
                                                    selectedProvider.provider
                                                ].modelList && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 rounded-lg"
                                                        onClick={
                                                            handleFetchModels
                                                        }
                                                        disabled={
                                                            fetchingModels
                                                        }
                                                        title={
                                                            dict.modelConfig
                                                                .fetchModels
                                                        }
                                                        aria-label={
                                                            dict.modelConfig
                                                                .fetchModels
                                                        }
                                                    >
                                                        {fetchingModels ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <RefreshCw className="h-3.5 w-3.5" />
                                                        )}
                                                    </Button>
                                                )}
                                                {/* modal: the dialog blocks the
                                                wheel outside itself, and the
                                                list is rendered outside it */}
                                                <Popover
                                                    modal
                                                    open={modelPickerOpen}
                                                    onOpenChange={
                                                        setModelPickerOpen
                                                    }
                                                >
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-28 h-8 rounded-lg text-xs"
                                                            disabled={
                                                                availableSuggestions.length ===
                                                                0
                                                            }
                                                        >
                                                            {availableSuggestions.length ===
                                                            0
                                                                ? dict
                                                                      .modelConfig
                                                                      .allAdded
                                                                : dict
                                                                      .modelConfig
                                                                      .suggested}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent
                                                        className="w-80 p-0"
                                                        align="end"
                                                    >
                                                        <Command>
                                                            <CommandInput
                                                                placeholder={
                                                                    dict
                                                                        .modelConfig
                                                                        .searchModels
                                                                }
                                                            />
                                                            <CommandList className="max-h-72">
                                                                <CommandEmpty>
                                                                    {
                                                                        dict
                                                                            .modelConfig
                                                                            .noModelsFound
                                                                    }
                                                                </CommandEmpty>
                                                                {availableSuggestions.map(
                                                                    (model) => (
                                                                        <CommandItem
                                                                            key={
                                                                                model.id
                                                                            }
                                                                            value={
                                                                                model.id
                                                                            }
                                                                            onSelect={() => {
                                                                                handleAddModel(
                                                                                    model.id,
                                                                                )
                                                                                setModelPickerOpen(
                                                                                    false,
                                                                                )
                                                                            }}
                                                                            className="font-mono text-xs"
                                                                        >
                                                                            <span className="truncate">
                                                                                {
                                                                                    model.id
                                                                                }
                                                                            </span>
                                                                            {supportsTools(
                                                                                model,
                                                                            ) ===
                                                                                false && (
                                                                                <span className="ml-auto shrink-0 font-sans text-[10px] text-amber-600 dark:text-amber-400">
                                                                                    {
                                                                                        dict
                                                                                            .modelConfig
                                                                                            .noTools
                                                                                    }
                                                                                </span>
                                                                            )}
                                                                        </CommandItem>
                                                                    ),
                                                                )}
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        }
                                    >
                                        {fetchModelsError && (
                                            <p className="mb-2 text-xs text-destructive">
                                                {fetchModelsError}
                                            </p>
                                        )}
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
                                                        (model) => (
                                                            <div
                                                                key={model.id}
                                                                className={cn(
                                                                    "transition-colors duration-150 hover:bg-interactive-hover/50",
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-3 p-3 min-w-0">
                                                                    {/* Status icon */}
                                                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0">
                                                                        {validatingModelIds.has(
                                                                            model.id,
                                                                        ) ? (
                                                                            // Currently validating
                                                                            <div className="w-full h-full rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                                                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                                                                            </div>
                                                                        ) : model.validated ===
                                                                          true ? (
                                                                            // Valid, with the time the test took
                                                                            <div
                                                                                className="w-full h-full rounded-lg bg-success-muted flex items-center justify-center"
                                                                                title={
                                                                                    model.responseTime
                                                                                        ? `${(model.responseTime / 1000).toFixed(1)} s`
                                                                                        : undefined
                                                                                }
                                                                            >
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
                                                                            modelIdDraft?.id ===
                                                                            model.id
                                                                                ? modelIdDraft.value
                                                                                : model.modelId
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
                                                                            setModelIdDraft(
                                                                                {
                                                                                    id: model.id,
                                                                                    value: e
                                                                                        .target
                                                                                        .value,
                                                                                },
                                                                            )
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
                                                                            // Drop the draft; an invalid ID falls back to the saved one
                                                                            setModelIdDraft(
                                                                                null,
                                                                            )

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
                                                                            if (
                                                                                selectedProviderId &&
                                                                                newModelId !==
                                                                                    model.modelId
                                                                            ) {
                                                                                updateModel(
                                                                                    selectedProviderId,
                                                                                    model.id,
                                                                                    {
                                                                                        modelId:
                                                                                            newModelId,
                                                                                        validated:
                                                                                            undefined,
                                                                                        validationError:
                                                                                            undefined,
                                                                                        validationWarning:
                                                                                            undefined,
                                                                                        responseTime:
                                                                                            undefined,
                                                                                    },
                                                                                )
                                                                            }
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
                                                                {!model.validationWarning &&
                                                                    getModelInfo?.(
                                                                        selectedProvider.provider,
                                                                        model.modelId,
                                                                    )?.tools ===
                                                                        false && (
                                                                        <p className="text-[11px] text-amber-600 dark:text-amber-400 px-3 pb-2 pl-14">
                                                                            {
                                                                                dict
                                                                                    .modelConfig
                                                                                    .mayNotDraw
                                                                            }
                                                                        </p>
                                                                    )}
                                                                {model.validated &&
                                                                    model.validationWarning && (
                                                                        <p className="text-[11px] text-amber-600 dark:text-amber-400 px-3 pb-2 pl-14">
                                                                            {
                                                                                model.validationWarning
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
