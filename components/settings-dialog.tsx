import {
    Github,
    Info,
    Monitor,
    Moon,
    PenTool,
    Settings2,
    Sparkles,
    Sun,
    Terminal,
} from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useChatEngine } from "@/components/chat/chat-engine"
import { ModelConfigDialog } from "@/components/model-config-dialog"
import { SettingsHeader } from "@/components/settings/settings-header"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { BrandMark } from "@/components/workspace/brand-mark"
import { useDictionary } from "@/hooks/use-dictionary"
import { getApiEndpoint } from "@/lib/base-path"
import { i18n, type Locale } from "@/lib/i18n/config"
import { STORAGE_KEYS } from "@/lib/storage"
import { cn } from "@/lib/utils"
import {
    type SendShortcut,
    type ThemePreference,
    useSettingsStore,
} from "@/stores/settings-store"
import { type SettingsTab, useUiStore } from "@/stores/ui-store"

const LANGUAGE_LABELS: Record<Locale, string> = {
    en: "English",
    zh: "中文",
    ja: "日本語",
    "zh-Hant": "繁體中文",
}

function Row({
    label,
    description,
    htmlFor,
    children,
    stacked = false,
}: {
    label: string
    description?: string
    htmlFor?: string
    children: React.ReactNode
    stacked?: boolean
}) {
    return (
        <div
            className={cn(
                "py-4 first:pt-1",
                stacked
                    ? "space-y-3"
                    : "flex items-center justify-between gap-6",
            )}
        >
            <div className="min-w-0 space-y-0.5">
                <label
                    htmlFor={htmlFor}
                    className="block text-[13px] font-medium text-foreground"
                >
                    {label}
                </label>
                {description && (
                    <p className="max-w-[34em] text-xs text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            <div className={cn(!stacked && "shrink-0")}>{children}</div>
        </div>
    )
}

function Segmented<T extends string>({
    value,
    options,
    onChange,
    label,
}: {
    value: T
    options: { value: T; label: string; icon?: React.ReactNode }[]
    onChange: (value: T) => void
    label: string
}) {
    return (
        <div
            role="radiogroup"
            aria-label={label}
            className="inline-flex rounded-lg bg-muted p-0.5"
        >
            {options.map((option) => (
                // biome-ignore lint/a11y/useSemanticElements: styled segmented control
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors [&_svg]:size-3.5",
                        value === option.value &&
                            "bg-card font-medium text-foreground shadow-float",
                    )}
                >
                    {option.icon}
                    {option.label}
                </button>
            ))}
        </div>
    )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="pt-6 pb-1 text-[11px] font-medium text-muted-foreground first:pt-0">
            {children}
        </h3>
    )
}

function GeneralTab({ open }: { open: boolean }) {
    const dict = useDictionary()
    const t = dict.settings
    const engine = useChatEngine()
    const router = useRouter()
    const pathname = usePathname() || "/"
    const search = useSearchParams()
    const theme = useSettingsStore((s) => s.theme)
    const setTheme = useSettingsStore((s) => s.setTheme)
    const sendShortcut = useSettingsStore((s) => s.sendShortcut)
    const setSendShortcut = useSettingsStore((s) => s.setSendShortcut)
    const currentLang =
        (pathname.split("/").filter(Boolean)[0] as Locale) || i18n.defaultLocale
    const [accessCode, setAccessCode] = useState("")
    const [accessCodeRequired, setAccessCodeRequired] = useState(
        () => localStorage.getItem(STORAGE_KEYS.accessCodeRequired) === "true",
    )
    const [isVerifying, setIsVerifying] = useState(false)
    const [accessError, setAccessError] = useState("")
    const [httpProxy, setHttpProxy] = useState("")
    const [httpsProxy, setHttpsProxy] = useState("")
    const [isApplyingProxy, setIsApplyingProxy] = useState(false)
    const isElectron =
        typeof window !== "undefined" && !!window.electronAPI?.isElectron

    useEffect(() => {
        if (!open) return
        setAccessCode(localStorage.getItem(STORAGE_KEYS.accessCode) || "")
        setAccessError("")
        // Re-check on every open: a stale cached value would hide the field
        fetch(getApiEndpoint("/api/config"))
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json()
            })
            .then((data) => {
                const required = data?.accessCodeRequired === true
                localStorage.setItem(
                    STORAGE_KEYS.accessCodeRequired,
                    String(required),
                )
                setAccessCodeRequired(required)
            })
            .catch(() => {})
        window.electronAPI?.getProxy?.().then((config: any) => {
            setHttpProxy(config.httpProxy || "")
            setHttpsProxy(config.httpsProxy || "")
        })
    }, [open])

    // The page mounts anew in the other language: the chat is saved first
    // (it may not be yet), and its session goes into the new URL
    const changeLanguage = (lang: string) =>
        engine.leavePage((sessionId) => {
            localStorage.setItem(STORAGE_KEYS.locale, lang)
            // The page reloads in the new language; close settings as before
            useUiStore.getState().setSettingsOpen(false)
            // Keep the desktop app's menu language in sync
            window.electronAPI
                ?.setUserLocale?.(lang)
                .catch((error: unknown) => {
                    console.error("Failed to sync locale with Electron:", error)
                })
            const parts = pathname.split("/")
            if (parts.length > 1 && i18n.locales.includes(parts[1] as Locale)) {
                parts[1] = lang
            } else {
                parts.splice(1, 0, lang)
            }
            const params = new URLSearchParams(search?.toString())
            if (sessionId) params.set("session", sessionId)
            const query = params.toString() ? `?${params.toString()}` : ""
            router.push((parts.join("/") || "/") + query)
        })

    const saveAccessCode = async () => {
        setAccessError("")
        setIsVerifying(true)
        try {
            const response = await fetch(
                getApiEndpoint("/api/verify-access-code"),
                {
                    method: "POST",
                    headers: { "x-access-code": accessCode.trim() },
                },
            )
            const data = await response.json()
            if (!data.valid) {
                setAccessError(data.message || dict.errors.invalidAccessCode)
                return
            }
            localStorage.setItem(STORAGE_KEYS.accessCode, accessCode.trim())
            toast.success(t.accessCodeSaved)
        } catch {
            setAccessError(dict.errors.networkError)
        } finally {
            setIsVerifying(false)
        }
    }

    const applyProxy = async () => {
        if (!window.electronAPI?.setProxy) return
        const isValid = (url: string) =>
            !url || url.startsWith("http://") || url.startsWith("https://")
        const http = httpProxy.trim()
        const https = httpsProxy.trim()
        if (!isValid(http) || !isValid(https)) {
            toast.error(t.proxyInvalid)
            return
        }
        setIsApplyingProxy(true)
        try {
            const result = await window.electronAPI.setProxy({
                httpProxy: http || undefined,
                httpsProxy: https || undefined,
            })
            if (result.success) toast.success(t.proxyApplied)
            else toast.error(result.error || t.proxyFailed)
        } catch {
            toast.error(t.proxyFailed)
        } finally {
            setIsApplyingProxy(false)
        }
    }

    return (
        <div>
            <SectionHeading>{t.sectionInterface}</SectionHeading>
            <div className="divide-y divide-border">
                <Row label={t.theme} description={t.themeDescription}>
                    <Segmented<ThemePreference>
                        label={t.theme}
                        value={theme}
                        onChange={setTheme}
                        options={[
                            {
                                value: "light",
                                label: t.themeLight,
                                icon: <Sun />,
                            },
                            {
                                value: "dark",
                                label: t.themeDarkMode,
                                icon: <Moon />,
                            },
                            {
                                value: "system",
                                label: t.themeSystem,
                                icon: <Monitor />,
                            },
                        ]}
                    />
                </Row>
                <Row
                    label={t.language}
                    description={t.languageDescription}
                    htmlFor="language-select"
                >
                    <Select
                        value={currentLang}
                        onValueChange={changeLanguage}
                        // Not while an answer runs: the page mounts anew
                        disabled={engine.isBusy}
                    >
                        <SelectTrigger
                            id="language-select"
                            className="h-8 w-[132px] rounded-lg"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {i18n.locales.map((locale) => (
                                <SelectItem key={locale} value={locale}>
                                    {LANGUAGE_LABELS[locale]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Row>
                <Row
                    label={t.sendShortcut}
                    description={t.sendShortcutDescription}
                    htmlFor="send-shortcut-select"
                >
                    <Select
                        value={sendShortcut}
                        onValueChange={(value) =>
                            setSendShortcut(value as SendShortcut)
                        }
                    >
                        <SelectTrigger
                            id="send-shortcut-select"
                            className="h-8 w-auto rounded-lg"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="enter">
                                {t.enterToSend}
                            </SelectItem>
                            <SelectItem value="ctrl-enter">
                                {t.ctrlEnterToSend}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </Row>
            </div>
            {(accessCodeRequired || isElectron) && (
                <>
                    <SectionHeading>{t.sectionAccess}</SectionHeading>
                    <div className="divide-y divide-border">
                        {accessCodeRequired && (
                            <Row
                                label={t.accessCode}
                                description={t.accessCodeDescription}
                                htmlFor="access-code"
                                stacked
                            >
                                <div className="flex gap-2">
                                    <Input
                                        id="access-code"
                                        type="password"
                                        value={accessCode}
                                        onChange={(e) =>
                                            setAccessCode(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault()
                                                saveAccessCode()
                                            }
                                        }}
                                        placeholder={t.accessCodePlaceholder}
                                        autoComplete="off"
                                        className="h-9"
                                    />
                                    <Button
                                        onClick={saveAccessCode}
                                        disabled={
                                            isVerifying || !accessCode.trim()
                                        }
                                        className="h-9 rounded-lg px-4"
                                    >
                                        {isVerifying ? "…" : dict.common.save}
                                    </Button>
                                </div>
                                {accessError && (
                                    <p className="text-xs text-destructive">
                                        {accessError}
                                    </p>
                                )}
                            </Row>
                        )}
                        {isElectron && (
                            <Row
                                label={t.proxy}
                                description={t.proxyDescription}
                                stacked
                            >
                                <div className="flex gap-2">
                                    <Input
                                        id="http-proxy"
                                        value={httpProxy}
                                        onChange={(e) =>
                                            setHttpProxy(e.target.value)
                                        }
                                        placeholder={`${t.httpProxy}: http://proxy:8080`}
                                        className="h-9"
                                    />
                                    <Input
                                        id="https-proxy"
                                        value={httpsProxy}
                                        onChange={(e) =>
                                            setHttpsProxy(e.target.value)
                                        }
                                        placeholder={`${t.httpsProxy}: http://proxy:8080`}
                                        className="h-9"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={applyProxy}
                                        disabled={isApplyingProxy}
                                        className="h-9 rounded-lg px-4"
                                    >
                                        {isApplyingProxy ? "…" : t.applyProxy}
                                    </Button>
                                </div>
                            </Row>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

function DrawingTab() {
    const dict = useDictionary()
    const t = dict.settings
    const settings = useSettingsStore()

    return (
        <div className="divide-y divide-border">
            <Row label={t.diagramStyle} description={t.diagramStyleDescription}>
                <Segmented<"styled" | "minimal">
                    label={t.diagramStyle}
                    value={settings.minimalStyle ? "minimal" : "styled"}
                    onChange={(value) =>
                        settings.setMinimalStyle(value === "minimal")
                    }
                    options={[
                        { value: "styled", label: dict.chat.styledMode },
                        { value: "minimal", label: dict.chat.minimalStyle },
                    ]}
                />
            </Row>
            <Row
                label={t.customSystemMessage}
                description={t.customSystemMessageDescription}
                htmlFor="custom-system-message"
                stacked
            >
                <Textarea
                    id="custom-system-message"
                    value={settings.customSystemMessage}
                    onChange={(e) =>
                        settings.setCustomSystemMessage(e.target.value)
                    }
                    placeholder={t.customSystemMessagePlaceholder}
                    className="max-h-[180px] min-h-[96px] text-sm"
                    maxLength={5000}
                />
            </Row>
            <Row
                label={t.diagramValidation}
                description={t.diagramValidationDescription}
                htmlFor="vlm-validation"
            >
                <Switch
                    id="vlm-validation"
                    checked={settings.vlmValidationEnabled}
                    onCheckedChange={settings.setVlmValidationEnabled}
                />
            </Row>
            <Row
                label={t.maxOutputTokens}
                description={t.maxOutputTokensDescription}
                htmlFor="max-output-tokens"
            >
                <Input
                    id="max-output-tokens"
                    type="text"
                    inputMode="numeric"
                    value={settings.maxOutputTokens}
                    onChange={(e) =>
                        settings.setMaxOutputTokens(e.target.value)
                    }
                    placeholder="64000"
                    className="h-8 w-28 text-sm"
                />
            </Row>
        </div>
    )
}

function AboutTab() {
    const dict = useDictionary()
    const pathname = usePathname() || "/"
    const lang = pathname.split("/").filter(Boolean)[0] || i18n.defaultLocale
    const showAbout = process.env.NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE === "true"
    const isSelfHosted = process.env.NEXT_PUBLIC_SELFHOSTED === "true"
    const aboutPath = `/${lang}/about${lang === "zh" ? "/cn" : lang === "ja" ? "/ja" : ""}`

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <BrandMark className="size-10 rounded-xl" />
                <div>
                    <div className="text-[15px] font-semibold">
                        Next AI Draw.io
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {dict.settings.appVersion} {process.env.APP_VERSION}
                    </div>
                </div>
            </div>
            {/* MCP server card, hidden on self-hosted deployments */}
            {!isSelfHosted && (
                <a
                    href="https://github.com/DayuanJiang/next-ai-draw-io/tree/main/packages/mcp-server"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-border p-3.5 transition-colors hover:border-foreground/25"
                >
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Terminal className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-[13px] font-medium">
                            {dict.examples.mcpServer}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                            {dict.examples.mcpDescription}
                        </span>
                    </span>
                </a>
            )}
            <div className="flex flex-wrap gap-2">
                <a
                    href="https://github.com/DayuanJiang/next-ai-draw-io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
                >
                    <Github className="size-3.5" />
                    GitHub
                </a>
                {showAbout && (
                    <a
                        href={aboutPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <Info className="size-3.5" />
                        {dict.settings.projectWebsite}
                    </a>
                )}
            </div>
        </div>
    )
}

export function SettingsDialog() {
    const dict = useDictionary()
    const t = dict.settings
    const engine = useChatEngine()
    const open = useUiStore((s) => s.settingsOpen)
    const setOpen = useUiStore((s) => s.setSettingsOpen)
    const tab = useUiStore((s) => s.settingsTab)
    const setTab = useUiStore((s) => s.setSettingsTab)

    const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
        { id: "models", label: t.tabModels, icon: <Sparkles /> },
        { id: "general", label: t.tabGeneral, icon: <Settings2 /> },
        { id: "drawing", label: t.tabDrawing, icon: <PenTool /> },
        { id: "about", label: t.tabAbout, icon: <Info /> },
    ]
    const current = tabs.find((item) => item.id === tab) ?? tabs[0]

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="flex h-[min(640px,88vh)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl md:flex-row">
                {/* On top below 768 px, where beside the page it would leave
                    too little width */}
                <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface-1 p-2 md:w-48 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-3">
                    <DialogTitle className="hidden px-2 pt-1 pb-3 text-[15px] md:block">
                        {t.title}
                    </DialogTitle>
                    {tabs.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            className={cn(
                                "flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] text-muted-foreground hover:text-foreground [&_svg]:size-4",
                                current.id === item.id &&
                                    "bg-card font-medium text-foreground shadow-float",
                            )}
                            aria-current={
                                current.id === item.id ? "page" : undefined
                            }
                            data-testid={`settings-tab-${item.id}`}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </nav>
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <DialogDescription className="sr-only">
                        {t.description}
                    </DialogDescription>
                    {current.id === "models" ? (
                        <ModelConfigDialog
                            open={open}
                            modelConfig={engine.modelConfig}
                        />
                    ) : (
                        <>
                            <SettingsHeader>
                                <h2 className="font-semibold">
                                    {current.label}
                                </h2>
                            </SettingsHeader>
                            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin">
                                {current.id === "general" && (
                                    <GeneralTab open={open} />
                                )}
                                {current.id === "drawing" && <DrawingTab />}
                                {current.id === "about" && <AboutTab />}
                            </div>
                        </>
                    )}
                </section>
            </DialogContent>
        </Dialog>
    )
}
