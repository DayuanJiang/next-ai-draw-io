"use client"

import { Check, Eye, EyeOff, Loader2, Plus, Trash2, X } from "lucide-react"
import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
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
import type {
    ModelConfig,
    ProviderConfig,
    ProviderName,
} from "@/lib/types/model-config"
import { PROVIDER_INFO, SUGGESTED_MODELS } from "@/lib/types/model-config"

interface ModelConfigDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    modelConfig: UseModelConfigReturn
}

type ValidationStatus = "idle" | "validating" | "success" | "error"

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
    const [modelPopoverOpen, setModelPopoverOpen] = useState(false)
    const [modelSearchValue, setModelSearchValue] = useState("")

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

    // Get suggested models for current provider
    const suggestedModels = selectedProvider
        ? SUGGESTED_MODELS[selectedProvider.provider] || []
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
        // Reset validation when API key or base URL changes
        if (field === "apiKey" || field === "baseUrl") {
            setValidationStatus("idle")
            updateProvider(selectedProviderId, { validated: false })
        }
    }

    // Handle adding a model to current provider
    const handleAddModel = (modelId: string) => {
        if (!selectedProviderId) return
        addModel(selectedProviderId, modelId)
    }

    // Handle model field updates
    const handleModelUpdate = (
        modelConfigId: string,
        field: keyof ModelConfig,
        value: string | boolean,
    ) => {
        if (!selectedProviderId) return
        updateModel(selectedProviderId, modelConfigId, { [field]: value })
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
    }

    // Validate API key
    const handleValidate = useCallback(async () => {
        if (!selectedProvider || !selectedProvider.apiKey) return

        // Need at least one model to validate
        if (selectedProvider.models.length === 0) {
            setValidationError("Add at least one model to validate")
            setValidationStatus("error")
            return
        }

        setValidationStatus("validating")
        setValidationError("")

        try {
            const response = await fetch("/api/validate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: selectedProvider.provider,
                    apiKey: selectedProvider.apiKey,
                    baseUrl: selectedProvider.baseUrl,
                    modelId: selectedProvider.models[0].modelId,
                }),
            })

            const data = await response.json()

            if (data.valid) {
                setValidationStatus("success")
                updateProvider(selectedProviderId!, { validated: true })
            } else {
                setValidationStatus("error")
                setValidationError(data.error || "Validation failed")
            }
        } catch {
            setValidationStatus("error")
            setValidationError("Network error")
        }
    }, [selectedProvider, selectedProviderId, updateProvider])

    // Get all available provider types (allow duplicates for different base URLs)
    const availableProviders = Object.keys(PROVIDER_INFO) as ProviderName[]

    // Get display name for provider (use custom name if set)
    const getProviderDisplayName = (provider: ProviderConfig) => {
        return provider.name || PROVIDER_INFO[provider.provider].label
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {dict.modelConfig?.title || "AI Model Configuration"}
                    </DialogTitle>
                    <DialogDescription>
                        {dict.modelConfig?.description ||
                            "Configure multiple AI providers and models"}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
                    {/* Provider List (Left Sidebar) */}
                    <div className="w-48 flex-shrink-0 flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                            Providers
                        </Label>

                        <ScrollArea className="flex-1">
                            <div className="flex flex-col gap-1 pr-2">
                                {config.providers.map((provider) => (
                                    <button
                                        key={provider.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedProviderId(provider.id)
                                            setValidationStatus(
                                                provider.validated
                                                    ? "success"
                                                    : "idle",
                                            )
                                            setShowApiKey(false)
                                        }}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                                            selectedProviderId === provider.id
                                                ? "bg-accent text-accent-foreground"
                                                : "hover:bg-accent/50"
                                        }`}
                                    >
                                        <span className="flex-1 truncate">
                                            {getProviderDisplayName(provider)}
                                        </span>
                                        {provider.validated && (
                                            <Check className="h-3.5 w-3.5 text-green-500" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>

                        {/* Add Provider */}
                        {availableProviders.length > 0 && (
                            <Select
                                onValueChange={(v) =>
                                    handleAddProvider(v as ProviderName)
                                }
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                    <SelectValue placeholder="Add Provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableProviders.map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {PROVIDER_INFO[p].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Provider Details (Right Panel) */}
                    <ScrollArea className="flex-1">
                        {selectedProvider ? (
                            <div className="space-y-4 pr-3">
                                {/* Provider Header */}
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium">
                                        {
                                            PROVIDER_INFO[
                                                selectedProvider.provider
                                            ].label
                                        }
                                    </h3>
                                </div>

                                {/* Provider Name */}
                                <div className="space-y-2">
                                    <Label htmlFor="provider-name">
                                        Display Name
                                    </Label>
                                    <Input
                                        id="provider-name"
                                        value={selectedProvider.name || ""}
                                        onChange={(e) =>
                                            handleProviderUpdate(
                                                "name",
                                                e.target.value,
                                            )
                                        }
                                        placeholder={
                                            PROVIDER_INFO[
                                                selectedProvider.provider
                                            ].label
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Custom name to identify this provider
                                        (e.g., &quot;OpenAI Production&quot;)
                                    </p>
                                </div>

                                {/* API Key */}
                                <div className="space-y-2">
                                    <Label htmlFor="api-key">API Key</Label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Input
                                                id="api-key"
                                                type={
                                                    showApiKey
                                                        ? "text"
                                                        : "password"
                                                }
                                                value={selectedProvider.apiKey}
                                                onChange={(e) =>
                                                    handleProviderUpdate(
                                                        "apiKey",
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Enter API key"
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowApiKey(!showApiKey)
                                                }
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            >
                                                {showApiKey ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleValidate}
                                            disabled={
                                                !selectedProvider.apiKey ||
                                                validationStatus ===
                                                    "validating"
                                            }
                                        >
                                            {validationStatus ===
                                            "validating" ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : validationStatus ===
                                              "success" ? (
                                                <Check className="h-4 w-4 text-green-500" />
                                            ) : (
                                                "Test"
                                            )}
                                        </Button>
                                    </div>
                                    {validationStatus === "error" &&
                                        validationError && (
                                            <p className="text-xs text-destructive">
                                                {validationError}
                                            </p>
                                        )}
                                </div>

                                {/* Base URL */}
                                <div className="space-y-2">
                                    <Label htmlFor="base-url">
                                        Base URL (optional)
                                    </Label>
                                    <Input
                                        id="base-url"
                                        value={selectedProvider.baseUrl || ""}
                                        onChange={(e) =>
                                            handleProviderUpdate(
                                                "baseUrl",
                                                e.target.value,
                                            )
                                        }
                                        placeholder={
                                            PROVIDER_INFO[
                                                selectedProvider.provider
                                            ].defaultBaseUrl ||
                                            "Custom endpoint URL"
                                        }
                                    />
                                </div>

                                {/* Models Section */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Models</Label>
                                        <Popover
                                            open={modelPopoverOpen}
                                            onOpenChange={(open) => {
                                                setModelPopoverOpen(open)
                                                if (!open)
                                                    setModelSearchValue("")
                                            }}
                                        >
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Add Model
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent
                                                className="w-72 p-0 z-[60]"
                                                align="end"
                                            >
                                                <Command shouldFilter={true}>
                                                    <CommandInput
                                                        placeholder="Search or type custom model..."
                                                        value={modelSearchValue}
                                                        onValueChange={
                                                            setModelSearchValue
                                                        }
                                                    />
                                                    <CommandList>
                                                        <CommandEmpty>
                                                            <span className="text-muted-foreground">
                                                                {modelSearchValue.trim()
                                                                    ? "Press Enter to add custom model"
                                                                    : "Type a model ID..."}
                                                            </span>
                                                        </CommandEmpty>
                                                        {/* Custom model option - appears when search doesn't match suggestions */}
                                                        {modelSearchValue.trim() &&
                                                            !suggestedModels.some(
                                                                (m) =>
                                                                    m
                                                                        .toLowerCase()
                                                                        .includes(
                                                                            modelSearchValue.toLowerCase(),
                                                                        ),
                                                            ) && (
                                                                <CommandGroup heading="Custom">
                                                                    <CommandItem
                                                                        value={`custom-${modelSearchValue.trim()}`}
                                                                        onSelect={() => {
                                                                            handleAddModel(
                                                                                modelSearchValue.trim(),
                                                                            )
                                                                            setModelSearchValue(
                                                                                "",
                                                                            )
                                                                            setModelPopoverOpen(
                                                                                false,
                                                                            )
                                                                        }}
                                                                        className="text-xs cursor-pointer"
                                                                    >
                                                                        Add
                                                                        &quot;
                                                                        {modelSearchValue.trim()}
                                                                        &quot;
                                                                    </CommandItem>
                                                                </CommandGroup>
                                                            )}
                                                        <CommandGroup heading="Suggested">
                                                            {suggestedModels.map(
                                                                (modelId) => (
                                                                    <CommandItem
                                                                        key={
                                                                            modelId
                                                                        }
                                                                        value={
                                                                            modelId
                                                                        }
                                                                        onSelect={() => {
                                                                            handleAddModel(
                                                                                modelId,
                                                                            )
                                                                            setModelSearchValue(
                                                                                "",
                                                                            )
                                                                            setModelPopoverOpen(
                                                                                false,
                                                                            )
                                                                        }}
                                                                        className="text-xs cursor-pointer"
                                                                    >
                                                                        {
                                                                            modelId
                                                                        }
                                                                    </CommandItem>
                                                                ),
                                                            )}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Model List */}
                                    <div className="space-y-2">
                                        {selectedProvider.models.length ===
                                        0 ? (
                                            <p className="text-sm text-muted-foreground py-4 text-center">
                                                No models configured. Add a
                                                model to get started.
                                            </p>
                                        ) : (
                                            selectedProvider.models.map(
                                                (model) => (
                                                    <div
                                                        key={model.id}
                                                        className="flex items-center gap-2 p-2 rounded-md border bg-card"
                                                    >
                                                        <Input
                                                            value={
                                                                model.modelId
                                                            }
                                                            onChange={(e) =>
                                                                handleModelUpdate(
                                                                    model.id,
                                                                    "modelId",
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="Model ID (e.g., gpt-4o)"
                                                            className="h-8 text-xs flex-1"
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <Switch
                                                                checked={
                                                                    model.streaming !==
                                                                    false
                                                                }
                                                                onCheckedChange={(
                                                                    checked,
                                                                ) =>
                                                                    handleModelUpdate(
                                                                        model.id,
                                                                        "streaming",
                                                                        checked,
                                                                    )
                                                                }
                                                            />
                                                            <span className="text-xs text-muted-foreground w-12">
                                                                Stream
                                                            </span>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7"
                                                                onClick={() =>
                                                                    handleDeleteModel(
                                                                        model.id,
                                                                    )
                                                                }
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ),
                                            )
                                        )}
                                    </div>
                                </div>

                                {/* Delete Provider */}
                                <div className="pt-4 border-t">
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleDeleteProvider}
                                        className="w-full"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Provider
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                                <p className="mb-2">
                                    Select a provider or add a new one
                                </p>
                                <p className="text-xs">
                                    Configure multiple AI providers and switch
                                    between them easily
                                </p>
                            </div>
                        )}
                    </ScrollArea>
                </div>

                {/* Footer */}
                <div className="pt-4 border-t text-xs text-muted-foreground text-center">
                    API keys are stored locally in your browser
                </div>
            </DialogContent>
        </Dialog>
    )
}
