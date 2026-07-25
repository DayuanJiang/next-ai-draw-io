import { Eye, EyeOff, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import type { SettingDef } from "@/lib/admin/settings-registry"
import { formatMessage } from "@/lib/i18n/utils"
import { cn } from "@/lib/utils"
import {
    isSecretValue,
    type SecretValue,
    type SettingState,
    savedTextOf,
} from "./admin-shared"

// ── Small shared UI bits ─────────────────────────────────────────────

export function SourceChip({ source }: { source: "file" | "env" | "default" }) {
    const dict = useDictionary()
    if (source === "default") return null
    return (
        <span
            className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                source === "file"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
            )}
            title={
                source === "file"
                    ? dict.admin.sourceSavedTitle
                    : dict.admin.sourceEnvTitle
            }
        >
            {source === "file" ? dict.admin.sourceSaved : dict.admin.sourceEnv}
        </span>
    )
}

export function RestartBadge() {
    const dict = useDictionary()
    return (
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
            {dict.admin.restartRequired}
        </span>
    )
}

// Secret input: shows masked hint as placeholder, typing replaces.
// With keepOnEmpty, clearing the field reverts to the stored value
// ("keep") instead of deleting it — explicit deletion is via the X button.
export function SecretInput({
    id,
    value,
    disabled,
    keepOnEmpty,
    onChange,
}: {
    id: string
    value: string | SecretValue | undefined
    disabled?: boolean
    keepOnEmpty?: boolean
    onChange: (value: string | SecretValue) => void
}) {
    const dict = useDictionary()
    const [show, setShow] = useState(false)
    // The stored marker as it was at mount, to revert to on empty
    const [original] = useState(value)
    const hadStored = isSecretValue(original)
    const text = typeof value === "string" ? value : ""
    const placeholder = isSecretValue(value)
        ? formatMessage(dict.admin.savedReplace, { hint: value.hint })
        : dict.admin.notSet
    const handleText = (t: string) => {
        if (t === "" && keepOnEmpty && hadStored && original) {
            onChange(original)
        } else {
            onChange(t)
        }
    }
    return (
        <div className="flex items-center gap-1">
            <Input
                id={id}
                type={show ? "text" : "password"}
                value={text}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                placeholder={placeholder}
                className="h-9 font-mono text-xs"
                onChange={(e) => handleText(e.target.value)}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={show ? dict.admin.hideValue : dict.admin.showValue}
                onClick={() => setShow((s) => !s)}
            >
                {show ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                )}
            </Button>
            {keepOnEmpty && (hadStored || text) && !disabled && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={dict.admin.removeValue}
                    title={dict.admin.removeValueTitle}
                    onClick={() => onChange("")}
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </Button>
            )}
        </div>
    )
}

// ── General settings field (registry-driven) ─────────────────────────

export function SettingField({
    def,
    state,
    pendingValue,
    error,
    disabled,
    onChange,
}: {
    def: SettingDef
    state: SettingState | undefined
    pendingValue: string | null | undefined
    error?: string
    disabled: boolean
    onChange: (value: string | null) => void
}) {
    const dict = useDictionary()
    const isDirty = pendingValue !== undefined
    const source = state?.source ?? "default"
    const currentValue = isDirty ? (pendingValue ?? "") : savedTextOf(state)
    const secretState = state && isSecretValue(state.value) ? state.value : null

    // Localized label/description keyed by env var name, falling back to the
    // registry's English (the registry stays canonical for the server).
    const t = (
        dict.admin.settings as Record<
            string,
            { label?: string; description?: string } | undefined
        >
    )[def.key]
    const label = t?.label ?? def.label
    const description = t?.description ?? def.description

    const inputId = `setting-${def.key}`
    const errorId = `${inputId}-error`

    let control: React.ReactNode
    switch (def.type) {
        case "boolean": {
            // When unset, reflect the built-in runtime default so the toggle
            // matches actual behavior (e.g. ALLOW_PRIVATE_URLS defaults on).
            const effective =
                currentValue !== "" ? currentValue : (def.default ?? "false")
            // A saved boolean can be cleared back to its env/default value.
            const canClear =
                (isDirty && pendingValue !== null) || source === "file"
            control = (
                <div className="flex items-center gap-3">
                    <Switch
                        id={inputId}
                        checked={effective === "true"}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                            onChange(checked ? "true" : "false")
                        }
                    />
                    {canClear && !disabled && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => onChange(null)}
                        >
                            {dict.admin.resetToDefault}
                        </Button>
                    )}
                </div>
            )
            break
        }
        case "enum":
            control = (
                <Select
                    value={currentValue || undefined}
                    disabled={disabled}
                    onValueChange={onChange}
                >
                    <SelectTrigger id={inputId} className="w-full max-w-xs">
                        <SelectValue placeholder={dict.admin.notSet} />
                    </SelectTrigger>
                    <SelectContent>
                        {def.options?.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                                {opt}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
            break
        case "secret":
            control = (
                <div className="w-full max-w-md">
                    <SecretInput
                        id={inputId}
                        value={
                            isDirty
                                ? (pendingValue ?? "")
                                : (secretState ?? currentValue)
                        }
                        disabled={disabled}
                        onChange={(v) =>
                            onChange(typeof v === "string" ? v : "")
                        }
                    />
                </div>
            )
            break
        case "number":
            control = (
                <Input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    min={def.min}
                    max={def.max}
                    value={currentValue}
                    disabled={disabled}
                    placeholder={def.placeholder ?? dict.admin.notSet}
                    className="w-full max-w-xs tabular-nums"
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(e) => onChange(e.target.value)}
                />
            )
            break
        default:
            control = (
                <Input
                    id={inputId}
                    type="text"
                    value={currentValue}
                    disabled={disabled}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={def.placeholder ?? dict.admin.notSet}
                    className="w-full max-w-md"
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(e) => onChange(e.target.value)}
                />
            )
    }

    return (
        <div className="border-b border-border/60 py-4 last:border-b-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Label htmlFor={inputId} className="text-sm font-medium">
                    {label}
                </Label>
                <SourceChip source={source} />
                {def.restartRequired && <RestartBadge />}
                {isDirty && (
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                        {dict.admin.modified}
                    </span>
                )}
            </div>
            {description && (
                <p className="mb-2 max-w-prose text-xs text-muted-foreground">
                    {description}
                </p>
            )}
            {control}
            <p
                id={errorId}
                className={cn(
                    "text-xs text-destructive",
                    error ? "mt-1.5" : "sr-only",
                )}
                aria-live="polite"
            >
                {error ?? ""}
            </p>
        </div>
    )
}
