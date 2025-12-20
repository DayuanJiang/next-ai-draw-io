"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
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
export const STORAGE_AI_PROVIDER_KEY = "next-ai-draw-io-ai-provider"
export const STORAGE_AI_BASE_URL_KEY = "next-ai-draw-io-ai-base-url"
export const STORAGE_AI_API_KEY_KEY = "next-ai-draw-io-ai-api-key"
export const STORAGE_AI_MODEL_KEY = "next-ai-draw-io-ai-model"

function getStoredAccessCodeRequired(): boolean | null {
    if (typeof window === "undefined") return null
    const stored = localStorage.getItem(STORAGE_ACCESS_CODE_REQUIRED_KEY)
    if (stored === null) return null
    return stored === "true"
}

export function SettingsDialog({
    open,
    onOpenChange,
    onCloseProtectionChange,
    drawioUi,
    onToggleDrawioUi,
    darkMode,
    onToggleDarkMode,
}: SettingsDialogProps) {
    const dict = useDictionary()
    const [accessCode, setAccessCode] = useState("")
    const [closeProtection, setCloseProtection] = useState(true)
    const [isVerifying, setIsVerifying] = useState(false)
    const [error, setError] = useState("")
    const [accessCodeRequired, setAccessCodeRequired] = useState(
        () => getStoredAccessCodeRequired() ?? false,
    )
    const [provider, setProvider] = useState("")
    const [baseUrl, setBaseUrl] = useState("")
    const [apiKey, setApiKey] = useState("")
    const [modelId, setModelId] = useState("")

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

            // Load AI provider settings
            setProvider(localStorage.getItem(STORAGE_AI_PROVIDER_KEY) || "")
            setBaseUrl(localStorage.getItem(STORAGE_AI_BASE_URL_KEY) || "")
            setApiKey(localStorage.getItem(STORAGE_AI_API_KEY_KEY) || "")
            setModelId(localStorage.getItem(STORAGE_AI_MODEL_KEY) || "")

            setError("")
        }
    }, [open])

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
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                                    onChange={(e) =>
                                        setAccessCode(e.target.value)
                                    }
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
                    <div className="space-y-2">
                        <Label>{dict.settings.aiProvider}</Label>
                        <p className="text-[0.8rem] text-muted-foreground">
                            {dict.settings.aiProviderDescription}
                        </p>
                        <div className="space-y-3 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="ai-provider">
                                    {dict.settings.provider}
                                </Label>
                                <Select
                                    value={provider || "default"}
                                    onValueChange={(value) => {
                                        const actualValue =
                                            value === "default" ? "" : value
                                        setProvider(actualValue)
                                        localStorage.setItem(
                                            STORAGE_AI_PROVIDER_KEY,
                                            actualValue,
                                        )
                                    }}
                                >
                                    <SelectTrigger id="ai-provider">
                                        <SelectValue
                                            placeholder={
                                                dict.settings.useServerDefault
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">
                                            {dict.settings.useServerDefault}
                                        </SelectItem>
                                        <SelectItem value="openai">
                                            {dict.providers.openai}
                                        </SelectItem>
                                        <SelectItem value="anthropic">
                                            {dict.providers.anthropic}
                                        </SelectItem>
                                        <SelectItem value="google">
                                            {dict.providers.google}
                                        </SelectItem>
                                        <SelectItem value="azure">
                                            {dict.providers.azure}
                                        </SelectItem>
                                        <SelectItem value="openrouter">
                                            {dict.providers.openrouter}
                                        </SelectItem>
                                        <SelectItem value="deepseek">
                                            {dict.providers.deepseek}
                                        </SelectItem>
                                        <SelectItem value="siliconflow">
                                            {dict.providers.siliconflow}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {provider && provider !== "default" && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="ai-model">
                                            {dict.settings.modelId}
                                        </Label>
                                        <Input
                                            id="ai-model"
                                            value={modelId}
                                            onChange={(e) => {
                                                setModelId(e.target.value)
                                                localStorage.setItem(
                                                    STORAGE_AI_MODEL_KEY,
                                                    e.target.value,
                                                )
                                            }}
                                            placeholder={
                                                provider === "openai"
                                                    ? "e.g., gpt-4o"
                                                    : provider === "anthropic"
                                                      ? "e.g., claude-sonnet-4-5"
                                                      : provider === "google"
                                                        ? "e.g., gemini-2.0-flash-exp"
                                                        : provider ===
                                                            "deepseek"
                                                          ? "e.g., deepseek-chat"
                                                          : dict.settings
                                                                .modelId
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="ai-api-key">
                                            {dict.settings.apiKey}
                                        </Label>
                                        <Input
                                            id="ai-api-key"
                                            type="password"
                                            value={apiKey}
                                            onChange={(e) => {
                                                setApiKey(e.target.value)
                                                localStorage.setItem(
                                                    STORAGE_AI_API_KEY_KEY,
                                                    e.target.value,
                                                )
                                            }}
                                            placeholder={
                                                dict.settings.apiKeyPlaceholder
                                            }
                                            autoComplete="off"
                                        />
                                        <p className="text-[0.8rem] text-muted-foreground">
                                            {dict.settings.overrides}{" "}
                                            {provider === "openai"
                                                ? "OPENAI_API_KEY"
                                                : provider === "anthropic"
                                                  ? "ANTHROPIC_API_KEY"
                                                  : provider === "google"
                                                    ? "GOOGLE_GENERATIVE_AI_API_KEY"
                                                    : provider === "azure"
                                                      ? "AZURE_API_KEY"
                                                      : provider ===
                                                          "openrouter"
                                                        ? "OPENROUTER_API_KEY"
                                                        : provider ===
                                                            "deepseek"
                                                          ? "DEEPSEEK_API_KEY"
                                                          : provider ===
                                                              "siliconflow"
                                                            ? "SILICONFLOW_API_KEY"
                                                            : "server API key"}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="ai-base-url">
                                            {dict.settings.baseUrl}
                                        </Label>
                                        <Input
                                            id="ai-base-url"
                                            value={baseUrl}
                                            onChange={(e) => {
                                                setBaseUrl(e.target.value)
                                                localStorage.setItem(
                                                    STORAGE_AI_BASE_URL_KEY,
                                                    e.target.value,
                                                )
                                            }}
                                            placeholder={
                                                provider === "anthropic"
                                                    ? "https://api.anthropic.com/v1"
                                                    : provider === "siliconflow"
                                                      ? "https://api.siliconflow.com/v1"
                                                      : dict.settings
                                                            .customEndpoint
                                            }
                                        />
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => {
                                            localStorage.removeItem(
                                                STORAGE_AI_PROVIDER_KEY,
                                            )
                                            localStorage.removeItem(
                                                STORAGE_AI_BASE_URL_KEY,
                                            )
                                            localStorage.removeItem(
                                                STORAGE_AI_API_KEY_KEY,
                                            )
                                            localStorage.removeItem(
                                                STORAGE_AI_MODEL_KEY,
                                            )
                                            setProvider("")
                                            setBaseUrl("")
                                            setApiKey("")
                                            setModelId("")
                                        }}
                                    >
                                        {dict.settings.clearSettings}
                                    </Button>
                                </>
                            )}
                        </div>
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
            </DialogContent>
        </Dialog>
    )
}
