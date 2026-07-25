import {
    AlertCircle,
    Check,
    Loader2,
    Plus,
    Star,
    Trash2,
    X,
    Zap,
} from "lucide-react"
import { useState } from "react"
import { ProviderCredentialsFields } from "@/components/provider-credentials-fields"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"
import {
    FIXED_CRED_PROVIDERS,
    PROVIDER_INFO,
    type ProviderName,
    SUGGESTED_MODELS,
} from "@/lib/types/model-config"
import { cn } from "@/lib/utils"
import {
    type AdminProvider,
    adminFetch,
    type EnvProvider,
} from "./admin-shared"
import { SecretInput } from "./setting-field"

// ── Models section (mirrors the user ModelConfigDialog) ──────────────

function ProviderDetail({
    provider,
    disabled,
    password,
    onUpdate,
    onDelete,
}: {
    provider: AdminProvider
    disabled: boolean
    password: string
    onUpdate: (patch: Partial<AdminProvider>) => void
    onDelete: () => void
}) {
    const dict = useDictionary()
    const [modelInput, setModelInput] = useState("")
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [testing, setTesting] = useState<string | null>(null)
    const [testResults, setTestResults] = useState<
        Record<string, { ok: boolean; message: string }>
    >({})

    const info = PROVIDER_INFO[provider.provider]
    const suggestions = (SUGGESTED_MODELS[provider.provider] || []).filter(
        (m) => !provider.models.includes(m),
    )

    const addModel = (modelId: string) => {
        const trimmed = modelId.trim()
        if (!trimmed || provider.models.includes(trimmed)) return
        onUpdate({ models: [...provider.models, trimmed] })
        setModelInput("")
    }

    const testModel = async (modelId: string) => {
        setTesting(modelId)
        try {
            const data = await adminFetch("/api/admin/test-model", password, {
                method: "POST",
                body: JSON.stringify({ provider, modelId }),
            })
            setTestResults((prev) => ({
                ...prev,
                [modelId]: data.valid
                    ? {
                          ok: true,
                          message: formatMessage(dict.admin.testOk, {
                              ms: data.responseTime,
                          }),
                      }
                    : {
                          ok: false,
                          message: data.error || dict.admin.testFailed,
                      },
            }))
        } catch (err) {
            setTestResults((prev) => ({
                ...prev,
                [modelId]: {
                    ok: false,
                    message:
                        err instanceof Error
                            ? err.message
                            : dict.admin.testFailed,
                },
            }))
        } finally {
            setTesting(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <ProviderLogo
                        provider={provider.provider}
                        className="size-5"
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{info.label}</h3>
                    <p className="text-xs text-muted-foreground">
                        {provider.models.length === 0
                            ? dict.admin.noModelsConfigured
                            : formatMessage(
                                  provider.models.length === 1
                                      ? dict.admin.modelCount
                                      : dict.admin.modelCountPlural,
                                  { count: provider.models.length },
                              )}
                    </p>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Star
                        className={cn(
                            "h-3.5 w-3.5",
                            provider.isDefault &&
                                "fill-amber-400 text-amber-400",
                        )}
                        aria-hidden="true"
                    />
                    {dict.admin.default}
                    <Switch
                        checked={!!provider.isDefault}
                        disabled={disabled}
                        aria-label={dict.admin.setAsDefault}
                        onCheckedChange={(checked) =>
                            onUpdate({ isDefault: checked })
                        }
                    />
                </label>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                >
                    <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {dict.admin.delete}
                </Button>
            </div>

            {/* Credentials (shared with the user ModelConfigDialog) */}
            <ProviderCredentialsFields
                provider={provider.provider}
                name={provider.name}
                baseUrl={provider.baseUrl}
                awsRegion={provider.awsRegion}
                disabled={disabled}
                onChange={(field, value) => onUpdate({ [field]: value })}
                renderSecret={({ field, id }) => (
                    // Bare id keeps the shared component's <Label htmlFor={id}>
                    // associated; only one ProviderDetail is mounted at a time.
                    <SecretInput
                        id={id}
                        keepOnEmpty
                        value={provider[field]}
                        disabled={disabled}
                        onChange={(v) => onUpdate({ [field]: v })}
                    />
                )}
            />

            {/* Models */}
            <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {dict.admin.models}
                    </Label>
                    <div className="flex items-center gap-1.5">
                        <Input
                            value={modelInput}
                            disabled={disabled}
                            placeholder={dict.admin.modelIdPlaceholder}
                            spellCheck={false}
                            className="h-8 w-48 font-mono text-xs"
                            onChange={(e) => setModelInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") addModel(modelInput)
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={disabled || !modelInput.trim()}
                            aria-label={dict.admin.addModel}
                            onClick={() => addModel(modelInput)}
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        {suggestions.length > 0 && (
                            <Select
                                disabled={disabled}
                                onValueChange={(v) => addModel(v)}
                            >
                                <SelectTrigger className="h-8 w-28 text-xs">
                                    {dict.admin.suggested}
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    {suggestions.map((m) => (
                                        <SelectItem
                                            key={m}
                                            value={m}
                                            className="font-mono text-xs"
                                        >
                                            {m}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>
                <div className="overflow-hidden rounded-lg border">
                    {provider.models.length === 0 ? (
                        <p className="p-5 text-center text-sm text-muted-foreground">
                            {dict.admin.addProviderToOfferModels}
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {provider.models.map((modelId, index) => {
                                const result = testResults[modelId]
                                return (
                                    <li
                                        key={modelId}
                                        className="flex items-center gap-2 px-3 py-2"
                                    >
                                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                            {modelId}
                                            {provider.isDefault &&
                                                index === 0 && (
                                                    <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
                                                        {
                                                            dict.admin
                                                                .defaultModel
                                                        }
                                                    </span>
                                                )}
                                        </span>
                                        {result && (
                                            <span
                                                className={cn(
                                                    "flex items-center gap-1 text-xs",
                                                    result.ok
                                                        ? "text-green-600 dark:text-green-400"
                                                        : "text-destructive",
                                                )}
                                            >
                                                {result.ok ? (
                                                    <Check
                                                        className="h-3.5 w-3.5"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <AlertCircle
                                                        className="h-3.5 w-3.5"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <span className="max-w-48 truncate">
                                                    {result.message}
                                                </span>
                                            </span>
                                        )}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            disabled={
                                                disabled || testing !== null
                                            }
                                            onClick={() =>
                                                void testModel(modelId)
                                            }
                                        >
                                            {testing === modelId ? (
                                                <Loader2
                                                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <Zap
                                                    className="h-3.5 w-3.5"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="ml-1">
                                                {dict.admin.test}
                                            </span>
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            disabled={disabled}
                                            aria-label={formatMessage(
                                                dict.admin.removeModel,
                                                { model: modelId },
                                            )}
                                            onClick={() =>
                                                onUpdate({
                                                    models: provider.models.filter(
                                                        (m) => m !== modelId,
                                                    ),
                                                })
                                            }
                                        >
                                            <X
                                                className="h-3.5 w-3.5"
                                                aria-hidden="true"
                                            />
                                        </Button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </div>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {formatMessage(dict.admin.deleteProviderTitle, {
                                name: provider.name || info.label,
                            })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {dict.admin.deleteProviderDesc}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {dict.admin.cancel}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                setDeleteOpen(false)
                                onDelete()
                            }}
                        >
                            {dict.admin.delete}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

export function ModelsSection({
    providers,
    envProviders,
    disabled,
    password,
    onChange,
}: {
    providers: AdminProvider[]
    envProviders: EnvProvider[]
    disabled: boolean
    password: string
    onChange: (providers: AdminProvider[]) => void
}) {
    const dict = useDictionary()
    const [selectedId, setSelectedId] = useState<string | null>(
        providers[0]?.id ?? null,
    )
    const selected = providers.find((p) => p.id === selectedId)
    const selectedEnv = envProviders.find((p) => `env:${p.name}` === selectedId)

    const addProvider = (provider: ProviderName) => {
        const newProvider: AdminProvider = {
            id: crypto.randomUUID(),
            provider,
            models: [],
            isDefault: providers.length === 0,
        }
        onChange([...providers, newProvider])
        setSelectedId(newProvider.id)
    }

    const updateProvider = (id: string, patch: Partial<AdminProvider>) => {
        onChange(
            providers.map((p) => {
                if (p.id !== id) {
                    // Only one default at a time
                    return patch.isDefault ? { ...p, isDefault: false } : p
                }
                return { ...p, ...patch }
            }),
        )
    }

    const deleteProvider = (id: string) => {
        const next = providers.filter((p) => p.id !== id)
        onChange(next)
        setSelectedId(next[0]?.id ?? null)
    }

    return (
        <div className="flex min-h-72 flex-col sm:flex-row">
            {/* Provider list */}
            <div className="flex w-full shrink-0 flex-col border-b sm:w-52 sm:border-b-0 sm:border-r">
                <div className="flex-1 space-y-1 p-2">
                    {providers.length === 0 && envProviders.length === 0 && (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                            {dict.admin.addProviderHint}
                        </p>
                    )}
                    {envProviders.map((p) => (
                        <button
                            key={`env:${p.name}`}
                            type="button"
                            onClick={() => setSelectedId(`env:${p.name}`)}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selectedId === `env:${p.name}` &&
                                    "bg-muted font-medium",
                            )}
                        >
                            <ProviderLogo provider={p.provider} />
                            <span className="min-w-0 flex-1 truncate">
                                {p.name}
                            </span>
                            <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                {dict.admin.sourceEnv}
                            </span>
                            {p.isDefault && (
                                <Star
                                    className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                                    aria-label={dict.admin.defaultProvider}
                                />
                            )}
                        </button>
                    ))}
                    {providers.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedId(p.id)}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selectedId === p.id && "bg-muted font-medium",
                            )}
                        >
                            <ProviderLogo provider={p.provider} />
                            <span className="min-w-0 flex-1 truncate">
                                {p.name || PROVIDER_INFO[p.provider].label}
                            </span>
                            {p.isDefault && (
                                <Star
                                    className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                                    aria-label={dict.admin.defaultProvider}
                                />
                            )}
                        </button>
                    ))}
                </div>
                <div className="border-t p-2">
                    <Select
                        disabled={disabled}
                        onValueChange={(v) => addProvider(v as ProviderName)}
                    >
                        <SelectTrigger className="w-full">
                            <Plus
                                className="mr-1 h-4 w-4 text-muted-foreground"
                                aria-hidden="true"
                            />
                            {dict.modelConfig.addProvider}
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {(Object.keys(PROVIDER_INFO) as ProviderName[]).map(
                                (p) => {
                                    // Global-credential providers already in
                                    // the env config can't be added here —
                                    // panel credentials would override theirs
                                    const envBlocked =
                                        FIXED_CRED_PROVIDERS.includes(p) &&
                                        envProviders.some(
                                            (e) => e.provider === p,
                                        )
                                    return (
                                        <SelectItem
                                            key={p}
                                            value={p}
                                            disabled={envBlocked}
                                        >
                                            <div className="flex items-center gap-2">
                                                <ProviderLogo provider={p} />
                                                {PROVIDER_INFO[p].label}
                                                {envBlocked && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {
                                                            dict.admin
                                                                .managedViaEnv
                                                        }
                                                    </span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    )
                                },
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Detail */}
            <div className="min-w-0 flex-1 p-4">
                {selected ? (
                    <ProviderDetail
                        key={selected.id}
                        provider={selected}
                        disabled={disabled}
                        password={password}
                        onUpdate={(patch) => updateProvider(selected.id, patch)}
                        onDelete={() => deleteProvider(selected.id)}
                    />
                ) : selectedEnv ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                                <ProviderLogo
                                    provider={selectedEnv.provider}
                                    className="size-5"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-semibold">
                                    {selectedEnv.name}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    {dict.admin.envReadOnly}
                                </p>
                            </div>
                        </div>
                        <div className="overflow-hidden rounded-lg border">
                            <ul className="divide-y">
                                {selectedEnv.models.map((modelId, index) => (
                                    <li
                                        key={modelId}
                                        className="flex items-center gap-2 px-3 py-2"
                                    >
                                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                            {modelId}
                                            {selectedEnv.isDefault &&
                                                index === 0 && (
                                                    <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">
                                                        {
                                                            dict.admin
                                                                .defaultModel
                                                        }
                                                    </span>
                                                )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                        {dict.admin.selectProviderHint}
                    </p>
                )}
            </div>
        </div>
    )
}
