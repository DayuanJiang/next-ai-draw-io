"use client"

import {
    Bot,
    Check,
    ChevronDown,
    Monitor,
    Plus,
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
import { ProviderLogo } from "@/components/provider-logo"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    type FlattenedModel,
    PROVIDER_LOGO_MAP,
} from "@/lib/types/model-config"
import { cn } from "@/lib/utils"

interface ModelSelectorProps {
    models: FlattenedModel[]
    selectedModelId: string | undefined
    onSelect: (modelId: string | undefined) => void
    onConfigure?: () => void
    /** Opens the settings on the list of providers to add */
    onAddProvider?: () => void
    disabled?: boolean
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

/**
 * The model id without the provider or region prefix that the logo already
 * shows: "nvidia/nemotron-3-ultra" and "global.anthropic.claude-opus-5-5"
 * become "nemotron-3-ultra" and "claude-opus-5-5". The full id is in the
 * tooltip and the list.
 */
export function shortModelName(id: string): string {
    const name = id.slice(id.lastIndexOf("/") + 1)
    const short = name.replace(
        /^(?:(?:global|us|eu|apac|jp|au|ca|us-gov)\.)?[a-z][a-z0-9-]*\.(?=[a-z])/i,
        "",
    )
    // Ids like "deepseek.r1-v1:0" name the vendor only in the prefix: drop
    // just the region
    if (!short || /^[a-z]\d/i.test(short)) {
        return name.replace(/^(?:global|us|eu|apac|jp|au|ca|us-gov)\./i, "")
    }
    return short
}

export function ModelSelector({
    models,
    selectedModelId,
    onSelect,
    onConfigure,
    onAddProvider,
    disabled = false,
}: ModelSelectorProps) {
    const dict = useDictionary()
    const [open, setOpen] = useState(false)

    // Separate server and user models. Every user model is listed; one not
    // tested yet, or that failed its test, says so.
    const serverModels = useMemo(
        () => models.filter((m) => m.source === "server"),
        [models],
    )
    const userModels = useMemo(
        () => models.filter((m) => m.source !== "server"),
        [models],
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

    // Leaving for the settings: closing, the picker must not give the focus
    // back to its button, behind the settings dialog
    const toSettingsRef = useRef(false)
    const goToSettings = (openSettings: () => void) => {
        toSettingsRef.current = true
        setOpen(false)
        openSettings()
    }
    const footerButton =
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring"

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
        <div ref={wrapperRef} className="min-w-0 max-w-44">
            <ModelSelectorRoot
                open={open}
                onOpenChange={(next) => {
                    if (next) toSettingsRef.current = false
                    setOpen(next)
                }}
            >
                <ModelSelectorTrigger asChild>
                    <ButtonWithTooltip
                        tooltipContent={tooltipContent}
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        className={cn(
                            "h-8 min-w-0 max-w-full shrink overflow-hidden gap-1.5 px-2 font-normal text-muted-foreground transition-[padding,background-color] duration-150 ease-in-out hover:bg-accent hover:text-foreground",
                            !showLabel && "px-1.5 justify-center",
                        )}
                        // accessibility: expose label to screen readers
                        aria-label={tooltipContent}
                        data-testid="model-selector"
                    >
                        {selectedModel ? (
                            <ProviderLogo
                                provider={selectedModel.provider}
                                className="size-3.5 flex-shrink-0 opacity-80"
                            />
                        ) : (
                            <Bot className="h-4 w-4 flex-shrink-0" />
                        )}
                        {/* show/hide visible label based on measured width */}
                        {showLabel ? (
                            <span className="min-w-0 truncate text-xs">
                                {selectedModel
                                    ? shortModelName(selectedModel.modelId)
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

                <ModelSelectorContent
                    title={dict.modelConfig.selectModel}
                    onCloseAutoFocus={(e) => {
                        if (!toSettingsRef.current) return
                        toSettingsRef.current = false
                        e.preventDefault()
                    }}
                >
                    <ModelSelectorInput
                        placeholder={dict.modelConfig.searchModels}
                    />
                    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <ModelSelectorList className="overflow-y-auto scrollbar-thin">
                                <ModelSelectorEmpty>
                                    {dict.modelConfig.noModelsFound}
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
                                                                // Unique value so same-named models highlight
                                                                // separately; keywords keep search by name
                                                                value={model.id}
                                                                keywords={[
                                                                    model.modelId,
                                                                    providerLabel,
                                                                ]}
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
                                                                value={model.id}
                                                                keywords={[
                                                                    model.modelId,
                                                                    providerLabel,
                                                                ]}
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
                                                                        className={cn(
                                                                            "ml-auto shrink-0 pl-2 text-xs",
                                                                            model.validated ===
                                                                                false
                                                                                ? "text-destructive"
                                                                                : "text-muted-foreground",
                                                                        )}
                                                                    >
                                                                        {model.validated ===
                                                                        false
                                                                            ? dict
                                                                                  .modelConfig
                                                                                  .modelFailed
                                                                            : dict
                                                                                  .modelConfig
                                                                                  .modelUntested}
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
                        {/* Pinned footer: add a provider, configure models
                            (z-10 above list shadow). Buttons, outside the
                            search: reachable with Tab, never filtered out */}
                        {(onAddProvider || onConfigure) && (
                            <div
                                className="relative z-10 shrink-0 space-y-0.5 border-t bg-background px-3 py-2"
                                // The search's Enter would pick the highlighted
                                // model instead of pressing the button
                                onKeyDown={(e) => e.stopPropagation()}
                            >
                                {onAddProvider && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            goToSettings(onAddProvider)
                                        }
                                        className={footerButton}
                                    >
                                        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="truncate">
                                            {dict.modelConfig.addProviderEntry}
                                        </span>
                                    </button>
                                )}
                                {onConfigure && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            goToSettings(onConfigure)
                                        }
                                        className={footerButton}
                                    >
                                        <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="truncate">
                                            {dict.modelConfig.configureModels}
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </ModelSelectorContent>
            </ModelSelectorRoot>
        </div>
    )
}
