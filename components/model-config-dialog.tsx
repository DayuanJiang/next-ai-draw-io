"use client"

import {
    AlertCircle,
    Check,
    ChevronRight,
    Clock,
    Cloud,
    Eye,
    EyeOff,
    Key,
    Link2,
    Loader2,
    Plus,
    Server,
    Settings2,
    Sparkles,
    Tag,
    Trash2,
    X,
    Zap,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
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

// Map provider names to models.dev logo names
const PROVIDER_LOGO_MAP: Record<string, string> = {
    openai: "openai",
    anthropic: "anthropic",
    google: "google",
    azure: "azure",
    bedrock: "amazon-bedrock",
    openrouter: "openrouter",
    deepseek: "deepseek",
    siliconflow: "siliconflow",
    sglang: "openai", // SGLang is OpenAI-compatible
    gateway: "vercel",
    edgeone: "tencent-cloud",
    vertexai: "google",
    doubao: "bytedance",
    modelscope: "modelscope",
}

// Provider logo component
function ProviderLogo({
    provider,
    className,
}: {
    provider: ProviderName
    className?: string
}) {
    // Use Lucide icons for providers without models.dev logos
    if (provider === "bedrock") {
        return <Cloud className={cn("size-4", className)} />
    }
    if (provider === "sglang") {
        return <Server className={cn("size-4", className)} />
    }
    if (provider === "doubao") {
        return <Sparkles className={cn("size-4", className)} />
    }

    const logoName = PROVIDER_LOGO_MAP[provider] || provider
    return (
        // biome-ignore lint/performance/noImgElement: External URL from models.dev
        <img
            alt={`${provider} logo`}
            className={cn("size-4 dark:invert", className)}
            height={16}
            src={`https://models.dev/logos/${logoName}.svg`}
            width={16}
        />
    )
}

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

    // Get suggested models for current provider
    const suggestedModels = selectedProvider
        ? SUGGESTED_MODELS[selectedProvider.provider] || []
        : []

    // Filter out already-added models from suggestions
    const existingModelIds =
        selectedProvider?.models.map((m) => m.modelId) || []
    const availableSuggestions = suggestedModels.filter(
        (modelId) => !existingModelIds.includes(modelId),
    )

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
        } else if (!isEdgeOne && !selectedProvider.apiKey) {
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

                        <ScrollArea className="flex-1 px-2">
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
                    <div className="flex-1 min-w-0 flex flex-col overflow-auto [&::-webkit-scrollbar]:hidden ">
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
                                            {/* Display Name */}
                                            <div className="space-y-2">
                                                <Label
                                                    htmlFor="provider-name"
                                                    className="text-xs font-medium flex items-center gap-1.5"
                                                >
                                                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {
                                                        dict.modelConfig
                                                            .displayName
                                                    }
                                                </Label>
                                                <Input
                                                    id="provider-name"
                                                    value={
                                                        selectedProvider.name ||
                                                        ""
                                                    }
                                                    onChange={(e) =>
                                                        handleProviderUpdate(
                                                            "name",
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder={
                                                        PROVIDER_INFO[
                                                            selectedProvider
                                                                .provider
                                                        ].label
                                                    }
                                                    className="h-9"
                                                />
                                            </div>

                                            {/* Credentials - different for Bedrock vs other providers */}
                                            {selectedProvider.provider ===
                                            "bedrock" ? (
                                                <>
                                                    {/* AWS Access Key ID */}
                                                    <div className="space-y-2">
                                                        <Label
                                                            htmlFor="aws-access-key-id"
                                                            className="text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                                            {
                                                                dict.modelConfig
                                                                    .awsAccessKeyId
                                                            }
                                                        </Label>
                                                        <Input
                                                            id="aws-access-key-id"
                                                            type={
                                                                showApiKey
                                                                    ? "text"
                                                                    : "password"
                                                            }
                                                            value={
                                                                selectedProvider.awsAccessKeyId ||
                                                                ""
                                                            }
                                                            onChange={(e) =>
                                                                handleProviderUpdate(
                                                                    "awsAccessKeyId",
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="AKIA..."
                                                            className="h-9 font-mono text-xs"
                                                        />
                                                    </div>

                                                    {/* AWS Secret Access Key */}
                                                    <div className="space-y-2">
                                                        <Label
                                                            htmlFor="aws-secret-access-key"
                                                            className="text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                                            {
                                                                dict.modelConfig
                                                                    .awsSecretAccessKey
                                                            }
                                                        </Label>
                                                        <div className="relative">
                                                            <Input
                                                                id="aws-secret-access-key"
                                                                type={
                                                                    showApiKey
                                                                        ? "text"
                                                                        : "password"
                                                                }
                                                                value={
                                                                    selectedProvider.awsSecretAccessKey ||
                                                                    ""
                                                                }
                                                                onChange={(e) =>
                                                                    handleProviderUpdate(
                                                                        "awsSecretAccessKey",
                                                                        e.target
                                                                            .value,
                                                                    )
                                                                }
                                                                placeholder={
                                                                    dict
                                                                        .modelConfig
                                                                        .enterSecretKey
                                                                }
                                                                className="h-9 pr-10 font-mono text-xs"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setShowApiKey(
                                                                        !showApiKey,
                                                                    )
                                                                }
                                                                aria-label={
                                                                    showApiKey
                                                                        ? "Hide secret access key"
                                                                        : "Show secret access key"
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
                                                    </div>

                                                    {/* AWS Region */}
                                                    <div className="space-y-2">
                                                        <Label
                                                            htmlFor="aws-region"
                                                            className="text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                            {
                                                                dict.modelConfig
                                                                    .awsRegion
                                                            }
                                                        </Label>
                                                        <Select
                                                            value={
                                                                selectedProvider.awsRegion ||
                                                                ""
                                                            }
                                                            onValueChange={(
                                                                v,
                                                            ) =>
                                                                handleProviderUpdate(
                                                                    "awsRegion",
                                                                    v,
                                                                )
                                                            }
                                                        >
                                                            <SelectTrigger className="h-9 font-mono text-xs hover:bg-accent">
                                                                <SelectValue
                                                                    placeholder={
                                                                        dict
                                                                            .modelConfig
                                                                            .selectRegion
                                                                    }
                                                                />
                                                            </SelectTrigger>
                                                            <SelectContent className="max-h-64">
                                                                <SelectItem value="us-east-1">
                                                                    us-east-1
                                                                    (N.
                                                                    Virginia)
                                                                </SelectItem>
                                                                <SelectItem value="us-east-2">
                                                                    us-east-2
                                                                    (Ohio)
                                                                </SelectItem>
                                                                <SelectItem value="us-west-2">
                                                                    us-west-2
                                                                    (Oregon)
                                                                </SelectItem>
                                                                <SelectItem value="eu-west-1">
                                                                    eu-west-1
                                                                    (Ireland)
                                                                </SelectItem>
                                                                <SelectItem value="eu-west-2">
                                                                    eu-west-2
                                                                    (London)
                                                                </SelectItem>
                                                                <SelectItem value="eu-west-3">
                                                                    eu-west-3
                                                                    (Paris)
                                                                </SelectItem>
                                                                <SelectItem value="eu-central-1">
                                                                    eu-central-1
                                                                    (Frankfurt)
                                                                </SelectItem>
                                                                <SelectItem value="ap-south-1">
                                                                    ap-south-1
                                                                    (Mumbai)
                                                                </SelectItem>
                                                                <SelectItem value="ap-northeast-1">
                                                                    ap-northeast-1
                                                                    (Tokyo)
                                                                </SelectItem>
                                                                <SelectItem value="ap-northeast-2">
                                                                    ap-northeast-2
                                                                    (Seoul)
                                                                </SelectItem>
                                                                <SelectItem value="ap-southeast-1">
                                                                    ap-southeast-1
                                                                    (Singapore)
                                                                </SelectItem>
                                                                <SelectItem value="ap-southeast-2">
                                                                    ap-southeast-2
                                                                    (Sydney)
                                                                </SelectItem>
                                                                <SelectItem value="sa-east-1">
                                                                    sa-east-1
                                                                    (São Paulo)
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    {/* Test Button for Bedrock */}
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            variant={
                                                                validationStatus ===
                                                                "success"
                                                                    ? "outline"
                                                                    : "default"
                                                            }
                                                            size="sm"
                                                            onClick={
                                                                handleValidate
                                                            }
                                                            disabled={
                                                                !selectedProvider.awsAccessKeyId ||
                                                                !selectedProvider.awsSecretAccessKey ||
                                                                !selectedProvider.awsRegion ||
                                                                validationStatus ===
                                                                    "validating"
                                                            }
                                                            className={cn(
                                                                "h-9 px-4",
                                                                validationStatus ===
                                                                    "success" &&
                                                                    "text-success border-success/30 bg-success-muted hover:bg-success-muted",
                                                            )}
                                                        >
                                                            {validationStatus ===
                                                            "validating" ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : validationStatus ===
                                                              "success" ? (
                                                                <>
                                                                    <Check className="h-4 w-4 mr-1.5 animate-check-pop" />
                                                                    {
                                                                        dict
                                                                            .modelConfig
                                                                            .verified
                                                                    }
                                                                </>
                                                            ) : (
                                                                dict.modelConfig
                                                                    .test
                                                            )}
                                                        </Button>
                                                        {validationStatus ===
                                                            "error" &&
                                                            validationError && (
                                                                <p className="text-xs text-destructive flex items-center gap-1">
                                                                    <X className="h-3 w-3" />
                                                                    {
                                                                        validationError
                                                                    }
                                                                </p>
                                                            )}
                                                    </div>
                                                </>
                                            ) : selectedProvider.provider ===
                                              "vertexai" ? (
                                                <>
                                                    {/* Vertex AI API Key */}
                                                    <div className="space-y-2">
                                                        <Label
                                                            htmlFor="vertex-api-key"
                                                            className="text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                                            API Key
                                                        </Label>
                                                        <div className="flex gap-2">
                                                            <div className="relative flex-1">
                                                                <Input
                                                                    id="vertex-api-key"
                                                                    type={
                                                                        showApiKey
                                                                            ? "text"
                                                                            : "password"
                                                                    }
                                                                    value={
                                                                        selectedProvider.vertexApiKey ||
                                                                        ""
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        handleProviderUpdate(
                                                                            "vertexApiKey",
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        )
                                                                    }
                                                                    placeholder="Enter your Vertex AI API key"
                                                                    className="h-9 pr-10 font-mono text-xs"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setShowApiKey(
                                                                            !showApiKey,
                                                                        )
                                                                    }
                                                                    aria-label={
                                                                        showApiKey
                                                                            ? "Hide API key"
                                                                            : "Show API key"
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
                                                            <Button
                                                                variant={
                                                                    validationStatus ===
                                                                    "success"
                                                                        ? "outline"
                                                                        : "default"
                                                                }
                                                                size="sm"
                                                                onClick={
                                                                    handleValidate
                                                                }
                                                                disabled={
                                                                    !selectedProvider.vertexApiKey ||
                                                                    validationStatus ===
                                                                        "validating"
                                                                }
                                                                className={cn(
                                                                    "h-9 px-4",
                                                                    validationStatus ===
                                                                        "success" &&
                                                                        "text-success border-success/30 bg-success-muted hover:bg-success-muted",
                                                                )}
                                                            >
                                                                {validationStatus ===
                                                                "validating" ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : validationStatus ===
                                                                  "success" ? (
                                                                    <>
                                                                        <Check className="h-4 w-4 mr-1.5 animate-check-pop" />
                                                                        {
                                                                            dict
                                                                                .modelConfig
                                                                                .verified
                                                                        }
                                                                    </>
                                                                ) : (
                                                                    dict
                                                                        .modelConfig
                                                                        .test
                                                                )}
                                                            </Button>
                                                        </div>
                                                        {validationStatus ===
                                                            "error" &&
                                                            validationError && (
                                                                <p className="text-xs text-destructive flex items-center gap-1">
                                                                    <X className="h-3 w-3" />
                                                                    {
                                                                        validationError
                                                                    }
                                                                </p>
                                                            )}
                                                    </div>

                                                    {/* Base URL (optional) */}
                                                    <div className="space-y-2">
                                                        <Label
                                                            htmlFor="vertex-base-url"
                                                            className="text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                            {formatMessage(
                                                                dict.modelConfig
                                                                    .baseUrlWithExample,
                                                                {
                                                                    example:
                                                                        PROVIDER_INFO[
                                                                            selectedProvider
                                                                                .provider
                                                                        ]
                                                                            .defaultBaseUrl ||
                                                                        "https://api.example.com/v1",
                                                                },
                                                            )}
                                                        </Label>
                                                        <Input
                                                            id="vertex-base-url"
                                                            value={
                                                                selectedProvider.baseUrl ||
                                                                ""
                                                            }
                                                            onChange={(e) =>
                                                                handleProviderUpdate(
                                                                    "baseUrl",
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="Custom endpoint URL"
                                                            className="h-9 font-mono text-xs"
                                                        />
                                                    </div>
                                                </>
                                            ) : selectedProvider.provider ===
                                                  "ollama" ||
                                              selectedProvider.provider ===
                                                  "edgeone" ? (
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            variant={
                                                                validationStatus ===
                                                                "success"
                                                                    ? "outline"
                                                                    : "default"
                                                            }
                                                            size="sm"
                                                            onClick={
                                                                handleValidate
                                                            }
                                                            disabled={
                                                                validationStatus ===
                                                                "validating"
                                                            }
                                                            className={cn(
                                                                "h-9 px-4",
                                                                validationStatus ===
                                                                    "success" &&
                                                                    "text-success border-success/30 bg-success-muted hover:bg-success-muted",
                                                            )}
                                                        >
                                                            {validationStatus ===
                                                            "validating" ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : validationStatus ===
                                                              "success" ? (
                                                                <>
                                                                    <Check className="h-4 w-4 mr-1.5" />
                                                                    {
                                                                        dict
                                                                            .modelConfig
                                                                            .verified
                                                                    }
                                                                </>
                                                            ) : (
                                                                dict.modelConfig
                                                                    .test
                                                            )}
                                                        </Button>
                                                        {validationStatus ===
                                                            "error" &&
                                                            validationError && (
                                                                <p className="text-xs text-destructive flex items-center gap-1">
                                                                    <X className="h-3 w-3" />
                                                                    {
                                                                        validationError
                                                                    }
                                                                </p>
                                                            )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* API Key */}
                                                    <div className="space-y-2">
                                                        <Label
                                                            htmlFor="api-key"
                                                            className="text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                                            {
                                                                dict.modelConfig
                                                                    .apiKey
                                                            }
                                                        </Label>
                                                        <div className="flex gap-2">
                                                            <div className="relative flex-1">
                                                                <Input
                                                                    id="api-key"
                                                                    type={
                                                                        showApiKey
                                                                            ? "text"
                                                                            : "password"
                                                                    }
                                                                    value={
                                                                        selectedProvider.apiKey
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        handleProviderUpdate(
                                                                            "apiKey",
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        )
                                                                    }
                                                                    placeholder={
                                                                        dict
                                                                            .modelConfig
                                                                            .enterApiKey
                                                                    }
                                                                    className="h-9 pr-10 font-mono text-xs"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setShowApiKey(
                                                                            !showApiKey,
                                                                        )
                                                                    }
                                                                    aria-label={
                                                                        showApiKey
                                                                            ? "Hide API key"
                                                                            : "Show API key"
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
                                                            <Button
                                                                variant={
                                                                    validationStatus ===
                                                                    "success"
                                                                        ? "outline"
                                                                        : "default"
                                                                }
                                                                size="sm"
                                                                onClick={
                                                                    handleValidate
                                                                }
                                                                disabled={
                                                                    !selectedProvider.apiKey ||
                                                                    validationStatus ===
                                                                        "validating"
                                                                }
                                                                className={cn(
                                                                    "h-9 px-4",
                                                                    validationStatus ===
                                                                        "success" &&
                                                                        "text-success border-success/30 bg-success-muted hover:bg-success-muted",
                                                                )}
                                                            >
                                                                {validationStatus ===
                                                                "validating" ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : validationStatus ===
                                                                  "success" ? (
                                                                    <>
                                                                        <Check className="h-4 w-4 mr-1.5 animate-check-pop" />
                                                                        {
                                                                            dict
                                                                                .modelConfig
                                                                                .verified
                                                                        }
                                                                    </>
                                                                ) : (
                                                                    dict
                                                                        .modelConfig
                                                                        .test
                                                                )}
                                                            </Button>
                                                        </div>
                                                        {validationStatus ===
                                                            "error" &&
                                                            validationError && (
                                                                <p className="text-xs text-destructive flex items-center gap-1">
                                                                    <X className="h-3 w-3" />
                                                                    {
                                                                        validationError
                                                                    }
                                                                </p>
                                                            )}
                                                    </div>

                                                    {/* Base URL */}
                                                    <div className="space-y-2">
                                                        <Label
                                                            htmlFor="base-url"
                                                            className="text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                            {formatMessage(
                                                                dict.modelConfig
                                                                    .baseUrlWithExample,
                                                                {
                                                                    example:
                                                                        PROVIDER_INFO[
                                                                            selectedProvider
                                                                                .provider
                                                                        ]
                                                                            .defaultBaseUrl ||
                                                                        "https://api.example.com/v1",
                                                                },
                                                            )}
                                                        </Label>
                                                        <Input
                                                            id="base-url"
                                                            value={
                                                                selectedProvider.baseUrl ||
                                                                ""
                                                            }
                                                            onChange={(e) =>
                                                                handleProviderUpdate(
                                                                    "baseUrl",
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder={
                                                                PROVIDER_INFO[
                                                                    selectedProvider
                                                                        .provider
                                                                ]
                                                                    .defaultBaseUrl ||
                                                                dict.modelConfig
                                                                    .customEndpoint
                                                            }
                                                            className="h-9 rounded-xl font-mono text-xs"
                                                        />
                                                    </div>
                                                </>
                                            )}
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
                                                        availableSuggestions.length ===
                                                        0
                                                    }
                                                >
                                                    <SelectTrigger className="w-28 h-8 rounded-lg hover:bg-interactive-hover">
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
                                                        <Sparkles className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {
                                                            dict.modelConfig
                                                                .noModelsConfigured
                                                        }
                                                    </p>
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
                                checked={modelConfig.showUnvalidatedModels}
                                onCheckedChange={
                                    modelConfig.setShowUnvalidatedModels
                                }
                            />
                            <Label className="text-xs text-muted-foreground cursor-pointer">
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
