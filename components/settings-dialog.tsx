"use client"

import { Github, Info, Moon, Sun, Tag } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
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
import { i18n, type Locale } from "@/lib/i18n/config"

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

interface SettingsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCloseProtectionChange?: (enabled: boolean) => void
    drawioUi: "min" | "sketch"
    onToggleDrawioUi: () => void
    darkMode: boolean
    onToggleDarkMode: () => void
    minimalStyle?: boolean
    onMinimalStyleChange?: (value: boolean) => void
}

export const STORAGE_ACCESS_CODE_KEY = "next-ai-draw-io-access-code"
export const STORAGE_CLOSE_PROTECTION_KEY = "next-ai-draw-io-close-protection"
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
    onCloseProtectionChange,
    drawioUi,
    onToggleDrawioUi,
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
    const [closeProtection, setCloseProtection] = useState(true)
    const [isVerifying, setIsVerifying] = useState(false)
    const [error, setError] = useState("")
    const [accessCodeRequired, setAccessCodeRequired] = useState(
        () => getStoredAccessCodeRequired() ?? false,
    )
    const [currentLang, setCurrentLang] = useState("en")

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

            const storedCloseProtection = localStorage.getItem(
                STORAGE_CLOSE_PROTECTION_KEY,
            )
            // Default to true if not set
            setCloseProtection(storedCloseProtection !== "false")

            setError("")
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
                        description={`${dict.settings.drawioStyleDescription} ${
                            drawioUi === "min"
                                ? dict.settings.minimal
                                : dict.settings.sketch
                        }`}
                    >
                        <Button
                            id="drawio-ui"
                            variant="outline"
                            onClick={onToggleDrawioUi}
                            className="h-9 w-[120px] rounded-xl border-border-subtle hover:bg-interactive-hover font-normal"
                        >
                            {dict.settings.switchTo}{" "}
                            {drawioUi === "min"
                                ? dict.settings.sketch
                                : dict.settings.minimal}
                        </Button>
                    </SettingItem>

                    {/* Close Protection */}
                    <SettingItem
                        label={dict.settings.closeProtection}
                        description={dict.settings.closeProtectionDescription}
                    >
                        <Switch
                            id="close-protection"
                            checked={closeProtection}
                            onCheckedChange={(checked) => {
                                setCloseProtection(checked)
                                localStorage.setItem(
                                    STORAGE_CLOSE_PROTECTION_KEY,
                                    checked.toString(),
                                )
                                onCloseProtectionChange?.(checked)
                            }}
                        />
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
                                href="/about"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                                <Info className="h-3 w-3" />
                                About
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
