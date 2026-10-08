"use client"

import {
    AlertCircle,
    Check,
    CheckCircle2,
    ChevronRight,
    CircleDashed,
    Eye,
    EyeOff,
    Loader2,
    Plus,
    RefreshCw,
    Trash2,
    X,
} from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useChatEngine } from "@/components/chat/chat-engine"
import {
    ProviderCredentialsFields,
    type SecretField,
} from "@/components/provider-credentials-fields"
import { ProviderLogo } from "@/components/provider-logo"
import { ProviderPicker } from "@/components/settings/provider-picker"
import { ProvidersList } from "@/components/settings/providers-list"
import { SettingsHeader } from "@/components/settings/settings-header"
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
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDictionary } from "@/hooks/use-dictionary"
import type { UseModelConfigReturn } from "@/hooks/use-model-config"
import { getApiEndpoint } from "@/lib/base-path"
import { formatMessage } from "@/lib/i18n/utils"
import type { ListedModel } from "@/lib/provider-models"
import { hasCredentials } from "@/lib/provider-setup"
import { STORAGE_KEYS } from "@/lib/storage"
import type {
    ModelConfig,
    ProviderConfig,
    ProviderName,
} from "@/lib/types/model-config"
import { PROVIDER_INFO, SUGGESTED_MODELS } from "@/lib/types/model-config"
import { cn } from "@/lib/utils"
import { useUiStore } from "@/stores/ui-store"

interface ModelConfigDialogProps {
    open: boolean
    modelConfig: UseModelConfigReturn
}

type ValidationStatus = "idle" | "validating" | "success" | "error"

/** One numbered step of a provider's setup; a check mark once done */
function Step({
    n,
    done,
    title,
    action,
    children,
}: {
    n: number
    done: boolean
    title: string
    action?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <section className="flex gap-3.5">
            <span
                className={cn(
                    "mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done
                        ? "bg-success-muted text-success"
                        : "bg-primary text-primary-foreground",
                )}
                data-testid={`step-${n}-${done ? "done" : "todo"}`}
            >
                {done ? <Check className="size-3" /> : n}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
                <div className="flex min-h-[22px] items-center justify-between gap-3">
                    <h3 className="text-[13px] font-semibold">{title}</h3>
                    {action}
                </div>
                {children}
            </div>
        </section>
    )
}

/**
 * The latest test of each provider. Kept outside the component: this view
 * mounts anew when settings reopen or another tab comes back, and a test
 * started before must not overwrite a newer one's results.
 */
const latestTestRun = new Map<string, number>()

/** Providers as last saved (the model config is saved on every change) */
function savedProviders(): ProviderConfig[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.modelConfigs)
        return stored
            ? (JSON.parse(stored) as { providers: ProviderConfig[] }).providers
            : []
    } catch {
        return []
    }
}

export function ModelConfigDialog({
    open,
    modelConfig,
}: ModelConfigDialogProps) {
    const dict = useDictionary()
    const t = dict.modelConfig
    const engine = useChatEngine()
    // Like the chat's model picker, "Use in the chat" waits while a request
    // runs: the answer keeps the model it was sent with
    const chatLocked = (engine.isBusy && !engine.error) || engine.isLeaving
    // The page shown lives in the UI store: a chat error or the model
    // picker can open settings on a provider or on the provider picker
    const page = useUiStore((s) => s.modelsPage)
    const setModelsPage = useUiStore((s) => s.setModelsPage)
    const selectedProviderId = typeof page === "object" ? page.providerId : null
    const [showApiKey, setShowApiKey] = useState(false)
    const [validationStatus, setValidationStatus] =
        useState<ValidationStatus>("idle")
    const [validationError, setValidationError] = useState<string>("")
    // Per provider, the credentials a test was refused with: the key field is
    // marked until they change, here or in another tab, or a test passes. A
    // model list says nothing about the key: some providers list models
    // without one.
    const [rejectedKeys, setRejectedKeys] = useState<Record<string, string>>({})
    const markRejected = (
        providerId: string,
        askedWith: string,
        rejected: boolean,
    ) =>
        setRejectedKeys(({ [providerId]: _, ...rest }) =>
            rejected ? { ...rest, [providerId]: askedWith } : rest,
        )
    const [customModelInput, setCustomModelInput] = useState("")
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState("")
    // Models whose test is running (they are all tested at once)
    const [validatingModelIds, setValidatingModelIds] = useState<Set<string>>(
        () => new Set(),
    )
    const [duplicateError, setDuplicateError] = useState<string>("")
    const [editError, setEditError] = useState<{
        modelId: string
        message: string
    } | null>(null)
    // Model ID being typed; written to the config only when valid on blur
    const [modelIdDraft, setModelIdDraft] = useState<{
        id: string
        value: string
    } | null>(null)
    // Models fetched from the provider, per provider config, with the
    // credentials they were fetched with
    const [fetchedModels, setFetchedModels] = useState<
        Record<string, { askedWith: string; models: ListedModel[] }>
    >({})
    // The providers whose model list is being fetched
    const [fetchingFor, setFetchingFor] = useState<string[]>([])
    const [fetchModelsError, setFetchModelsError] = useState("")
    const [modelPickerOpen, setModelPickerOpen] = useState(false)
    // models.dev data for hints, loaded with the dialog (it is ~180 KB)
    const [getModelInfo, setGetModelInfo] = useState<
        typeof import("@/lib/model-catalog").getModelInfo | null
    >(null)

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
    // Another provider shown: what was shown for the one before goes, also
    // when the page is changed from outside (openSettings)
    const [shownProviderId, setShownProviderId] = useState(selectedProviderId)
    if (shownProviderId !== selectedProviderId) {
        setShownProviderId(selectedProviderId)
        setValidationStatus("idle")
        setValidationError("")
        setShowApiKey(false)
        setFetchModelsError("")
        setModelPickerOpen(false)
        setCustomModelInput("")
        setDuplicateError("")
        setEditError(null)
        setModelIdDraft(null)
    }
    // For requests that finish after the user switched provider or edited
    // a model id
    const selectedProviderIdRef = useRef(selectedProviderId)
    selectedProviderIdRef.current = selectedProviderId
    const configRef = useRef(config)
    configRef.current = config
    // Set when this view goes away (settings closed or on another tab): its
    // config no longer follows edits, the saved one does
    const closedRef = useRef(false)
    useEffect(() => {
        closedRef.current = false
        return () => {
            closedRef.current = true
        }
    }, [])
    // The providers as they are now: once this view is gone, as saved
    const providersNow = () =>
        closedRef.current ? savedProviders() : configRef.current.providers
    // A model list or test result belongs to the credentials it was asked
    // with; they can change meanwhile, here or in another tab
    const credentialsOf = (providerId: string) => {
        const p = providersNow().find((x) => x.id === providerId)
        return JSON.stringify([
            p?.provider,
            p?.apiKey,
            p?.baseUrl,
            p?.awsAccessKeyId,
            p?.awsSecretAccessKey,
            p?.awsRegion,
            p?.awsSessionToken,
            p?.vertexApiKey,
        ])
    }

    // The button that changed the page went with the old page: the new
    // page's title takes the focus, unless one of its fields took it
    // (autoFocus). Not on the first page: the dialog places the focus then.
    const pageRef = useRef<HTMLDivElement>(null)
    // The test result, read out by screen readers
    const resultId = useId()
    const useButtonRef = useRef<HTMLButtonElement>(null)
    const backButtonRef = useRef<HTMLButtonElement>(null)
    // A test passed: its button went with the success panel, whose first
    // button takes the focus (it is described by the result) unless the
    // focus went somewhere on the page meanwhile
    useEffect(() => {
        if (validationStatus !== "success") return
        const root = pageRef.current
        if (!root || root.contains(document.activeElement)) return
        const use = useButtonRef.current
        ;(use && !use.disabled ? use : backButtonRef.current)?.focus()
    }, [validationStatus])
    const pageKey =
        selectedProvider?.id ?? (page === "picker" ? "picker" : "list")
    const shownPageRef = useRef(pageKey)
    useEffect(() => {
        if (shownPageRef.current === pageKey) return
        shownPageRef.current = pageKey
        const root = pageRef.current
        if (!root || root.contains(document.activeElement)) return
        root.querySelector<HTMLElement>("[data-page-title]")?.focus()
    }, [pageKey])

    // Discard an unfinished model ID edit when the dialog closes
    useEffect(() => {
        if (!open) setModelIdDraft(null)
    }, [open])

    useEffect(() => {
        if (!open || getModelInfo) return
        import("@/lib/model-catalog").then((catalog) =>
            setGetModelInfo(() => catalog.getModelInfo),
        )
    }, [open, getModelInfo])

    // What to do about an error kind, worded for this page, where the
    // credentials can be fixed
    const errorHints = (p: ProviderConfig): Record<string, string> => ({
        ...(dict.errors.llm as Record<string, string>),
        invalid_api_key:
            p.provider === "bedrock" && !p.apiKey
                ? t.awsKeysRejected
                : t.keyRejected,
        model_not_found: t.modelNotFound,
    })

    const handleFetchModels = async () => {
        if (!selectedProvider) return
        const providerId = selectedProvider.id
        const askedWith = credentialsOf(providerId)
        const hints = errorHints(selectedProvider)
        setFetchingFor((current) => [...current, providerId])
        setFetchModelsError("")
        try {
            const response = await fetch(
                getApiEndpoint("/api/provider-models"),
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-access-code":
                            localStorage.getItem(STORAGE_KEYS.accessCode) || "",
                    },
                    body: JSON.stringify({
                        provider: selectedProvider.provider,
                        apiKey: selectedProvider.apiKey,
                        baseUrl: selectedProvider.baseUrl,
                    }),
                },
            )
            const data = await response.json().catch(() => ({}))
            if (credentialsOf(providerId) !== askedWith) return
            // The picker and the error belong to the provider shown
            const stillShown = selectedProviderIdRef.current === providerId
            if (Array.isArray(data.models)) {
                setFetchedModels((current) => ({
                    ...current,
                    [providerId]: { askedWith, models: data.models },
                }))
                if (!stillShown) return
                if (data.models.length > 0) setModelPickerOpen(true)
                else setFetchModelsError(t.noModelsReturned)
            } else {
                if (!stillShown) return
                setFetchModelsError(
                    [hints[data.code], data.error].filter(Boolean).join(" ") ||
                        formatMessage(t.requestFailed, {
                            status: response.status,
                        }),
                )
            }
        } catch {
            if (
                selectedProviderIdRef.current === providerId &&
                credentialsOf(providerId) === askedWith
            ) {
                setFetchModelsError(dict.errors.networkError)
            }
        } finally {
            setFetchingFor((current) =>
                current.filter((id) => id !== providerId),
            )
        }
    }

    // The provider's own list, if fetched with the credentials it has now,
    // else the suggested models
    const fetched = selectedProvider
        ? fetchedModels[selectedProvider.id]
        : undefined
    const suggestedModels: ListedModel[] = selectedProvider
        ? fetched && fetched.askedWith === credentialsOf(selectedProvider.id)
            ? fetched.models
            : (SUGGESTED_MODELS[selectedProvider.provider] || []).map((id) => ({
                  id,
              }))
        : []
    // The picker closes when there is nothing left to pick from, so it does
    // not open by itself once there is again
    if (modelPickerOpen && suggestedModels.length === 0) {
        setModelPickerOpen(false)
    }
    const keyRejected =
        !!selectedProvider &&
        rejectedKeys[selectedProvider.id] === credentialsOf(selectedProvider.id)
    // Tool calls are what drawing needs: false when known to be missing
    const supportsTools = (model: ListedModel) =>
        selectedProvider
            ? (model.tools ??
              getModelInfo?.(selectedProvider.provider, model.id)?.tools)
            : undefined

    // Filter out already-added models from suggestions
    const existingModelIds =
        selectedProvider?.models.map((m) => m.modelId) || []
    const availableSuggestions = suggestedModels.filter(
        (model) => !existingModelIds.includes(model.id),
    )
    // A few suggested models to add with one click
    const quickSuggestions = selectedProvider
        ? (SUGGESTED_MODELS[selectedProvider.provider] || [])
              .filter((modelId) => !existingModelIds.includes(modelId))
              .slice(0, 4)
        : []

    const openProvider = (providerId: string) => setModelsPage({ providerId })

    // Handle adding a new provider
    const handleAddProvider = (providerType: ProviderName) => {
        const newProvider = addProvider(providerType)
        // With the first suggested model picked, a key is all a test needs
        const firstModel = SUGGESTED_MODELS[providerType]?.[0]
        if (firstModel) addModel(newProvider.id, firstModel)
        openProvider(newProvider.id)
    }

    // Handle provider field updates
    const handleProviderUpdate = (updates: Partial<ProviderConfig>) => {
        if (!selectedProviderId || !selectedProvider) return
        // Reset validation of the provider and its models when credentials change
        const credentialFields = [
            "apiKey",
            "baseUrl",
            "awsAccessKeyId",
            "awsSecretAccessKey",
            "awsRegion",
            "awsSessionToken",
            "vertexApiKey",
        ]
        if (Object.keys(updates).some((f) => credentialFields.includes(f))) {
            setValidationStatus("idle")
            // A test of this provider still running no longer counts
            const ids = new Set(selectedProvider.models.map((m) => m.id))
            setValidatingModelIds(
                (prev) => new Set([...prev].filter((id) => !ids.has(id))),
            )
            setFetchModelsError("")
            updates = {
                ...updates,
                validated: false,
                models: selectedProvider.models.map((m) => ({
                    ...m,
                    validated: undefined,
                    validationError: undefined,
                    validationWarning: undefined,
                    responseTime: undefined,
                })),
            }
        }
        updateProvider(selectedProviderId, updates)
    }

    // Empty the secrets of the Bedrock sign-in the user switched away from;
    // a session token belongs to the access keys
    const clearSecrets = (fields: SecretField[]) => {
        if (!selectedProvider) return
        const cleared = [
            ...fields,
            ...(fields.includes("awsAccessKeyId")
                ? (["awsSessionToken"] as const)
                : []),
        ].filter((field) => selectedProvider[field])
        // Nothing filled in: the test results still hold
        if (cleared.length === 0) return
        const updates = Object.fromEntries(cleared.map((field) => [field, ""]))
        // Access keys kept behind an API key were never used (the server
        // takes the API key first): the test results still hold
        if (selectedProvider.apiKey && !fields.includes("apiKey")) {
            updateProvider(selectedProvider.id, updates)
        } else {
            handleProviderUpdate(updates)
        }
    }

    // Handle adding a model to current provider
    // Returns true if model was added successfully, false otherwise
    const handleAddModel = (modelId: string): boolean => {
        if (!selectedProviderId || !selectedProvider) return false
        // Prevent duplicate model IDs
        if (existingModelIds.includes(modelId)) {
            setDuplicateError(t.modelIdExists)
            return false
        }
        setDuplicateError("")
        addModel(selectedProviderId, modelId)
        return true
    }

    const addCustomModel = () => {
        const modelId = customModelInput.trim()
        if (modelId && handleAddModel(modelId)) setCustomModelInput("")
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
        setModelsPage("list")
        setValidationStatus("idle")
        setDeleteConfirmOpen(false)
    }

    // Validate all models
    const handleValidate = useCallback(async () => {
        if (!selectedProvider || !selectedProviderId) return
        if (!hasCredentials(selectedProvider)) return

        // Need at least one model to validate
        if (selectedProvider.models.length === 0) {
            setValidationError(t.addModelFirst)
            setValidationStatus("error")
            return
        }

        setValidationStatus("validating")
        setValidationError("")

        let allValid = true
        let errorCount = 0
        let idChanged = false
        let rejected = false
        const askedWith = credentialsOf(selectedProviderId)
        const run = (latestTestRun.get(selectedProviderId) ?? 0) + 1
        latestTestRun.set(selectedProviderId, run)

        // For EdgeOne, construct baseUrl from current origin
        const baseUrl =
            selectedProvider.provider === "edgeone"
                ? `${window.location.origin}/api/edgeai`
                : selectedProvider.baseUrl
        const hints = errorHints(selectedProvider)

        // Test every model at once; each row updates when its answer arrives
        setValidatingModelIds(
            (prev) =>
                new Set([...prev, ...selectedProvider.models.map((m) => m.id)]),
        )
        await Promise.all(
            selectedProvider.models.map(async (model) => {
                let update: Partial<ModelConfig>
                let code: string | undefined
                try {
                    const response = await fetch(
                        getApiEndpoint("/api/validate-model"),
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-access-code":
                                    localStorage.getItem(
                                        STORAGE_KEYS.accessCode,
                                    ) || "",
                            },
                            body: JSON.stringify({
                                provider: selectedProvider.provider,
                                apiKey: selectedProvider.apiKey,
                                baseUrl,
                                modelId: model.modelId,
                                // AWS Bedrock credentials
                                awsAccessKeyId: selectedProvider.awsAccessKeyId,
                                awsSecretAccessKey:
                                    selectedProvider.awsSecretAccessKey,
                                awsRegion: selectedProvider.awsRegion,
                                // Temporary AWS credentials, as the chat sends
                                awsSessionToken:
                                    selectedProvider.awsSessionToken,
                                // Vertex AI credentials (Express Mode)
                                vertexApiKey: selectedProvider.vertexApiKey,
                            }),
                        },
                    )
                    const data = await response.json().catch(() => ({}))
                    code = data.valid ? undefined : data.code
                    update = data.valid
                        ? {
                              validated: true,
                              validationError: undefined,
                              validationWarning: data.warning,
                              responseTime: data.responseTime,
                          }
                        : {
                              validated: false,
                              // The hint for the error's kind, then the
                              // provider's own message
                              validationError:
                                  [hints[data.code], data.error]
                                      .filter(Boolean)
                                      .join(" ") ||
                                  (response.ok
                                      ? t.validationError
                                      : formatMessage(t.requestFailed, {
                                            status: response.status,
                                        })),
                              validationWarning: undefined,
                          }
                } catch {
                    update = {
                        validated: false,
                        validationError: dict.errors.networkError,
                        validationWarning: undefined,
                    }
                }
                // A newer test started: its own results and spinners count,
                // whatever the credentials are now (they may have come back)
                if (run !== latestTestRun.get(selectedProviderId)) return
                // Credentials changed during the test: drop the result. A
                // change in another tab left the spinner on, so clear it
                // (model ids are unique, whatever provider is shown).
                if (credentialsOf(selectedProviderId) !== askedWith) {
                    setValidatingModelIds((prev) => {
                        const next = new Set(prev)
                        next.delete(model.id)
                        return next
                    })
                    return
                }
                // So did this model's id: the result is for the old one
                const current = providersNow()
                    .find((p) => p.id === selectedProviderId)
                    ?.models.find((m) => m.id === model.id)
                if (current?.modelId !== model.modelId) {
                    idChanged = true
                    setValidatingModelIds((prev) => {
                        const next = new Set(prev)
                        next.delete(model.id)
                        return next
                    })
                    return
                }
                if (update.validated === false) {
                    allValid = false
                    errorCount++
                    if (code === "invalid_api_key") rejected = true
                }
                updateModel(selectedProviderId, model.id, update)
                setValidatingModelIds((prev) => {
                    const next = new Set(prev)
                    next.delete(model.id)
                    return next
                })
            }),
        )
        if (run !== latestTestRun.get(selectedProviderId)) return
        if (credentialsOf(selectedProviderId) !== askedWith) {
            // The status line is about the provider shown now
            if (selectedProviderIdRef.current === selectedProviderId) {
                setValidationStatus("idle")
            }
            return
        }

        // A model whose id changed was not tested
        if (allValid && !idChanged) {
            updateProvider(selectedProviderId, { validated: true })
        }
        markRejected(selectedProviderId, askedWith, rejected)
        // The status line is about the provider shown now
        if (selectedProviderIdRef.current !== selectedProviderId) return
        if (idChanged) {
            setValidationStatus("idle")
        } else if (allValid) {
            setValidationStatus("success")
        } else {
            setValidationStatus("error")
            setValidationError(
                formatMessage(
                    errorCount === 1
                        ? t.validationFailedCountOne
                        : t.validationFailedCountOther,
                    { count: errorCount },
                ),
            )
        }
    }, [
        selectedProvider,
        selectedProviderId,
        updateProvider,
        updateModel,
        dict,
    ])

    // Plaintext secret input with show/hide toggle (the user dialog stores
    // keys client-side, so values are shown directly — unlike the masked
    // admin panel)
    const renderProviderSecret = (
        field: SecretField | "awsSessionToken",
        id: string,
    ) => {
        if (!selectedProvider) return null
        const value = (selectedProvider[field] as string | undefined) ?? ""
        return (
            <div className="relative flex-1">
                <Input
                    id={id}
                    // A provider still without credentials: they come first
                    // (one of these three is shown at a time)
                    autoFocus={
                        !hasCredentials(selectedProvider) &&
                        (field === "apiKey" ||
                            field === "vertexApiKey" ||
                            field === "awsAccessKeyId")
                    }
                    type={showApiKey ? "text" : "password"}
                    value={value}
                    onChange={(e) =>
                        handleProviderUpdate({ [field]: e.target.value })
                    }
                    placeholder={
                        field === "awsSecretAccessKey"
                            ? t.enterSecretKey
                            : field === "awsAccessKeyId"
                              ? "AKIA..."
                              : field === "awsSessionToken"
                                ? undefined
                                : t.enterApiKey
                    }
                    aria-invalid={keyRejected || undefined}
                    className={cn(
                        "h-9 pr-10 font-mono text-xs",
                        keyRejected &&
                            "border-destructive/60 focus-visible:ring-destructive/30",
                    )}
                />
                <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? t.hideValue : t.showValue}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                >
                    {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                    ) : (
                        <Eye className="h-4 w-4" />
                    )}
                </button>
            </div>
        )
    }

    const providerName = (p: ProviderConfig) =>
        p.name || PROVIDER_INFO[p.provider].label

    const renderModelRow = (model: ModelConfig) => {
        if (!selectedProvider) return null
        const testing = validatingModelIds.has(model.id)
        const seconds = model.responseTime
            ? (model.responseTime / 1000).toFixed(1)
            : undefined
        return (
            <div
                key={model.id}
                className={cn(
                    "transition-colors duration-150",
                    model.validated === false && !testing
                        ? "bg-destructive/5"
                        : "hover:bg-interactive-hover/50",
                )}
            >
                <div className="flex items-center gap-2.5 px-3 py-1.5 min-w-0">
                    <span className="flex size-5 shrink-0 items-center justify-center">
                        {testing ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : model.validated === true ? (
                            <CheckCircle2 className="size-4 text-success" />
                        ) : model.validated === false ? (
                            <AlertCircle className="size-4 text-destructive" />
                        ) : (
                            <CircleDashed className="size-4 text-muted-foreground" />
                        )}
                    </span>
                    <Input
                        value={
                            modelIdDraft?.id === model.id
                                ? modelIdDraft.value
                                : model.modelId
                        }
                        title={model.modelId}
                        aria-label={t.modelId}
                        onChange={(e) => {
                            // Allow free typing - validation happens on blur
                            // Clear edit error when typing
                            if (editError?.modelId === model.id) {
                                setEditError(null)
                            }
                            setModelIdDraft({
                                id: model.id,
                                value: e.target.value,
                            })
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.currentTarget.blur()
                            }
                        }}
                        onBlur={(e) => {
                            const newModelId = e.target.value.trim()
                            // Drop the draft; an invalid ID falls back to the saved one
                            setModelIdDraft(null)

                            // Helper to show error with shake
                            const showError = (message: string) => {
                                setEditError({ modelId: model.id, message })
                                e.target.animate(
                                    [
                                        { transform: "translateX(0)" },
                                        { transform: "translateX(-4px)" },
                                        { transform: "translateX(4px)" },
                                        { transform: "translateX(-4px)" },
                                        { transform: "translateX(4px)" },
                                        { transform: "translateX(0)" },
                                    ],
                                    { duration: 400, easing: "ease-in-out" },
                                )
                                e.target.focus()
                            }

                            // Check for empty model name
                            if (!newModelId) {
                                showError(t.modelIdEmpty)
                                return
                            }

                            // Check for duplicate
                            const otherModelIds =
                                selectedProvider?.models
                                    .filter((m) => m.id !== model.id)
                                    .map((m) => m.modelId) || []
                            if (otherModelIds.includes(newModelId)) {
                                showError(t.modelIdExists)
                                return
                            }

                            // Clear error on valid blur
                            setEditError(null)
                            if (
                                selectedProviderId &&
                                newModelId !== model.modelId
                            ) {
                                updateModel(selectedProviderId, model.id, {
                                    modelId: newModelId,
                                    validated: undefined,
                                    validationError: undefined,
                                    validationWarning: undefined,
                                    responseTime: undefined,
                                })
                            }
                        }}
                        className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1.5 font-mono text-sm shadow-none focus-visible:bg-background focus-visible:ring-1 dark:bg-transparent"
                    />
                    {!testing && (
                        <span
                            className={cn(
                                "shrink-0 text-xs",
                                model.validated === true
                                    ? "text-success"
                                    : model.validated === false
                                      ? "text-destructive"
                                      : "text-muted-foreground",
                            )}
                        >
                            {model.validated === true
                                ? seconds
                                    ? formatMessage(t.modelWorksTime, {
                                          seconds,
                                      })
                                    : t.modelWorks
                                : model.validated === false
                                  ? t.modelFailed
                                  : t.modelUntested}
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteModel(model.id)}
                        aria-label={`${dict.common.delete} ${model.modelId}`}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                {/* Show validation error inline */}
                {model.validated === false && model.validationError && (
                    <p className="px-3 pb-2 pl-11 text-xs text-destructive">
                        {model.validationError}
                    </p>
                )}
                {!model.validationWarning &&
                    getModelInfo?.(selectedProvider.provider, model.modelId)
                        ?.tools === false && (
                        <p className="px-3 pb-2 pl-11 text-xs text-amber-600 dark:text-amber-400">
                            {t.mayNotDraw}
                        </p>
                    )}
                {model.validated && model.validationWarning && (
                    <p className="px-3 pb-2 pl-11 text-xs text-amber-600 dark:text-amber-400">
                        {model.validationWarning}
                    </p>
                )}
                {/* Show edit error inline */}
                {editError?.modelId === model.id && (
                    <p className="px-3 pb-2 pl-11 text-xs text-destructive">
                        {editError.message}
                    </p>
                )}
            </div>
        )
    }

    const renderProviderPage = (provider: ProviderConfig) => {
        const models = provider.models
        const credentialsDone = hasCredentials(provider)
        const allWork =
            models.length > 0 && models.every((m) => m.validated === true)
        const firstWorking = models.find((m) => m.validated === true)
        const lastSeconds =
            models.length === 1 && models[0].responseTime
                ? (models[0].responseTime / 1000).toFixed(1)
                : undefined
        const canTest = credentialsDone && models.length > 0
        const testing = validationStatus === "validating"
        const testBlocker = !credentialsDone
            ? provider.provider === "bedrock"
                ? t.needAws
                : provider.provider === "azure"
                  ? t.needAzure
                  : t.needKey
            : models.length === 0
              ? t.needModel
              : ""
        const fetchLabel = formatMessage(t.fetchAllModels, {
            name: providerName(provider),
        })
        const testPassed = validationStatus === "success" && allWork
        // Until the failed models change, here or in another tab
        const testFailed =
            validationStatus === "error" &&
            !!validationError &&
            models.some((m) => m.validated === false)
        const passedText =
            models.length === 1
                ? formatMessage(t.testPassedOne, { model: models[0].modelId })
                : formatMessage(t.testPassedAll, { count: models.length })
        const testLabel =
            models.length === 0
                ? t.stepTest
                : models.length === 1
                  ? formatMessage(t.testOne, { model: models[0].modelId })
                  : formatMessage(t.testAll, { count: models.length })

        return (
            <div className="flex min-h-0 flex-1 flex-col">
                <SettingsHeader>
                    <button
                        type="button"
                        onClick={() => setModelsPage("list")}
                        className="rounded text-muted-foreground hover:text-foreground"
                    >
                        {t.models}
                    </button>
                    <ChevronRight className="size-3.5 text-muted-foreground/60" />
                    <span className="ml-0.5 flex size-6 items-center justify-center rounded-md bg-surface-2">
                        <ProviderLogo
                            provider={provider.provider}
                            className="size-3.5"
                        />
                    </span>
                    <h2
                        className="truncate font-semibold outline-none"
                        tabIndex={-1}
                        data-page-title
                    >
                        {providerName(provider)}
                    </h2>
                </SettingsHeader>
                <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-7 px-6 pt-1 pb-6">
                        {/* 1: credentials */}
                        <Step
                            n={1}
                            done={credentialsDone && !keyRejected}
                            title={t.stepConnect}
                        >
                            {provider.provider === "edgeone" ? (
                                <p className="text-xs text-muted-foreground">
                                    {t.edgeoneNoKey}
                                </p>
                            ) : (
                                <ProviderCredentialsFields
                                    // Its folded options and Bedrock choice
                                    // belong to this provider
                                    key={provider.id}
                                    provider={provider.provider}
                                    name={provider.name}
                                    baseUrl={provider.baseUrl}
                                    awsRegion={provider.awsRegion}
                                    bedrockApiKey
                                    settingsLayout
                                    bedrockFilled={{
                                        apiKey: !!provider.apiKey,
                                        accessKey:
                                            !!provider.awsAccessKeyId ||
                                            !!provider.awsSecretAccessKey,
                                    }}
                                    clearSecrets={clearSecrets}
                                    sessionTokenInput={renderProviderSecret(
                                        "awsSessionToken",
                                        "aws-session-token",
                                    )}
                                    onChange={(field, value) =>
                                        handleProviderUpdate({
                                            [field]: value,
                                        })
                                    }
                                    renderSecret={({ field, id }) =>
                                        renderProviderSecret(field, id)
                                    }
                                />
                            )}
                        </Step>

                        {/* 2: models */}
                        <Step
                            n={2}
                            done={models.length > 0}
                            title={t.stepModels}
                            action={
                                PROVIDER_INFO[provider.provider].modelList && (
                                    <button
                                        type="button"
                                        onClick={handleFetchModels}
                                        disabled={fetchingFor.includes(
                                            provider.id,
                                        )}
                                        title={fetchLabel}
                                        className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
                                    >
                                        {fetchingFor.includes(provider.id) ? (
                                            <Loader2 className="size-3 shrink-0 animate-spin" />
                                        ) : (
                                            <RefreshCw className="size-3 shrink-0" />
                                        )}
                                        <span className="truncate">
                                            {fetchLabel}
                                        </span>
                                    </button>
                                )
                            }
                        >
                            {fetchModelsError && (
                                <p className="text-xs text-destructive">
                                    {fetchModelsError}
                                </p>
                            )}
                            {models.length > 0 && (
                                <div className="overflow-hidden rounded-xl border border-border divide-y divide-border-subtle">
                                    {models.map(renderModelRow)}
                                </div>
                            )}
                            {quickSuggestions.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {t.suggestedLabel}
                                    </span>
                                    {quickSuggestions.map((modelId) => (
                                        <Button
                                            key={modelId}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 max-w-[260px] rounded-lg px-2 font-mono text-[11px]"
                                            title={modelId}
                                            onClick={() =>
                                                handleAddModel(modelId)
                                            }
                                        >
                                            <Plus className="h-3 w-3 shrink-0" />
                                            <span className="truncate">
                                                {modelId}
                                            </span>
                                        </Button>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <Input
                                        placeholder={t.orTypeModelId}
                                        aria-label={t.customModelId}
                                        value={customModelInput}
                                        onChange={(e) => {
                                            setCustomModelInput(e.target.value)
                                            if (duplicateError) {
                                                setDuplicateError("")
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            // Enter that confirms an IME
                                            // candidate adds nothing
                                            if (
                                                e.nativeEvent.isComposing ||
                                                e.keyCode === 229
                                            ) {
                                                return
                                            }
                                            if (e.key === "Enter") {
                                                addCustomModel()
                                            }
                                        }}
                                        className={cn(
                                            "h-8 rounded-lg font-mono text-xs",
                                            duplicateError &&
                                                "border-destructive focus-visible:ring-destructive",
                                        )}
                                    />
                                    {duplicateError && (
                                        <p className="mt-1 text-[11px] text-destructive">
                                            {duplicateError}
                                        </p>
                                    )}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-lg"
                                    onClick={addCustomModel}
                                    disabled={!customModelInput.trim()}
                                >
                                    {t.add}
                                </Button>
                                {/* Nothing to browse for a provider without
                                    suggested models, until its list is fetched.
                                    modal: the dialog blocks the wheel outside
                                    itself, and the list is rendered outside it */}
                                {suggestedModels.length > 0 && (
                                    <Popover
                                        modal
                                        open={modelPickerOpen}
                                        onOpenChange={setModelPickerOpen}
                                    >
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 rounded-lg text-xs"
                                                disabled={
                                                    availableSuggestions.length ===
                                                    0
                                                }
                                            >
                                                {availableSuggestions.length ===
                                                0
                                                    ? t.allAdded
                                                    : t.browseModels}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            className="w-80 p-0"
                                            align="end"
                                        >
                                            <Command>
                                                <CommandInput
                                                    placeholder={t.searchModels}
                                                />
                                                <CommandList className="max-h-72">
                                                    <CommandEmpty>
                                                        {t.noModelsFound}
                                                    </CommandEmpty>
                                                    {availableSuggestions.map(
                                                        (model) => (
                                                            <CommandItem
                                                                key={model.id}
                                                                value={model.id}
                                                                onSelect={() => {
                                                                    handleAddModel(
                                                                        model.id,
                                                                    )
                                                                    setModelPickerOpen(
                                                                        false,
                                                                    )
                                                                }}
                                                                className="font-mono text-xs"
                                                            >
                                                                <span className="truncate">
                                                                    {model.id}
                                                                </span>
                                                                {supportsTools(
                                                                    model,
                                                                ) === false && (
                                                                    <span className="ml-auto shrink-0 font-sans text-[10px] text-amber-600 dark:text-amber-400">
                                                                        {
                                                                            t.noTools
                                                                        }
                                                                    </span>
                                                                )}
                                                            </CommandItem>
                                                        ),
                                                    )}
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        </Step>

                        {/* 3: test */}
                        <Step n={3} done={allWork} title={t.stepTest}>
                            {/* Always on the page, so a screen reader reads
                                out the result when it arrives */}
                            <p
                                id={resultId}
                                role="status"
                                className="sr-only"
                                data-testid="test-result"
                            >
                                {testPassed
                                    ? passedText
                                    : testFailed
                                      ? validationError
                                      : ""}
                            </p>
                            {testPassed ? (
                                <div className="space-y-3 rounded-xl border border-success/20 bg-success-muted/70 px-4 py-3.5">
                                    <p className="flex items-start gap-2 text-[13px] font-medium text-success">
                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                                        {/* A long model id wraps */}
                                        <span className="min-w-0 [overflow-wrap:anywhere]">
                                            {passedText}
                                            {lastSeconds && (
                                                <span className="ml-2 text-xs font-normal opacity-80">
                                                    {formatMessage(
                                                        t.answeredIn,
                                                        {
                                                            seconds:
                                                                lastSeconds,
                                                        },
                                                    )}
                                                </span>
                                            )}
                                        </span>
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {firstWorking && (
                                            <Button
                                                ref={useButtonRef}
                                                className="h-9 max-w-full rounded-lg px-4"
                                                disabled={chatLocked}
                                                aria-describedby={resultId}
                                                title={formatMessage(
                                                    t.useInChat,
                                                    {
                                                        model: firstWorking.modelId,
                                                    },
                                                )}
                                                onClick={() => {
                                                    modelConfig.setSelectedModelId(
                                                        firstWorking.id,
                                                    )
                                                    useUiStore
                                                        .getState()
                                                        .setSettingsOpen(false)
                                                }}
                                            >
                                                <span className="truncate">
                                                    {formatMessage(
                                                        t.useInChat,
                                                        {
                                                            model: firstWorking.modelId,
                                                        },
                                                    )}
                                                </span>
                                            </Button>
                                        )}
                                        <Button
                                            ref={backButtonRef}
                                            variant="outline"
                                            className="h-9 rounded-lg bg-background px-4"
                                            aria-describedby={resultId}
                                            onClick={() =>
                                                setModelsPage("list")
                                            }
                                        >
                                            {t.backToProviders}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-xs text-muted-foreground">
                                        {t.testHint}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button
                                            // Not disabled while it runs: the
                                            // focus would leave it
                                            onClick={() => {
                                                if (!testing) handleValidate()
                                            }}
                                            disabled={!canTest}
                                            aria-disabled={testing || undefined}
                                            className="h-9 max-w-full rounded-lg px-4"
                                            title={testLabel}
                                            data-testid="test-models"
                                        >
                                            {validationStatus ===
                                                "validating" && (
                                                <Loader2 className="size-4 animate-spin" />
                                            )}
                                            <span className="truncate">
                                                {testLabel}
                                            </span>
                                        </Button>
                                        {testFailed && (
                                            <p className="flex items-center gap-1 text-xs text-destructive">
                                                <X className="size-3" />
                                                {validationError}
                                            </p>
                                        )}
                                    </div>
                                    {testBlocker && (
                                        <p className="text-xs text-muted-foreground">
                                            {testBlocker}
                                        </p>
                                    )}
                                </>
                            )}
                        </Step>

                        <button
                            type="button"
                            onClick={() => setDeleteConfirmOpen(true)}
                            className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
                        >
                            <Trash2 className="size-3.5" />
                            {formatMessage(
                                models.length === 0
                                    ? t.deleteProviderOnly
                                    : models.length === 1
                                      ? t.deleteProviderNamedOne
                                      : t.deleteProviderNamedOther,
                                {
                                    name: providerName(provider),
                                    count: models.length,
                                },
                            )}
                        </button>
                    </div>
                </ScrollArea>
            </div>
        )
    }

    return (
        <>
            <div ref={pageRef} className="flex min-h-0 flex-1 flex-col">
                {selectedProvider ? (
                    renderProviderPage(selectedProvider)
                ) : page === "picker" ? (
                    <ProviderPicker
                        added={config.providers.map((p) => p.provider)}
                        onPick={handleAddProvider}
                        onBack={() => setModelsPage("list")}
                    />
                ) : (
                    <ProvidersList
                        providers={config.providers}
                        serverModels={modelConfig.models.filter(
                            (m) => m.source === "server",
                        )}
                        selectedModelId={modelConfig.selectedModelId}
                        onOpen={openProvider}
                        onAdd={handleAddProvider}
                        onBrowse={() => setModelsPage("picker")}
                    />
                )}
            </div>

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
                            {t.deleteProvider}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-center">
                            {formatMessage(t.deleteConfirmDesc, {
                                name: selectedProvider
                                    ? providerName(selectedProvider)
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
                                    {formatMessage(t.typeToConfirm, {
                                        name: providerName(selectedProvider),
                                    })}
                                </Label>
                                <Input
                                    id="delete-confirm"
                                    value={deleteConfirmText}
                                    onChange={(e) =>
                                        setDeleteConfirmText(e.target.value)
                                    }
                                    placeholder={t.typeProviderName}
                                    className="h-9"
                                />
                            </div>
                        )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteProvider}
                            disabled={
                                selectedProvider &&
                                selectedProvider.models.length >= 3 &&
                                deleteConfirmText !==
                                    providerName(selectedProvider)
                            }
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                        >
                            {t.delete}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
