"use client"

import {
    AlertTriangle,
    Bot,
    Check,
    ChevronDown,
    Monitor,
    Server,
    Settings2,
    User,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
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
    ModelSelectorSectionHeader,
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
    onConfigure?: () => void
    disabled?: boolean
    showUnvalidatedModels?: boolean
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
    sglang: "openai", // SGLang is OpenAI-compatible, use OpenAI logo
    gateway: "vercel",
    edgeone: "tencent-cloud",
    vertexai: "google",
    doubao: "bytedance",
    modelscope: "modelscope",
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
        // For server models, strip "Server · " prefix for cleaner grouping
        const key =
            model.source === "server"
                ? model.providerLabel.replace(/^Server · /, "")
                : model.providerLabel
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
    showUnvalidatedModels = false,
}: ModelSelectorProps) {
    const dict = useDictionary()
    const [open, setOpen] = useState(false)
    // Filter models based on showUnvalidatedModels setting
    const displayModels = useMemo(() => {
        if (showUnvalidatedModels) {
            return models
        }
        return models.filter((m) => m.validated === true)
    }, [models, showUnvalidatedModels])

    // Separate server and user models
    const serverModels = useMemo(
        () => displayModels.filter((m) => m.source === "server"),
        [displayModels],
    )
    const userModels = useMemo(
        () => displayModels.filter((m) => m.source !== "server"),
        [displayModels],
    )

    // Group each category separately
    const groupedServerModels = useMemo(
        () => groupModelsByProvider(serverModels),
        [serverModels],
    )
    const groupedUserModels = useMemo(
        () => groupModelsByProvider(userModels),
        [userModels],
    )

    // Find selected model for display
    const selectedModel = useMemo(
        () => models.find((m) => m.id === selectedModelId),
        [models, selectedModelId],
    )

    const handleSelect = (value: string) => {
        if (value === "__server_default__") {
            onSelect(undefined)
        } else {
            onSelect(value)
        }
        setOpen(false)
    }

    const tooltipContent = selectedModel
        ? `${selectedModel.modelId} ${dict.modelConfig.clickToChange}`
        : `${dict.modelConfig.usingServerDefault} ${dict.modelConfig.clickToChange}`

    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const [showLabel, setShowLabel] = useState(true)

    // Threshold (px) under which we hide the label (tweak as needed)
    const HIDE_THRESHOLD = 240
    const SHOW_THRESHOLD = 260
    useEffect(() => {
        const el = wrapperRef.current
        if (!el) return

        const target = el.parentElement ?? el

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width
                setShowLabel((prev) => {
                    // if currently showing and width dropped below hide threshold -> hide
                    if (prev && width <= HIDE_THRESHOLD) return false
                    // if currently hidden and width rose above show threshold -> show
                    if (!prev && width >= SHOW_THRESHOLD) return true
                    // otherwise keep previous state (hysteresis)
                    return prev
                })
            }
        })

        ro.observe(target)

        const initialWidth = target.getBoundingClientRect().width
        setShowLabel(initialWidth >= SHOW_THRESHOLD)

        return () => ro.disconnect()
    }, [])

    return (
        <div ref={wrapperRef} className="inline-block">
            <ModelSelectorRoot open={open} onOpenChange={setOpen}>
                <ModelSelectorTrigger asChild>
                    <ButtonWithTooltip
                        tooltipContent={tooltipContent}
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        className={cn(
                            "hover:bg-accent gap-1.5 h-8 px-2 transition-[padding,background-color] duration-150 ease-in-out",
                            !showLabel && "px-1.5 justify-center",
                        )}
                        // accessibility: expose label to screen readers
                        aria-label={tooltipContent}
                    >
                        <Bot className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        {/* show/hide visible label based on measured width */}
                        {showLabel ? (
                            <span className="text-xs truncate">
                                {selectedModel
                                    ? selectedModel.modelId
                                    : dict.modelConfig.default}
                            </span>
                        ) : (
                            // Keep an sr-only label for screen readers when hidden
                            <span className="sr-only">
                                {selectedModel
                                    ? selectedModel.modelId
                                    : dict.modelConfig.default}
                            </span>
                        )}
                        <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    </ButtonWithTooltip>
                </ModelSelectorTrigger>

                <ModelSelectorContent title={dict.modelConfig.selectModel}>
                    <ModelSelectorInput
                        placeholder={dict.modelConfig.searchModels}
                    />
                    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <ModelSelectorList className="[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                <ModelSelectorEmpty>
                                    {displayModels.length === 0 &&
                                    models.length > 0
                                        ? dict.modelConfig.noVerifiedModels
                                        : dict.modelConfig.noModelsFound}
                                </ModelSelectorEmpty>

                                {/* Server Default Option - only show when no server models are configured */}
                                {serverModels.length === 0 && (
                                    <ModelSelectorGroup
                                        heading={dict.modelConfig.default}
                                    >
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
                                )}

                                {/* Server Models Section */}
                                {serverModels.length > 0 && (
                                    <>
                                        <ModelSelectorSectionHeader
                                            icon={<Monitor />}
                                            label={
                                                dict.modelConfig.serverModels
                                            }
                                        />
                                        {Array.from(
                                            groupedServerModels.entries(),
                                        ).map(
                                            ([
                                                providerLabel,
                                                {
                                                    provider,
                                                    models: providerModels,
                                                },
                                            ]) => (
                                                <ModelSelectorGroup
                                                    key={`server-${providerLabel}`}
                                                    heading={providerLabel}
                                                    className="[&>[cmdk-group-heading]]:pl-4"
                                                >
                                                    {providerModels.map(
                                                        (model) => (
                                                            <ModelSelectorItem
                                                                key={model.id}
                                                                value={
                                                                    model.modelId
                                                                }
                                                                onSelect={() =>
                                                                    handleSelect(
                                                                        model.id,
                                                                    )
                                                                }
                                                                className="cursor-pointer"
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        selectedModelId ===
                                                                            model.id
                                                                            ? "opacity-100"
                                                                            : "opacity-0",
                                                                    )}
                                                                />
                                                                <ModelSelectorLogo
                                                                    provider={
                                                                        PROVIDER_LOGO_MAP[
                                                                            provider
                                                                        ] ||
                                                                        provider
                                                                    }
                                                                    className="mr-2"
                                                                />
                                                                <ModelSelectorName>
                                                                    {
                                                                        model.modelId
                                                                    }
                                                                </ModelSelectorName>
                                                                {model.isDefault && (
                                                                    <span
                                                                        title={
                                                                            dict
                                                                                .modelConfig
                                                                                .serverDefaultModel
                                                                        }
                                                                        className="ml-auto text-xs text-muted-foreground"
                                                                    >
                                                                        {
                                                                            dict
                                                                                .modelConfig
                                                                                .default
                                                                        }
                                                                    </span>
                                                                )}
                                                            </ModelSelectorItem>
                                                        ),
                                                    )}
                                                </ModelSelectorGroup>
                                            ),
                                        )}
                                    </>
                                )}

                                {/* User Models Section */}
                                {userModels.length > 0 && (
                                    <>
                                        {serverModels.length > 0 && (
                                            <ModelSelectorSeparator />
                                        )}
                                        <ModelSelectorSectionHeader
                                            icon={<User />}
                                            label={dict.modelConfig.userModels}
                                        />
                                        {Array.from(
                                            groupedUserModels.entries(),
                                        ).map(
                                            ([
                                                providerLabel,
                                                {
                                                    provider,
                                                    models: providerModels,
                                                },
                                            ]) => (
                                                <ModelSelectorGroup
                                                    key={`user-${providerLabel}`}
                                                    heading={providerLabel}
                                                    className="[&>[cmdk-group-heading]]:pl-4"
                                                >
                                                    {providerModels.map(
                                                        (model) => (
                                                            <ModelSelectorItem
                                                                key={model.id}
                                                                value={
                                                                    model.modelId
                                                                }
                                                                onSelect={() =>
                                                                    handleSelect(
                                                                        model.id,
                                                                    )
                                                                }
                                                                className="cursor-pointer"
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        selectedModelId ===
                                                                            model.id
                                                                            ? "opacity-100"
                                                                            : "opacity-0",
                                                                    )}
                                                                />
                                                                <ModelSelectorLogo
                                                                    provider={
                                                                        PROVIDER_LOGO_MAP[
                                                                            provider
                                                                        ] ||
                                                                        provider
                                                                    }
                                                                    className="mr-2"
                                                                />
                                                                <ModelSelectorName>
                                                                    {
                                                                        model.modelId
                                                                    }
                                                                </ModelSelectorName>
                                                                {model.validated !==
                                                                    true && (
                                                                    <span
                                                                        title={
                                                                            dict
                                                                                .modelConfig
                                                                                .unvalidatedModelWarning
                                                                        }
                                                                    >
                                                                        <AlertTriangle className="ml-auto h-3 w-3 text-warning" />
                                                                    </span>
                                                                )}
                                                            </ModelSelectorItem>
                                                        ),
                                                    )}
                                                </ModelSelectorGroup>
                                            ),
                                        )}
                                    </>
                                )}
                            </ModelSelectorList>
                        </div>
                        {/* Pinned footer: Configure Models... + info text (z-10 above list shadow) */}
                        <div className="relative z-10 shrink-0 border-t bg-background">
                            {onConfigure && (
                                <div className="px-3 py-2">
                                    <ModelSelectorItem
                                        value="__configure_models__"
                                        onSelect={() => {
                                            onConfigure()
                                            setOpen(false)
                                        }}
                                        className="flex cursor-pointer items-center gap-2 rounded-sm"
                                    >
                                        <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <ModelSelectorName>
                                            {dict.modelConfig.configureModels}
                                        </ModelSelectorName>
                                    </ModelSelectorItem>
                                </div>
                            )}
                            <div className="px-3 pb-2 text-xs text-muted-foreground">
                                {showUnvalidatedModels
                                    ? dict.modelConfig.allModelsShown
                                    : dict.modelConfig.onlyVerifiedShown}
                            </div>
                        </div>
                    </div>
                </ModelSelectorContent>
            </ModelSelectorRoot>
        </div>
    )
}
