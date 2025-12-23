"use client"

import { Bot, Check, ChevronDown, Server, Settings2 } from "lucide-react"
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
import { useDictionary } from "@/hooks/use-dictionary"
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
    gateway: "vercel",
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
    const dict = useDictionary()
    const [open, setOpen] = useState(false)
    // Only show validated models in the selector
    const validatedModels = useMemo(
        () => models.filter((m) => m.validated === true),
        [models],
    )
    const groupedModels = useMemo(
        () => groupModelsByProvider(validatedModels),
        [validatedModels],
    )

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
        ? `${selectedModel.modelId} ${dict.modelConfig.clickToChange}`
        : `${dict.modelConfig.usingServerDefault} ${dict.modelConfig.clickToChange}`

    return (
        <ModelSelectorRoot open={open} onOpenChange={setOpen}>
            <ModelSelectorTrigger asChild>
                <ButtonWithTooltip
                    tooltipContent={tooltipContent}
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="hover:bg-accent gap-1.5 h-8 max-w-[180px] px-2"
                >
                    <Bot className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span className="text-xs truncate">
                        {selectedModel
                            ? selectedModel.modelId
                            : dict.modelConfig.default}
                    </span>
                    <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                </ButtonWithTooltip>
            </ModelSelectorTrigger>
            <ModelSelectorContent title={dict.modelConfig.selectModel}>
                <ModelSelectorInput
                    placeholder={dict.modelConfig.searchModels}
                />
                <ModelSelectorList>
                    <ModelSelectorEmpty>
                        {validatedModels.length === 0 && models.length > 0
                            ? dict.modelConfig.noVerifiedModels
                            : dict.modelConfig.noModelsFound}
                    </ModelSelectorEmpty>

                    {/* Server Default Option */}
                    <ModelSelectorGroup heading={dict.modelConfig.default}>
                        <ModelSelectorItem
                            value="__server_default__"
                            onSelect={handleSelect}
                            className={cn(
                                "cursor-pointer",
                                !selectedModelId && "bg-accent",
                            )}
                        >
                            <Check
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    !selectedModelId
                                        ? "opacity-100"
                                        : "opacity-0",
                                )}
                            />
                            <Server className="mr-2 h-4 w-4 text-muted-foreground" />
                            <ModelSelectorName>
                                {dict.modelConfig.serverDefault}
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
                                {dict.modelConfig.configureModels}
                            </ModelSelectorName>
                        </ModelSelectorItem>
                    </ModelSelectorGroup>
                    {/* Info text */}
                    <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                        {dict.modelConfig.onlyVerifiedShown}
                    </div>
                </ModelSelectorList>
            </ModelSelectorContent>
        </ModelSelectorRoot>
    )
}
