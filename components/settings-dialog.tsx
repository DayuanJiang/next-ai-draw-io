"use client"

import { Github, Info, Moon, Sun, Tag } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useDictionary } from "@/hooks/use-dictionary"
import { getApiEndpoint } from "@/lib/base-path"
import type { DrawioTheme } from "@/lib/drawio-themes"
import { i18n, type Locale } from "@/lib/i18n/config"
import { STORAGE_KEYS } from "@/lib/storage"

// Reusable setting item component for consistent layout
function SettingItem({
    label,
    description,
    children,
}: {
    label: string
    description?: string
    children: React.ReactNode
}) {
    return (
        <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
            <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">{label}</Label>
                {description && (
                    <p className="text-xs text-muted-foreground max-w-[260px]">
                        {description}
                    </p>
                )}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    )
}

const LANGUAGE_LABELS: Record<Locale, string> = {
    en: "English",
    zh: "中文",
    ja: "日本語",
}

// Mapping of Draw.io theme values to their translation dictionary keys
const DRAWIO_THEME_LABELS: Record<
    DrawioTheme,
    keyof typeof DRAWIO_THEMES | string
> = {
    kennedy: "classic",
    simple: "simple",
    min: "minimal",
    sketch: "sketch",
    atlas: "atlas",
}

interface SettingsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCloseProtectionChange?: (enabled: boolean) => void
    drawioUi: DrawioTheme
    onDrawioUiChange: (theme: DrawioTheme) => void
    darkMode: boolean
    onToggleDarkMode: () => void
    minimalStyle?: boolean
    onMinimalStyleChange?: (value: boolean) => void
}

export const STORAGE_ACCESS_CODE_KEY = "next-ai-draw-io-access-code"
const STORAGE_ACCESS_CODE_REQUIRED_KEY = "next-ai-draw-io-access-code-required"

function getStoredAccessCodeRequired(): boolean | null {
    if (typeof window === "undefined") return null
    const stored = localStorage.getItem(STORAGE_ACCESS_CODE_REQUIRED_KEY)
    if (stored === null) return null
    return stored === "true"
}

function SettingsContent({
    open,
    onOpenChange,
    drawioUi,
    onDrawioUiChange,
    darkMode,
    onToggleDarkMode,
    minimalStyle = false,
    onMinimalStyleChange = () => {},
}: SettingsDialogProps) {
    const dict = useDictionary()
    const router = useRouter()
    const pathname = usePathname() || "/"
    const search = useSearchParams()
    const [accessCode, setAccessCode] = useState("")
    const [isVerifying, setIsVerifying] = useState(false)
    const [error, setError] = useState("")
    const [accessCodeRequired, setAccessCodeRequired] = useState(
        () => getStoredAccessCodeRequired() ?? false,
    )
    const [currentLang, setCurrentLang] = useState("en")
    const [sendShortcut, setSendShortcut] = useState("ctrl-enter")

    // Proxy settings state (Electron only)
    const [httpProxy, setHttpProxy] = useState("")
    const [httpsProxy, setHttpsProxy] = useState("")
    const [isApplyingProxy, setIsApplyingProxy] = useState(false)

    useEffect(() => {
        // Only fetch if not cached in localStorage
        if (getStoredAccessCodeRequired() !== null) return

        fetch(getApiEndpoint("/api/config"))
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json()
            })
            .then((data) => {
                const required = data?.accessCodeRequired === true
                localStorage.setItem(
                    STORAGE_ACCESS_CODE_REQUIRED_KEY,
                    String(required),
                )
                setAccessCodeRequired(required)
            })
            .catch(() => {
                // Don't cache on error - allow retry on next mount
                setAccessCodeRequired(false)
            })
    }, [])

    // Detect current language from pathname
    useEffect(() => {
        const seg = pathname.split("/").filter(Boolean)
        const first = seg[0]
        if (first && i18n.locales.includes(first as Locale)) {
            setCurrentLang(first)
        } else {
            setCurrentLang(i18n.defaultLocale)
        }
    }, [pathname])

    useEffect(() => {
        if (open) {
            const storedCode =
                localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
            setAccessCode(storedCode)

            const storedSendShortcut = localStorage.getItem(
                STORAGE_KEYS.sendShortcut,
            )
            setSendShortcut(storedSendShortcut || "ctrl-enter")

            setError("")

            // Load proxy settings (Electron only)
            if (window.electronAPI?.getProxy) {
                window.electronAPI.getProxy().then((config) => {
                    setHttpProxy(config.httpProxy || "")
                    setHttpsProxy(config.httpsProxy || "")
                })
            }
        }
    }, [open])

    const changeLanguage = (lang: string) => {
        // Save locale to localStorage for persistence across restarts
        localStorage.setItem("next-ai-draw-io-locale", lang)

        const parts = pathname.split("/")
        if (parts.length > 1 && i18n.locales.includes(parts[1] as Locale)) {
            parts[1] = lang
        } else {
            parts.splice(1, 0, lang)
        }
        const newPath = parts.join("/") || "/"
        const searchStr = search?.toString() ? `?${search.toString()}` : ""
        router.push(newPath + searchStr)
    }

    const handleSave = async () => {
        if (!accessCodeRequired) return

        setError("")
        setIsVerifying(true)

        try {
            const response = await fetch(
                getApiEndpoint("/api/verify-access-code"),
                {
                    method: "POST",
                    headers: {
                        "x-access-code": accessCode.trim(),
                    },
                },
            )

            const data = await response.json()

            if (!data.valid) {
                setError(data.message || dict.errors.invalidAccessCode)
                return
            }

            localStorage.setItem(STORAGE_ACCESS_CODE_KEY, accessCode.trim())
            onOpenChange(false)
        } catch {
            setError(dict.errors.networkError)
        } finally {
            setIsVerifying(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault()
            handleSave()
        }
    }

    const handleApplyProxy = async () => {
        if (!window.electronAPI?.setProxy) return

        // Validate proxy URLs (must start with http:// or https://)
        const validateProxyUrl = (url: string): boolean => {
            if (!url) return true // Empty is OK
            return url.startsWith("http://") || url.startsWith("https://")
        }

        const trimmedHttp = httpProxy.trim()
        const trimmedHttps = httpsProxy.trim()

        if (trimmedHttp && !validateProxyUrl(trimmedHttp)) {
            toast.error("HTTP Proxy must start with http:// or https://")
            return
        }
        if (trimmedHttps && !validateProxyUrl(trimmedHttps)) {
            toast.error("HTTPS Proxy must start with http:// or https://")
            return
        }

        setIsApplyingProxy(true)
        try {
            const result = await window.electronAPI.setProxy({
                httpProxy: trimmedHttp || undefined,
                httpsProxy: trimmedHttps || undefined,
            })

            if (result.success) {
                toast.success(dict.settings.proxyApplied)
            } else {
                toast.error(result.error || "Failed to apply proxy settings")
            }
        } catch {
            toast.error("Failed to apply proxy settings")
        } finally {
            setIsApplyingProxy(false)
        }
    }

    return (
        <DialogContent className="sm:max-w-lg p-0 gap-0">
            {/* Header */}
            <DialogHeader className="px-6 pt-6 pb-4">
                <DialogTitle>{dict.settings.title}</DialogTitle>
                <DialogDescription className="mt-1">
                    {dict.settings.description}
                </DialogDescription>
            </DialogHeader>

            {/* Content */}
            <div className="px-6 pb-6">
                <div className="divide-y divide-border-subtle">
                    {/* Access Code (conditional) */}
                    {accessCodeRequired && (
                        <div className="py-4 first:pt-0 space-y-3">
                            <div className="space-y-0.5">
                                <Label
                                    htmlFor="access-code"
                                    className="text-sm font-medium"
                                >
                                    {dict.settings.accessCode}
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    {dict.settings.accessCodeDescription}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    id="access-code"
                                    type="password"
                                    value={accessCode}
                                    onChange={(e) =>
                                        setAccessCode(e.target.value)
                                    }
                                    onKeyDown={handleKeyDown}
                                    placeholder={
                                        dict.settings.accessCodePlaceholder
                                    }
                                    autoComplete="off"
                                    className="h-9"
                                />
                                <Button
                                    onClick={handleSave}
                                    disabled={isVerifying || !accessCode.trim()}
                                    className="h-9 px-4 rounded-xl"
                                >
                                    {isVerifying ? "..." : dict.common.save}
                                </Button>
                            </div>
                            {error && (
                                <p className="text-xs text-destructive">
                                    {error}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Language */}
                    <SettingItem
                        label={dict.settings.language}
                        description={dict.settings.languageDescription}
                    >
                        <Select
                            value={currentLang}
                            onValueChange={changeLanguage}
                        >
                            <SelectTrigger
                                id="language-select"
                                className="w-[120px] h-9 rounded-xl"
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
                    </SettingItem>

                    {/* Theme */}
                    <SettingItem
                        label={dict.settings.theme}
                        description={dict.settings.themeDescription}
                    >
                        <Button
                            id="theme-toggle"
                            variant="outline"
                            size="icon"
                            onClick={onToggleDarkMode}
                            className="h-9 w-9 rounded-xl border-border-subtle hover:bg-interactive-hover"
                        >
                            {darkMode ? (
                                <Sun className="h-4 w-4" />
                            ) : (
                                <Moon className="h-4 w-4" />
                            )}
                        </Button>
                    </SettingItem>

                    {/* Draw.io Style */}
                    <SettingItem
                        label={dict.settings.drawioStyle}
                        description={dict.settings.drawioStyleDescription}
                    >
                        <Select
                            value={drawioUi}
                            onValueChange={(value) =>
                                onDrawioUiChange(value as DrawioTheme)
                            }
                        >
                            <SelectTrigger
                                id="drawio-ui"
                                className="w-[120px] h-9 rounded-xl"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DRAWIO_THEMES.map((theme) => (
                                    <SelectItem key={theme} value={theme}>
                                        {
                                            dict.settings.themes[
                                                DRAWIO_THEME_LABELS[
                                                    theme
                                                ] as keyof typeof dict.settings.themes
                                            ]
                                        }
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </SettingItem>

                    {/* Diagram Style */}
                    <SettingItem
                        label={dict.settings.diagramStyle}
                        description={dict.settings.diagramStyleDescription}
                    >
                        <div className="flex items-center gap-2">
                            <Switch
                                id="minimal-style"
                                checked={minimalStyle}
                                onCheckedChange={onMinimalStyleChange}
                            />
                            <span className="text-sm text-muted-foreground">
                                {minimalStyle
                                    ? dict.chat.minimalStyle
                                    : dict.chat.styledMode}
                            </span>
                        </div>
                    </SettingItem>

                    {/* Send Shortcut */}
                    <SettingItem
                        label={dict.settings.sendShortcut}
                        description={dict.settings.sendShortcutDescription}
                    >
                        <Select
                            value={sendShortcut}
                            onValueChange={(value) => {
                                setSendShortcut(value)
                                localStorage.setItem(
                                    STORAGE_KEYS.sendShortcut,
                                    value,
                                )
                                window.dispatchEvent(
                                    new CustomEvent("sendShortcutChange", {
                                        detail: value,
                                    }),
                                )
                            }}
                        >
                            <SelectTrigger
                                id="send-shortcut-select"
                                className="w-[170px] h-9 rounded-xl"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="enter">
                                    {dict.settings.enterToSend}
                                </SelectItem>
                                <SelectItem value="ctrl-enter">
                                    {dict.settings.ctrlEnterToSend}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingItem>

                    {/* Proxy Settings - Electron only */}
                    {typeof window !== "undefined" &&
                        window.electronAPI?.isElectron && (
                            <div className="py-4 space-y-3">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-medium">
                                        {dict.settings.proxy}
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        {dict.settings.proxyDescription}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Input
                                        id="http-proxy"
                                        type="text"
                                        value={httpProxy}
                                        onChange={(e) =>
                                            setHttpProxy(e.target.value)
                                        }
                                        placeholder={`${dict.settings.httpProxy}: http://proxy:8080`}
                                        className="h-9"
                                    />
                                    <Input
                                        id="https-proxy"
                                        type="text"
                                        value={httpsProxy}
                                        onChange={(e) =>
                                            setHttpsProxy(e.target.value)
                                        }
                                        placeholder={`${dict.settings.httpsProxy}: http://proxy:8080`}
                                        className="h-9"
                                    />
                                </div>

                                <Button
                                    onClick={handleApplyProxy}
                                    disabled={isApplyingProxy}
                                    className="h-9 px-4 rounded-xl w-full"
                                >
                                    {isApplyingProxy
                                        ? "..."
                                        : dict.settings.applyProxy}
                                </Button>
                            </div>
                        )}
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border-subtle bg-surface-1/50 rounded-b-2xl">
                <div className="flex items-center justify-center gap-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {process.env.APP_VERSION}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <a
                        href="https://github.com/DayuanJiang/next-ai-draw-io"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                        <Github className="h-3 w-3" />
                        GitHub
                    </a>
                    {process.env.NEXT_PUBLIC_SHOW_ABOUT_AND_NOTICE ===
                        "true" && (
                        <>
                            <span className="text-muted-foreground">·</span>
                            <a
                                href={`/${currentLang}/about${currentLang === "zh" ? "/cn" : currentLang === "ja" ? "/ja" : ""}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                                <Info className="h-3 w-3" />
                                {dict.nav.about}
                            </a>
                        </>
                    )}
                </div>
            </div>
        </DialogContent>
    )
}

export function SettingsDialog(props: SettingsDialogProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <Suspense
                fallback={
                    <DialogContent className="sm:max-w-lg p-0">
                        <div className="h-80 flex items-center justify-center">
                            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                        </div>
                    </DialogContent>
                }
            >
                <SettingsContent {...props} />
            </Suspense>
        </Dialog>
    )
}
