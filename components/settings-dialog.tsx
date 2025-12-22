"use client"

import { Moon, Sun } from "lucide-react"
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
import { i18n, type Locale } from "@/lib/i18n/config"

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

        fetch("/api/config")
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
            const response = await fetch("/api/verify-access-code", {
                method: "POST",
                headers: {
                    "x-access-code": accessCode.trim(),
                },
            })

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
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{dict.settings.title}</DialogTitle>
                <DialogDescription>
                    {dict.settings.description}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
                {accessCodeRequired && (
                    <div className="space-y-2">
                        <Label htmlFor="access-code">
                            {dict.settings.accessCode}
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="access-code"
                                type="password"
                                value={accessCode}
                                onChange={(e) => setAccessCode(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    dict.settings.accessCodePlaceholder
                                }
                                autoComplete="off"
                            />
                            <Button
                                onClick={handleSave}
                                disabled={isVerifying || !accessCode.trim()}
                            >
                                {isVerifying ? "..." : dict.common.save}
                            </Button>
                        </div>
                        <p className="text-[0.8rem] text-muted-foreground">
                            {dict.settings.accessCodeDescription}
                        </p>
                        {error && (
                            <p className="text-[0.8rem] text-destructive">
                                {error}
                            </p>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="language-select">
                            {dict.settings.language}
                        </Label>
                        <p className="text-[0.8rem] text-muted-foreground">
                            {dict.settings.languageDescription}
                        </p>
                    </div>
                    <Select value={currentLang} onValueChange={changeLanguage}>
                        <SelectTrigger id="language-select" className="w-32">
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
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="theme-toggle">
                            {dict.settings.theme}
                        </Label>
                        <p className="text-[0.8rem] text-muted-foreground">
                            {dict.settings.themeDescription}
                        </p>
                    </div>
                    <Button
                        id="theme-toggle"
                        variant="outline"
                        size="icon"
                        onClick={onToggleDarkMode}
                    >
                        {darkMode ? (
                            <Sun className="h-4 w-4" />
                        ) : (
                            <Moon className="h-4 w-4" />
                        )}
                    </Button>
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="drawio-ui">
                            {dict.settings.drawioStyle}
                        </Label>
                        <p className="text-[0.8rem] text-muted-foreground">
                            {dict.settings.drawioStyleDescription}{" "}
                            {drawioUi === "min"
                                ? dict.settings.minimal
                                : dict.settings.sketch}
                        </p>
                    </div>
                    <Button
                        id="drawio-ui"
                        variant="outline"
                        size="sm"
                        onClick={onToggleDrawioUi}
                    >
                        {dict.settings.switchTo}{" "}
                        {drawioUi === "min"
                            ? dict.settings.sketch
                            : dict.settings.minimal}
                    </Button>
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="close-protection">
                            {dict.settings.closeProtection}
                        </Label>
                        <p className="text-[0.8rem] text-muted-foreground">
                            {dict.settings.closeProtectionDescription}
                        </p>
                    </div>
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
                </div>
            </div>
            <div className="pt-4 border-t border-border/50">
                <p className="text-[0.75rem] text-muted-foreground text-center">
                    Version {process.env.APP_VERSION}
                </p>
            </div>
        </DialogContent>
    )
}

export function SettingsDialog(props: SettingsDialogProps) {
    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <Suspense
                fallback={
                    <DialogContent className="sm:max-w-md">
                        <div className="h-64 flex items-center justify-center">
                            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                        </div>
                    </DialogContent>
                }
            >
                <SettingsContent {...props} />
            </Suspense>
        </Dialog>
    )
}
