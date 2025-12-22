"use client"

import { Bot, Check, Settings2 } from "lucide-react"
import { useMemo, useState } from "react"
import {
    ModelSelectorContent,
    ModelSelectorEmpty,
    ModelSelectorGroup,
    ModelSelectorInput,
    ModelSelectorItem,
    ModelSelectorList,
    ModelSelectorLogo,
    ModelSelectorName,
    ModelSelector as ModelSelectorRoot,
    ModelSelectorSeparator,
    ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import { ButtonWithTooltip } from "@/components/button-with-tooltip"
import type { FlattenedModel } from "@/lib/types/model-config"
import { cn } from "@/lib/utils"

interface ModelSelectorProps {
    models: FlattenedModel[]
    selectedModelId: string | undefined
    onSelect: (modelId: string | undefined) => void
    onConfigure: () => void
    disabled?: boolean
}

// Map our provider names to models.dev logo names
const PROVIDER_LOGO_MAP: Record<string, string> = {
    openai: "openai",
    anthropic: "anthropic",
    google: "google",
    azure: "azure",
    bedrock: "amazon-bedrock",
    openrouter: "openrouter",
    deepseek: "deepseek",
    siliconflow: "siliconflow",
    ollama: "ollama",
    gateway: "openai", // fallback
}

// Group models by providerLabel (handles duplicate providers)
function groupModelsByProvider(
    models: FlattenedModel[],
): Map<string, { provider: string; models: FlattenedModel[] }> {
    const groups = new Map<
        string,
        { provider: string; models: FlattenedModel[] }
    >()
    for (const model of models) {
        const key = model.providerLabel
        const existing = groups.get(key)
        if (existing) {
            existing.models.push(model)
        } else {
            groups.set(key, { provider: model.provider, models: [model] })
        }
    }
    return groups
}

export function ModelSelector({
    models,
    selectedModelId,
    onSelect,
    onConfigure,
    disabled = false,
}: ModelSelectorProps) {
    const [open, setOpen] = useState(false)
    const groupedModels = useMemo(() => groupModelsByProvider(models), [models])

    // Find selected model for display
    const selectedModel = useMemo(
        () => models.find((m) => m.id === selectedModelId),
        [models, selectedModelId],
    )

    const handleSelect = (value: string) => {
        if (value === "__configure__") {
            onConfigure()
        } else if (value === "__server_default__") {
            onSelect(undefined)
        } else {
            onSelect(value)
        }
        setOpen(false)
    }

    const tooltipContent = selectedModel
        ? `Model: ${selectedModel.modelId}`
        : "Model: Server Default"

    return (
        <ModelSelectorRoot open={open} onOpenChange={setOpen}>
            <ModelSelectorTrigger asChild>
                <ButtonWithTooltip
                    tooltipContent={tooltipContent}
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    className="hover:bg-accent"
                >
                    <Bot className="h-5 w-5 text-muted-foreground" />
                </ButtonWithTooltip>
            </ModelSelectorTrigger>
            <ModelSelectorContent title="Select Model">
                <ModelSelectorInput placeholder="Search models..." />
                <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>

                    {/* Server Default Option */}
                    <ModelSelectorGroup>
                        <ModelSelectorItem
                            value="__server_default__"
                            onSelect={handleSelect}
                            className="cursor-pointer"
                        >
                            <Check
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    !selectedModelId
                                        ? "opacity-100"
                                        : "opacity-0",
                                )}
                            />
                            <ModelSelectorName className="text-muted-foreground">
                                Server Default
                            </ModelSelectorName>
                        </ModelSelectorItem>
                    </ModelSelectorGroup>

                    {/* Configured Models by Provider */}
                    {Array.from(groupedModels.entries()).map(
                        ([
                            providerLabel,
                            { provider, models: providerModels },
                        ]) => (
                            <ModelSelectorGroup
                                key={providerLabel}
                                heading={providerLabel}
                            >
                                {providerModels.map((model) => (
                                    <ModelSelectorItem
                                        key={model.id}
                                        value={model.modelId}
                                        onSelect={() => handleSelect(model.id)}
                                        className="cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedModelId === model.id
                                                    ? "opacity-100"
                                                    : "opacity-0",
                                            )}
                                        />
                                        <ModelSelectorLogo
                                            provider={
                                                PROVIDER_LOGO_MAP[provider] ||
                                                provider
                                            }
                                            className="mr-2"
                                        />
                                        <ModelSelectorName>
                                            {model.modelId}
                                        </ModelSelectorName>
                                    </ModelSelectorItem>
                                ))}
                            </ModelSelectorGroup>
                        ),
                    )}

                    {/* Configure Option */}
                    <ModelSelectorSeparator />
                    <ModelSelectorGroup>
                        <ModelSelectorItem
                            value="__configure__"
                            onSelect={handleSelect}
                            className="cursor-pointer"
                        >
                            <Settings2 className="mr-2 h-4 w-4" />
                            <ModelSelectorName>
                                Configure Models...
                            </ModelSelectorName>
                        </ModelSelectorItem>
                    </ModelSelectorGroup>
                </ModelSelectorList>
            </ModelSelectorContent>
        </ModelSelectorRoot>
    )
}
