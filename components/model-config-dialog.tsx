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
import { toast } from "sonner"
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
import { useDictionary } from "@/hooks/use-dictionary"
import type { UseModelConfigReturn } from "@/hooks/use-model-config"
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
    gateway: "vercel",
}

// Provider logo component
function ProviderLogo({
    provider,
    className,
}: {
    provider: ProviderName
    className?: string
}) {
    // Use Lucide icon for bedrock since models.dev doesn't have a good AWS icon
    if (provider === "bedrock") {
        return <Cloud className={cn("size-4", className)} />
    }

    const logoName = PROVIDER_LOGO_MAP[provider] || provider
    return (
        <img
            alt={`${provider} logo`}
            className={cn("size-4 dark:invert", className)}
            height={16}
            src={`https://models.dev/logos/${logoName}.svg`}
            width={16}
        />
    )
}

// Reusable validation button component
function ValidationButton({
    status,
    onClick,
    disabled,
}: {
    status: ValidationStatus
    onClick: () => void
    disabled: boolean
}) {
    return (
        <Button
            variant={status === "success" ? "outline" : "default"}
            size="sm"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "h-9 px-4 min-w-[80px]",
                status === "success" &&
                    "text-emerald-600 border-emerald-200 dark:border-emerald-800",
            )}
        >
            {status === "validating" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === "success" ? (
                <>
                    <Check className="h-4 w-4 mr-1.5" />
                    Verified
                </>
            ) : (
                "Test"
            )}
        </Button>
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
    const [scrollState, setScrollState] = useState({ top: false, bottom: true })
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

    // Track scroll position for gradient shadows
    useEffect(() => {
        const scrollEl = scrollRef.current?.querySelector(
            "[data-radix-scroll-area-viewport]",
        ) as HTMLElement | null
        if (!scrollEl) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = scrollEl
            setScrollState({
                top: scrollTop > 10,
                bottom: scrollTop < scrollHeight - clientHeight - 10,
            })
        }

        handleScroll() // Initial check
        scrollEl.addEventListener("scroll", handleScroll)
        return () => scrollEl.removeEventListener("scroll", handleScroll)
    }, [selectedProvider])

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
        if (!selectedProvider) return

        // Check credentials based on provider type
        const isBedrock = selectedProvider.provider === "bedrock"
        if (isBedrock) {
            if (
                !selectedProvider.awsAccessKeyId ||
                !selectedProvider.awsSecretAccessKey ||
                !selectedProvider.awsRegion
            ) {
                return
            }
        } else if (!selectedProvider.apiKey) {
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
                const response = await fetch("/api/validate-model", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        provider: selectedProvider.provider,
                        apiKey: selectedProvider.apiKey,
                        baseUrl: selectedProvider.baseUrl,
                        modelId: model.modelId,
                        // AWS Bedrock credentials
                        awsAccessKeyId: selectedProvider.awsAccessKeyId,
                        awsSecretAccessKey: selectedProvider.awsSecretAccessKey,
                        awsRegion: selectedProvider.awsRegion,
                    }),
                })

                const data = await response.json()

                if (data.valid) {
                    updateModel(selectedProviderId!, model.id, {
                        validated: true,
                        validationError: undefined,
                    })
                } else {
                    allValid = false
                    errorCount++
                    updateModel(selectedProviderId!, model.id, {
                        validated: false,
                        validationError: data.error || "Validation failed",
                    })
                }
            } catch {
                allValid = false
                errorCount++
                updateModel(selectedProviderId!, model.id, {
                    validated: false,
                    validationError: "Network error",
                })
            }
        }

        setValidatingModelIndex(null)

        if (allValid) {
            setValidationStatus("success")
            updateProvider(selectedProviderId!, { validated: true })
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
            <DialogContent className="sm:max-w-3xl h-[75vh] max-h-[700px] overflow-hidden flex flex-col gap-0 p-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-primary/5 via-primary/3 to-transparent">
                    <DialogTitle className="flex items-center gap-2.5 text-xl font-semibold">
                        <div className="p-1.5 rounded-lg bg-primary/10">
                            <Server className="h-5 w-5 text-primary" />
                        </div>
                        {dict.modelConfig?.title || "AI Model Configuration"}
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                        {dict.modelConfig?.description ||
                            "Configure multiple AI providers and models for your workspace"}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Provider List (Left Sidebar) */}
                    <div className="w-56 flex-shrink-0 flex flex-col border-r bg-muted/20">
                        <div className="px-4 py-3 border-b">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Providers
                            </span>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-2">
                                {config.providers.length === 0 ? (
                                    <div className="px-3 py-8 text-center">
                                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted mb-3">
                                            <Plus className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Add a provider to get started
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {config.providers.map((provider) => (
                                            <button
                                                key={provider.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedProviderId(
                                                        provider.id,
                                                    )
                                                    setValidationStatus(
                                                        provider.validated
                                                            ? "success"
                                                            : "idle",
                                                    )
                                                    setShowApiKey(false)
                                                }}
                                                className={cn(
                                                    "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                                    selectedProviderId ===
                                                        provider.id &&
                                                        "bg-background shadow-sm ring-1 ring-border",
                                                )}
                                            >
                                                <ProviderLogo
                                                    provider={provider.provider}
                                                    className="flex-shrink-0"
                                                />
                                                <span className="flex-1 truncate font-medium">
                                                    {getProviderDisplayName(
                                                        provider,
                                                    )}
                                                </span>
                                                {provider.validated ? (
                                                    <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10">
                                                        <Check className="h-3 w-3 text-emerald-500" />
                                                    </div>
                                                ) : (
                                                    <ChevronRight
                                                        className={cn(
                                                            "h-4 w-4 text-muted-foreground/50 transition-transform",
                                                            selectedProviderId ===
                                                                provider.id &&
                                                                "translate-x-0.5",
                                                        )}
                                                    />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        {/* Add Provider */}
                        <div className="p-2 border-t">
                            <Select
                                onValueChange={(v) =>
                                    handleAddProvider(v as ProviderName)
                                }
                            >
                                <SelectTrigger className="h-9 bg-background hover:bg-accent">
                                    <Plus className="h-4 w-4 mr-2 text-muted-foreground" />
                                    <SelectValue placeholder="Add Provider" />
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
                    <div className="flex-1 min-w-0 overflow-hidden relative">
                        {selectedProvider ? (
                            <>
                                {/* Top gradient shadow */}
                                <div
                                    className={cn(
                                        "absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
                                        scrollState.top
                                            ? "opacity-100"
                                            : "opacity-0",
                                    )}
                                />
                                {/* Bottom gradient shadow */}
                                <div
                                    className={cn(
                                        "absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
                                        scrollState.bottom
                                            ? "opacity-100"
                                            : "opacity-0",
                                    )}
                                />
                                <ScrollArea className="h-full" ref={scrollRef}>
                                    <div className="p-6 space-y-6">
                                        {/* Provider Header */}
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                                                <ProviderLogo
                                                    provider={
                                                        selectedProvider.provider
                                                    }
                                                    className="h-5 w-5"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-base">
                                                    {
                                                        PROVIDER_INFO[
                                                            selectedProvider
                                                                .provider
                                                        ].label
                                                    }
                                                </h3>
                                                <p className="text-xs text-muted-foreground">
                                                    {selectedProvider.models
                                                        .length === 0
                                                        ? "No models configured"
                                                        : `${selectedProvider.models.length} model${selectedProvider.models.length > 1 ? "s" : ""} configured`}
                                                </p>
                                            </div>
                                            {selectedProvider.validated && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                                    <Check className="h-3.5 w-3.5" />
                                                    <span className="text-xs font-medium">
                                                        Verified
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Configuration Section */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                <Settings2 className="h-4 w-4" />
                                                <span>Configuration</span>
                                            </div>

                                            <div className="rounded-xl border bg-card p-4 space-y-4">
                                                {/* Display Name */}
                                                <div className="space-y-2">
                                                    <Label
                                                        htmlFor="provider-name"
                                                        className="text-xs font-medium flex items-center gap-1.5"
                                                    >
                                                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                                        Display Name
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
                                                                AWS Access Key
                                                                ID
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
                                                                AWS Secret
                                                                Access Key
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
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        handleProviderUpdate(
                                                                            "awsSecretAccessKey",
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        )
                                                                    }
                                                                    placeholder="Enter your secret access key"
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
                                                                AWS Region
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
                                                                    <SelectValue placeholder="Select region" />
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
                                                                        (São
                                                                        Paulo)
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
                                                                        "text-emerald-600 border-emerald-200 dark:border-emerald-800",
                                                                )}
                                                            >
                                                                {validationStatus ===
                                                                "validating" ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : validationStatus ===
                                                                  "success" ? (
                                                                    <>
                                                                        <Check className="h-4 w-4 mr-1.5" />
                                                                        Verified
                                                                    </>
                                                                ) : (
                                                                    "Test"
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
                                                ) : (
                                                    <>
                                                        {/* API Key */}
                                                        <div className="space-y-2">
                                                            <Label
                                                                htmlFor="api-key"
                                                                className="text-xs font-medium flex items-center gap-1.5"
                                                            >
                                                                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                                                API Key
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
                                                                        placeholder="Enter your API key"
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
                                                                            "text-emerald-600 border-emerald-200 dark:border-emerald-800",
                                                                    )}
                                                                >
                                                                    {validationStatus ===
                                                                    "validating" ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : validationStatus ===
                                                                      "success" ? (
                                                                        <>
                                                                            <Check className="h-4 w-4 mr-1.5" />
                                                                            Verified
                                                                        </>
                                                                    ) : (
                                                                        "Test"
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
                                                                Base URL
                                                                <span className="text-muted-foreground font-normal">
                                                                    (optional)
                                                                </span>
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
                                                                    "Custom endpoint URL"
                                                                }
                                                                className="h-9 font-mono text-xs"
                                                            />
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Models Section */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                    <Sparkles className="h-4 w-4" />
                                                    <span>Models</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="relative">
                                                        <Input
                                                            placeholder="Custom model ID..."
                                                            value={
                                                                customModelInput
                                                            }
                                                            onChange={(e) => {
                                                                setCustomModelInput(
                                                                    e.target
                                                                        .value,
                                                                )
                                                                // Clear duplicate error when typing
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
                                                                    if (
                                                                        success
                                                                    ) {
                                                                        setCustomModelInput(
                                                                            "",
                                                                        )
                                                                    }
                                                                }
                                                            }}
                                                            className={cn(
                                                                "h-8 w-48 font-mono text-xs",
                                                                duplicateError &&
                                                                    "border-destructive focus-visible:ring-destructive",
                                                            )}
                                                        />
                                                        {/* Show duplicate error for custom model input */}
                                                        {duplicateError && (
                                                            <p className="absolute top-full left-0 mt-1 text-[11px] text-destructive">
                                                                {duplicateError}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8"
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
                                                        onValueChange={(
                                                            value,
                                                        ) => {
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
                                                        <SelectTrigger className="w-32 h-8 hover:bg-accent">
                                                            <span className="text-xs">
                                                                {availableSuggestions.length ===
                                                                0
                                                                    ? "All added"
                                                                    : "Suggested"}
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
                                                                        {
                                                                            modelId
                                                                        }
                                                                    </SelectItem>
                                                                ),
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            {/* Model List */}
                                            <div className="rounded-xl border bg-card overflow-hidden min-h-[120px]">
                                                {selectedProvider.models
                                                    .length === 0 ? (
                                                    <div className="p-4 text-center h-full flex flex-col items-center justify-center">
                                                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted mb-2">
                                                            <Sparkles className="h-5 w-5 text-muted-foreground" />
                                                        </div>
                                                        <p className="text-sm text-muted-foreground">
                                                            No models configured
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y">
                                                        {selectedProvider.models.map(
                                                            (model, index) => (
                                                                <div
                                                                    key={
                                                                        model.id
                                                                    }
                                                                    className={cn(
                                                                        "transition-colors hover:bg-muted/30",
                                                                        index ===
                                                                            0 &&
                                                                            "rounded-t-xl",
                                                                        index ===
                                                                            selectedProvider
                                                                                .models
                                                                                .length -
                                                                                1 &&
                                                                            "rounded-b-xl",
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
                                                                                <div className="w-full h-full rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                                                    <Check className="h-4 w-4 text-emerald-500" />
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
                                                                                updateModel(
                                                                                    selectedProviderId!,
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
                                                                                        "Model ID cannot be empty",
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
                                                                                        "This model ID already exists",
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
                                        </div>

                                        {/* Danger Zone */}
                                        <div className="pt-4">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    setDeleteConfirmOpen(true)
                                                }
                                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete Provider
                                            </Button>
                                        </div>
                                    </div>
                                </ScrollArea>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 mb-4">
                                    <Server className="h-8 w-8 text-primary/60" />
                                </div>
                                <h3 className="font-semibold mb-1">
                                    Configure AI Providers
                                </h3>
                                <p className="text-sm text-muted-foreground max-w-xs">
                                    Select a provider from the list or add a new
                                    one to configure API keys and models
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t bg-muted/20">
                    <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                        <Key className="h-3 w-3" />
                        API keys are stored locally in your browser
                    </p>
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
                            Delete Provider
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center">
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-foreground">
                                {selectedProvider
                                    ? selectedProvider.name ||
                                      PROVIDER_INFO[selectedProvider.provider]
                                          .label
                                    : "this provider"}
                            </span>
                            ? This will remove all configured models and cannot
                            be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {selectedProvider &&
                        selectedProvider.models.length >= 3 && (
                            <div className="mt-2 space-y-2">
                                <Label
                                    htmlFor="delete-confirm"
                                    className="text-sm text-muted-foreground"
                                >
                                    Type &quot;
                                    {selectedProvider.name ||
                                        PROVIDER_INFO[selectedProvider.provider]
                                            .label}
                                    &quot; to confirm
                                </Label>
                                <Input
                                    id="delete-confirm"
                                    value={deleteConfirmText}
                                    onChange={(e) =>
                                        setDeleteConfirmText(e.target.value)
                                    }
                                    placeholder="Type provider name..."
                                    className="h-9"
                                />
                            </div>
                        )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
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
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    )
}
