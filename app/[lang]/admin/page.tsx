"use client"

import {
    AlertTriangle,
    Check,
    Loader2,
    LockKeyhole,
    ShieldCheck,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    SETTING_GROUPS,
    SETTINGS_BY_GROUP,
} from "@/lib/admin/settings-registry"
import { getApiEndpoint } from "@/lib/base-path"
import { formatMessage } from "@/lib/i18n/utils"
import { cn } from "@/lib/utils"
import {
    type AdminProvider,
    adminFetch,
    type EnvProvider,
    isSecretValue,
    SESSION_PASSWORD_KEY,
    type SettingState,
    type SettingsMap,
    savedTextOf,
} from "./admin-shared"
import { ModelsSection } from "./models-section"
import { SettingField } from "./setting-field"

// ── Page ─────────────────────────────────────────────────────────────

const NAV_GROUP_IDS = ["models", ...SETTING_GROUPS.map((g) => g.id)]

export default function AdminPage() {
    const dict = useDictionary()
    // Localized group title/description, keyed by group id
    const groupText = (id: string) =>
        (
            dict.admin.groups as Record<
                string,
                { title: string; description: string } | undefined
            >
        )[id]
    const navItems = NAV_GROUP_IDS.map((id) => ({
        id,
        title:
            id === "models" ? dict.admin.models : (groupText(id)?.title ?? id),
    }))
    const [password, setPassword] = useState("")
    const [authedPassword, setAuthedPassword] = useState<string | null>(null)
    const [authError, setAuthError] = useState("")
    const [authLoading, setAuthLoading] = useState(false)

    const [writable, setWritable] = useState(true)

    // Models section state
    const [providers, setProviders] = useState<AdminProvider[]>([])
    const [envProviders, setEnvProviders] = useState<EnvProvider[]>([])
    const [savedProviders, setSavedProviders] = useState<string>("[]")
    const providersDirty = JSON.stringify(providers) !== savedProviders

    // General settings state
    const [settings, setSettings] = useState<SettingsMap>({})
    const [pending, setPending] = useState<Record<string, string | null>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [enabledGroups, setEnabledGroups] = useState<Record<string, boolean>>(
        {},
    )

    const [saving, setSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState<{
        ok: boolean
        text: string
    } | null>(null)
    const [activeGroup, setActiveGroup] = useState("models")

    const dirtyCount = Object.keys(pending).length + (providersDirty ? 1 : 0)

    const applySettingsResponse = useCallback(
        (data: { writable: boolean; settings: SettingState[] }) => {
            setWritable(data.writable)
            const map: SettingsMap = {}
            for (const s of data.settings) map[s.key] = s
            setSettings(map)
            // Seed each toggle once from whether the group has configured
            // values; don't stomp a user's explicit toggle on later saves
            setEnabledGroups((prev) => {
                const next = { ...prev }
                for (const group of SETTING_GROUPS) {
                    if (!group.toggleable || group.id in next) continue
                    next[group.id] = !!SETTINGS_BY_GROUP.get(group.id)?.some(
                        (d) => map[d.key]?.source !== "default",
                    )
                }
                return next
            })
        },
        [],
    )

    const applyProvidersResponse = useCallback(
        (data: {
            providers: AdminProvider[]
            envProviders?: EnvProvider[]
        }) => {
            setProviders(data.providers)
            setSavedProviders(JSON.stringify(data.providers))
            setEnvProviders(data.envProviders ?? [])
        },
        [],
    )

    const login = useCallback(
        async (pw: string) => {
            setAuthLoading(true)
            setAuthError("")
            try {
                const [settingsData, providersData] = await Promise.all([
                    adminFetch("/api/admin/settings", pw),
                    adminFetch("/api/admin/providers", pw),
                ])
                applySettingsResponse(settingsData)
                applyProvidersResponse(providersData)
                setAuthedPassword(pw)
                sessionStorage.setItem(SESSION_PASSWORD_KEY, pw)
            } catch (err) {
                setAuthError(
                    err instanceof Error ? err.message : dict.admin.loginFailed,
                )
            } finally {
                setAuthLoading(false)
            }
        },
        [applySettingsResponse, applyProvidersResponse, dict],
    )

    // Restore session on mount
    useEffect(() => {
        const stored = sessionStorage.getItem(SESSION_PASSWORD_KEY)
        if (stored) void login(stored)
    }, [login])

    // Warn before leaving with unsaved changes
    const hasDirty = dirtyCount > 0
    useEffect(() => {
        if (!hasDirty) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            // Some browsers only show the prompt when returnValue is set
            e.returnValue = ""
        }
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [hasDirty])

    // Highlight the section currently in view in the sidebar
    useEffect(() => {
        if (!authedPassword) return
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort(
                        (a, b) =>
                            a.boundingClientRect.top - b.boundingClientRect.top,
                    )
                if (visible[0]) setActiveGroup(visible[0].target.id)
            },
            { rootMargin: "-10% 0px -50% 0px" },
        )
        for (const id of NAV_GROUP_IDS) {
            const el = document.getElementById(id)
            if (el) observer.observe(el)
        }
        return () => observer.disconnect()
    }, [authedPassword])

    const handleChange = useCallback(
        (key: string, value: string | null) => {
            setSaveMessage(null)
            setErrors((prev) => {
                if (!(key in prev)) return prev
                const next = { ...prev }
                delete next[key]
                return next
            })
            setPending((prev) => {
                const state = settings[key]
                const isRevert =
                    value !== null &&
                    state?.source === "file" &&
                    !isSecretValue(state?.value) &&
                    value === savedTextOf(state)
                const isNoop =
                    value === "" &&
                    (!state || state.source !== "file") &&
                    !isSecretValue(state?.value)
                if (isRevert || isNoop) {
                    const next = { ...prev }
                    delete next[key]
                    return next
                }
                return { ...prev, [key]: value === "" ? null : value }
            })
        },
        [settings],
    )

    // Toggling a group off stages deletion of its saved values so the
    // feature actually turns off on save; toggling on drops those deletions.
    const handleGroupToggle = useCallback(
        (groupId: string, enabled: boolean) => {
            setSaveMessage(null)
            setEnabledGroups((prev) => ({ ...prev, [groupId]: enabled }))
            const keys = (SETTINGS_BY_GROUP.get(groupId) ?? []).map(
                (d) => d.key,
            )
            setPending((prev) => {
                const next = { ...prev }
                for (const key of keys) {
                    if (!enabled) {
                        // Stage deletion only for values currently set
                        if (settings[key]?.source !== "default")
                            next[key] = null
                    } else if (next[key] === null) {
                        delete next[key]
                    }
                }
                return next
            })
        },
        [settings],
    )

    const handleSave = useCallback(async () => {
        if (!authedPassword || dirtyCount === 0) return
        setSaving(true)
        setSaveMessage(null)
        setErrors({})
        try {
            if (providersDirty) {
                const data = await adminFetch(
                    "/api/admin/providers",
                    authedPassword,
                    { method: "PUT", body: JSON.stringify({ providers }) },
                )
                applyProvidersResponse(data)
            }
            if (Object.keys(pending).length > 0) {
                const res = await fetch(getApiEndpoint("/api/admin/settings"), {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "x-admin-password": authedPassword,
                    },
                    body: JSON.stringify({ values: pending }),
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) {
                    // Per-field validation errors come back as {errors: {...}}
                    if (data.errors) {
                        setErrors(data.errors)
                        const firstKey = Object.keys(data.errors)[0]
                        document.getElementById(`setting-${firstKey}`)?.focus()
                        throw new Error(dict.admin.invalidSettings)
                    }
                    throw new Error(
                        data.error || `Request failed (${res.status})`,
                    )
                }
                applySettingsResponse(data)
                setPending({})
            }
            setSaveMessage({
                ok: true,
                text: dict.admin.saved,
            })
            setTimeout(() => setSaveMessage(null), 4000)
        } catch (err) {
            setSaveMessage({
                ok: false,
                text:
                    err instanceof Error ? err.message : dict.admin.saveFailed,
            })
        } finally {
            setSaving(false)
        }
    }, [
        authedPassword,
        pending,
        providers,
        providersDirty,
        dirtyCount,
        applySettingsResponse,
        applyProvidersResponse,
        dict,
    ])

    // ── Login screen ─────────────────────────────────────────────────
    if (!authedPassword) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <form
                    className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void login(password)
                    }}
                >
                    <div className="flex items-center gap-2">
                        <LockKeyhole
                            className="h-5 w-5 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <h1 className="text-lg font-semibold">
                            {dict.admin.title}
                        </h1>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {dict.admin.loginPrompt}
                    </p>
                    <div className="space-y-1.5">
                        <Label htmlFor="admin-password">
                            {dict.admin.password}
                        </Label>
                        <Input
                            id="admin-password"
                            name="admin-password"
                            type="password"
                            value={password}
                            autoComplete="current-password"
                            spellCheck={false}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <p
                        className={cn(
                            "text-sm text-destructive",
                            !authError && "sr-only",
                        )}
                        aria-live="polite"
                    >
                        {authError}
                    </p>
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={authLoading}
                    >
                        {authLoading ? (
                            <>
                                <Loader2
                                    className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                                    aria-hidden="true"
                                />
                                {dict.admin.signingIn}
                            </>
                        ) : (
                            dict.admin.signIn
                        )}
                    </Button>
                </form>
            </div>
        )
    }

    // ── Settings screen ──────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-background">
            <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <ShieldCheck
                            className="h-5 w-5 text-primary"
                            aria-hidden="true"
                        />
                        <h1 className="text-lg font-semibold">
                            {dict.admin.title}
                        </h1>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {dict.admin.precedence}
                    </p>
                </div>
            </header>

            {!writable && (
                <div className="border-b bg-amber-500/10">
                    <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle
                            className="h-4 w-4 shrink-0"
                            aria-hidden="true"
                        />
                        {dict.admin.notWritable}
                    </div>
                </div>
            )}

            <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6">
                <nav
                    aria-label={dict.admin.settingGroups}
                    className="sticky top-20 hidden h-fit w-44 shrink-0 md:block"
                >
                    <ul className="space-y-1">
                        {navItems.map((item) => (
                            <li key={item.id}>
                                <a
                                    href={`#${item.id}`}
                                    aria-current={
                                        activeGroup === item.id
                                            ? "true"
                                            : undefined
                                    }
                                    className={cn(
                                        "block rounded-md px-3 py-1.5 text-sm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        activeGroup === item.id
                                            ? "bg-muted font-medium text-foreground"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {item.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                <main className="min-w-0 flex-1 pb-24">
                    {/* Models section */}
                    <section aria-labelledby="models" className="mb-10">
                        <h2
                            id="models"
                            className="scroll-mt-20 text-base font-semibold"
                        >
                            {dict.admin.models}
                        </h2>
                        <p className="mb-3 mt-1 text-sm text-muted-foreground text-pretty">
                            {dict.admin.modelsDescription}
                        </p>
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <ModelsSection
                                providers={providers}
                                envProviders={envProviders}
                                disabled={!writable || saving}
                                password={authedPassword}
                                onChange={(next) => {
                                    setSaveMessage(null)
                                    setProviders(next)
                                }}
                            />
                        </div>
                    </section>

                    {/* Registry-driven groups */}
                    {SETTING_GROUPS.map((group) => {
                        const defs = SETTINGS_BY_GROUP.get(group.id) ?? []
                        const groupOff =
                            group.toggleable && !enabledGroups[group.id]
                        const fieldsDisabled = !writable || saving || !!groupOff
                        const gt = groupText(group.id)
                        const title = gt?.title ?? group.title
                        return (
                            <section
                                key={group.id}
                                aria-labelledby={group.id}
                                className="mb-10"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <h2
                                        id={group.id}
                                        className="scroll-mt-20 text-base font-semibold"
                                    >
                                        {title}
                                    </h2>
                                    {group.toggleable && (
                                        <label
                                            className={cn(
                                                "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none",
                                                enabledGroups[group.id]
                                                    ? "border-primary/30 bg-primary/5 text-primary"
                                                    : "border-border bg-muted/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                            )}
                                        >
                                            {enabledGroups[group.id]
                                                ? dict.admin.enabled
                                                : dict.admin.disabled}
                                            <Switch
                                                checked={
                                                    !!enabledGroups[group.id]
                                                }
                                                disabled={!writable || saving}
                                                aria-label={formatMessage(
                                                    dict.admin.enableGroup,
                                                    { group: title },
                                                )}
                                                onCheckedChange={(checked) =>
                                                    handleGroupToggle(
                                                        group.id,
                                                        checked,
                                                    )
                                                }
                                            />
                                        </label>
                                    )}
                                </div>
                                <p className="mb-3 mt-1 text-sm text-muted-foreground text-pretty">
                                    {gt?.description ?? group.description}
                                </p>
                                <div
                                    className={cn(
                                        "rounded-lg border bg-card px-4",
                                        groupOff &&
                                            "pointer-events-none opacity-50",
                                    )}
                                >
                                    {defs.map((def) => (
                                        <SettingField
                                            key={def.key}
                                            def={def}
                                            state={settings[def.key]}
                                            pendingValue={pending[def.key]}
                                            error={errors[def.key]}
                                            disabled={fieldsDisabled}
                                            onChange={(v) =>
                                                handleChange(def.key, v)
                                            }
                                        />
                                    ))}
                                </div>
                            </section>
                        )
                    })}
                </main>
            </div>

            {/* Always-mounted live region so save results are announced */}
            <p aria-live="polite" className="sr-only">
                {saveMessage?.text ?? ""}
            </p>

            {(dirtyCount > 0 || saveMessage) && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
                    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
                        <p
                            className={cn(
                                "flex min-w-0 items-center gap-1.5 truncate text-sm",
                                saveMessage?.ok
                                    ? "text-green-600 dark:text-green-400"
                                    : saveMessage
                                      ? "text-destructive"
                                      : "text-muted-foreground",
                            )}
                        >
                            {saveMessage?.ok && (
                                <Check
                                    className="h-4 w-4 shrink-0"
                                    aria-hidden="true"
                                />
                            )}
                            {saveMessage && !saveMessage.ok
                                ? saveMessage.text
                                : dirtyCount > 0
                                  ? dict.admin.unsavedChanges
                                  : saveMessage?.text}
                        </p>
                        {dirtyCount > 0 && (
                            <div className="flex shrink-0 gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={saving}
                                    onClick={() => {
                                        setPending({})
                                        setErrors({})
                                        setProviders(JSON.parse(savedProviders))
                                    }}
                                >
                                    {dict.admin.discard}
                                </Button>
                                <Button
                                    type="button"
                                    disabled={saving || !writable}
                                    onClick={() => void handleSave()}
                                >
                                    {saving ? (
                                        <>
                                            <Loader2
                                                className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                                                aria-hidden="true"
                                            />
                                            {dict.admin.saving}
                                        </>
                                    ) : (
                                        dict.admin.saveChanges
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
