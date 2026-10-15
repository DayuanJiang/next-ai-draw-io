"use client"

import {
    AlertCircle,
    Bot,
    Check,
    ChevronDown,
    Monitor,
    Plus,
    Server,
    Settings2,
    User,
} from "lucide-react"
import {
    type ComponentProps,
    type ReactNode,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { ProviderLogo } from "@/components/provider-logo"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command"
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"
import type { FlattenedModel, ProviderName } from "@/lib/types/model-config"
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

type ProviderGroup = { provider: ProviderName; models: FlattenedModel[] }

// Group models by providerLabel (handles duplicate providers)
function groupModelsByProvider(
    models: FlattenedModel[],
): Map<string, ProviderGroup> {
    const groups = new Map<string, ProviderGroup>()
    for (const model of models) {
        const existing = groups.get(model.providerLabel)
        if (existing) {
            existing.models.push(model)
        } else {
            groups.set(model.providerLabel, {
                provider: model.provider,
                models: [model],
            })
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

// The command list with a shadow at the bottom while more items are below
function ModelList({
    className,
    ...props
}: ComponentProps<typeof CommandList>) {
    const listRef = useRef<HTMLDivElement>(null)
    const [showShadow, setShowShadow] = useState(false)

    useEffect(() => {
        const listElement = listRef.current
        if (!listElement) return

        const checkScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = listElement
            // A small threshold handles fractional pixel rendering
            setShowShadow(
                scrollHeight > Math.ceil(scrollTop + clientHeight) + 1,
            )
        }

        checkScroll()
        listElement.addEventListener("scroll", checkScroll)
        window.addEventListener("resize", checkScroll)
        // Content changes, e.g. the search filtering items
        const observer = new MutationObserver(checkScroll)
        observer.observe(listElement, { childList: true, subtree: true })

        return () => {
            listElement.removeEventListener("scroll", checkScroll)
            window.removeEventListener("resize", checkScroll)
            observer.disconnect()
        }
    }, [])

    return (
        <div className="relative">
            <CommandList
                ref={listRef}
                className={cn(
                    // Hide scrollbar on all platforms
                    "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                    className,
                )}
                {...props}
            />
            <div
                className={cn(
                    "pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-muted/80 via-muted/40 to-transparent transition-opacity duration-200",
                    showShadow ? "opacity-100" : "opacity-0",
                )}
            />
        </div>
    )
}

function SectionHeader({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/40 rounded-sm mx-1 mt-1">
            <span className="[&>svg]:size-3.5" aria-hidden="true">
                {icon}
            </span>
            <span>{label}</span>
        </div>
    )
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

    // One group per provider; `trailing` is the small label at the end of a
    // row ("Default" for server models, the test state for user models)
    const renderGroups = (
        groups: Map<string, ProviderGroup>,
        keyPrefix: "server" | "user",
        trailing: (model: FlattenedModel) => ReactNode,
    ) =>
        Array.from(groups.entries()).map(
            ([providerLabel, { provider, models: providerModels }]) => (
                <CommandGroup
                    key={`${keyPrefix}-${providerLabel}`}
                    heading={providerLabel}
                    className="[&>[cmdk-group-heading]]:pl-4"
                >
                    {providerModels.map((model) => (
                        <CommandItem
                            key={model.id}
                            // Unique value so same-named models highlight
                            // separately; keywords keep search by name
                            value={model.id}
                            keywords={[model.modelId, providerLabel]}
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
                            <ProviderLogo
                                provider={provider}
                                className="mr-2"
                            />
                            <span className="flex-1 truncate text-left">
                                {model.modelId}
                            </span>
                            {trailing(model)}
                        </CommandItem>
                    ))}
                </CommandGroup>
            ),
        )

    // A model whose test failed can still be picked: its button says so
    const selectedFailed = selectedModel?.validated === false
    const tooltipContent = selectedModel
        ? selectedFailed
            ? formatMessage(dict.modelConfig.selectedModelFailed, {
                  model: selectedModel.modelId,
              })
            : `${selectedModel.modelId} ${dict.modelConfig.clickToChange}`
        : `${dict.modelConfig.usingServerDefault} ${dict.modelConfig.clickToChange}`
    // The server names its provider a demo (the public demo site)
    const demoServer = serverModels.some((m) =>
        /\bdemo\b/i.test(m.providerLabel),
    )

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
            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (next) toSettingsRef.current = false
                    setOpen(next)
                }}
            >
                {/* The dialog trigger must wrap the button itself: Radix
                    Tooltip's root renders no element to pass its props to */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={disabled}
                                className={cn(
                                    "h-8 min-w-0 max-w-full shrink overflow-hidden gap-1.5 px-2 font-normal text-muted-foreground transition-[padding,background-color] duration-150 ease-in-out hover:bg-accent hover:text-foreground",
                                    !showLabel && "px-1.5 justify-center",
                                    selectedFailed &&
                                        "text-destructive hover:text-destructive",
                                )}
                                // accessibility: expose label to screen readers
                                aria-label={tooltipContent}
                                data-testid="model-selector"
                            >
                                {selectedFailed ? (
                                    <AlertCircle className="size-3.5 flex-shrink-0" />
                                ) : selectedModel ? (
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
                                            ? shortModelName(
                                                  selectedModel.modelId,
                                              )
                                            : dict.modelConfig.serverDefault}
                                    </span>
                                ) : (
                                    // Keep an sr-only label for screen readers when hidden
                                    <span className="sr-only">
                                        {selectedModel
                                            ? selectedModel.modelId
                                            : dict.modelConfig.serverDefault}
                                    </span>
                                )}
                                <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            </Button>
                        </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-wrap">
                        {tooltipContent}
                    </TooltipContent>
                </Tooltip>

                <DialogContent
                    className="p-0"
                    onCloseAutoFocus={(e) => {
                        if (!toSettingsRef.current) return
                        toSettingsRef.current = false
                        e.preventDefault()
                    }}
                >
                    <DialogTitle className="sr-only">
                        {dict.modelConfig.selectModel}
                    </DialogTitle>
                    <Command className="**:data-[slot=command-input-wrapper]:h-auto">
                        <CommandInput
                            className="h-auto py-3.5"
                            placeholder={dict.modelConfig.searchModels}
                        />
                        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                            <div className="flex-1 min-h-0 overflow-hidden">
                                <ModelList
                                    className="overflow-y-auto scrollbar-thin"
                                    label={dict.modelConfig.models}
                                >
                                    <CommandEmpty>
                                        {dict.modelConfig.noModelsFound}
                                    </CommandEmpty>

                                    {/* Server Default Option - only show when no server models are configured */}
                                    {serverModels.length === 0 && (
                                        <CommandGroup
                                            heading={dict.modelConfig.default}
                                        >
                                            <CommandItem
                                                value="__server_default__"
                                                onSelect={handleSelect}
                                                className={cn(
                                                    "cursor-pointer",
                                                    !selectedModelId &&
                                                        "bg-accent",
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
                                                <span className="flex-1 truncate text-left">
                                                    {
                                                        dict.modelConfig
                                                            .serverDefault
                                                    }
                                                </span>
                                            </CommandItem>
                                        </CommandGroup>
                                    )}

                                    {/* Server Models Section */}
                                    {serverModels.length > 0 && (
                                        <>
                                            <SectionHeader
                                                icon={<Monitor />}
                                                label={
                                                    dict.modelConfig
                                                        .serverModels
                                                }
                                            />
                                            {demoServer && (
                                                <p className="mx-1 px-2 pt-1.5 text-xs text-muted-foreground">
                                                    {
                                                        dict.modelConfig
                                                            .demoModelNote
                                                    }
                                                </p>
                                            )}
                                            {renderGroups(
                                                groupedServerModels,
                                                "server",
                                                (model) =>
                                                    model.isDefault && (
                                                        <span
                                                            title={
                                                                dict.modelConfig
                                                                    .serverDefaultModel
                                                            }
                                                            className="ml-auto text-xs text-muted-foreground"
                                                        >
                                                            {
                                                                dict.modelConfig
                                                                    .default
                                                            }
                                                        </span>
                                                    ),
                                            )}
                                        </>
                                    )}

                                    {/* User Models Section */}
                                    {userModels.length > 0 && (
                                        <>
                                            {serverModels.length > 0 && (
                                                <CommandSeparator />
                                            )}
                                            <SectionHeader
                                                icon={<User />}
                                                label={
                                                    dict.modelConfig.userModels
                                                }
                                            />
                                            {renderGroups(
                                                groupedUserModels,
                                                "user",
                                                (model) =>
                                                    model.validated !==
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
                                                    ),
                                            )}
                                        </>
                                    )}
                                </ModelList>
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
                                                {
                                                    dict.modelConfig
                                                        .addProviderEntry
                                                }
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
                                                {
                                                    dict.modelConfig
                                                        .configureModels
                                                }
                                            </span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </Command>
                </DialogContent>
            </Dialog>
        </div>
    )
}
