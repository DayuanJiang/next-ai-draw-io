import {
    AlertCircle,
    CheckCircle2,
    ChevronRight,
    CircleDashed,
    CircleDotDashed,
    Lock,
    Plus,
    Server,
} from "lucide-react"
import { shortModelName } from "@/components/model-selector"
import { ProviderLogo } from "@/components/provider-logo"
import { SettingsHeader } from "@/components/settings/settings-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"
import { POPULAR_PROVIDERS, providerStatus } from "@/lib/provider-setup"
import {
    type FlattenedModel,
    PROVIDER_INFO,
    type ProviderConfig,
    type ProviderName,
} from "@/lib/types/model-config"
import { cn } from "@/lib/utils"

function InUse() {
    const dict = useDictionary()
    return (
        <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
            {dict.modelConfig.inUse}
        </span>
    )
}

/** The models tab's first page: the user's providers and the server's models */
export function ProvidersList({
    providers,
    serverModels,
    selectedModelId,
    onOpen,
    onAdd,
    onBrowse,
}: {
    providers: ProviderConfig[]
    serverModels: FlattenedModel[]
    selectedModelId: string | undefined
    onOpen: (providerId: string) => void
    onAdd: (provider: ProviderName) => void
    /** Shows every provider to pick from */
    onBrowse: () => void
}) {
    const dict = useDictionary()
    const t = dict.modelConfig
    const userProviderInUse = providers.find((p) =>
        p.models.some((m) => m.id === selectedModelId),
    )
    // No model chosen is the server's default model
    const serverInUse =
        !selectedModelId || serverModels.some((m) => m.id === selectedModelId)

    const names = serverModels
        .slice(0, 3)
        .map((m) => shortModelName(m.modelId))
        .join(t.listSeparator)
    const serverCard = (serverModels.length > 0 || serverInUse) && (
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-0">
                <Server className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                    {t.serverModelsTitle}
                    {serverInUse && <InUse />}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                    {serverModels.length > 0
                        ? formatMessage(
                              serverModels.length === 1
                                  ? t.serverModelsSummaryOne
                                  : t.serverModelsSummaryOther,
                              {
                                  count: serverModels.length,
                                  names:
                                      serverModels.length > 3
                                          ? `${names}…`
                                          : names,
                              },
                          )
                        : t.serverDefaultSummary}
                </p>
            </div>
        </div>
    )

    const statusText = (p: ProviderConfig) => {
        const status = providerStatus(p)
        switch (status.kind) {
            case "error":
                return (
                    <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="size-3.5" />
                        {formatMessage(t.statusError, { count: status.count })}
                    </span>
                )
            case "incomplete":
                return (
                    <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <CircleDotDashed className="size-3.5" />
                        {t.statusIncomplete}
                    </span>
                )
            case "untested":
                return (
                    <span className="flex items-center gap-1 text-muted-foreground">
                        <CircleDashed className="size-3.5" />
                        {formatMessage(t.statusUntested, {
                            count: status.count,
                        })}
                    </span>
                )
            case "ok":
                return (
                    <span className="flex items-center gap-1 text-success">
                        <CheckCircle2 className="size-3.5" />
                        {formatMessage(t.statusOk, { count: status.count })}
                    </span>
                )
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <SettingsHeader>
                <h2
                    className="font-semibold outline-none"
                    tabIndex={-1}
                    data-page-title
                >
                    {t.models}
                </h2>
            </SettingsHeader>
            <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-6 px-6 pb-6">
                    {providers.length === 0 ? (
                        <>
                            {serverCard}
                            <section className="space-y-3">
                                <div>
                                    <h3 className="text-[13px] font-semibold">
                                        {t.useOwnKey}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {t.useOwnKeyHint}
                                    </p>
                                </div>
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5">
                                    {POPULAR_PROVIDERS.map((provider) => (
                                        <button
                                            key={provider}
                                            type="button"
                                            onClick={() => onAdd(provider)}
                                            data-testid={`pick-provider-${provider}`}
                                            className="flex h-14 items-center gap-3 rounded-xl border border-border px-4 text-left text-[13px] font-medium transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                                                <ProviderLogo
                                                    provider={provider}
                                                />
                                            </span>
                                            <span className="truncate">
                                                {PROVIDER_INFO[provider].label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={onBrowse}
                                    className="flex items-center gap-1 text-[13px] font-medium hover:underline"
                                >
                                    {formatMessage(t.viewAllProviders, {
                                        count: Object.keys(PROVIDER_INFO)
                                            .length,
                                    })}
                                    <ChevronRight className="size-3.5" />
                                </button>
                            </section>
                        </>
                    ) : (
                        <>
                            <section className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[13px] font-semibold">
                                        {t.myProviders}
                                    </h3>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onBrowse}
                                        className="h-8 gap-1.5 rounded-lg text-xs"
                                    >
                                        <Plus className="size-3.5" />
                                        {t.addProvider}
                                    </Button>
                                </div>
                                <div className="divide-y divide-border-subtle rounded-xl border border-border">
                                    {providers.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => onOpen(p.id)}
                                            data-testid={`provider-row-${p.id}`}
                                            className={cn(
                                                "flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors first:rounded-t-xl last:rounded-b-xl",
                                                "hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            )}
                                        >
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                                                <ProviderLogo
                                                    provider={p.provider}
                                                />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2 text-[13px] font-medium">
                                                    <span className="truncate">
                                                        {p.name ||
                                                            PROVIDER_INFO[
                                                                p.provider
                                                            ].label}
                                                    </span>
                                                    {userProviderInUse?.id ===
                                                        p.id && <InUse />}
                                                </span>
                                                <span className="block truncate font-mono text-xs text-muted-foreground">
                                                    {p.models.length > 0 ? (
                                                        p.models
                                                            .map(
                                                                (m) =>
                                                                    m.modelId,
                                                            )
                                                            .join(
                                                                t.listSeparator,
                                                            )
                                                    ) : (
                                                        <span className="font-sans">
                                                            {t.noModelsYet}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-xs">
                                                {statusText(p)}
                                            </span>
                                            <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                                        </button>
                                    ))}
                                </div>
                            </section>
                            {serverCard}
                        </>
                    )}
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="size-3.5 shrink-0" />
                        {t.keysStayLocal}
                    </p>
                </div>
            </ScrollArea>
        </div>
    )
}
