"use client"

import { ChevronRight, Key, Link2, Tag } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"
import { OPTIONS_OPEN } from "@/lib/provider-setup"
import {
    chatRequestUrl,
    normalizeBaseUrl,
    PROVIDER_INFO,
    type ProviderName,
} from "@/lib/types/model-config"
import { cn } from "@/lib/utils"

// Logical secret field. The caller owns the actual input — plaintext for the
// user dialog, write-only masked for the admin panel — supplied via
// renderSecret. That (and the optional test action) are the only genuine
// differences between the two screens; the field structure is shared here.
export type SecretField =
    | "apiKey"
    | "awsAccessKeyId"
    | "awsSecretAccessKey"
    | "vertexApiKey"

/** Bedrock signs in with an API key or with an access key pair */
export type BedrockAuth = "apiKey" | "accessKey"

// AWS regions offered for Bedrock (shared by both screens)
export const AWS_REGIONS: Array<[string, string]> = [
    ["us-east-1", "N. Virginia"],
    ["us-east-2", "Ohio"],
    ["us-west-2", "Oregon"],
    ["eu-west-1", "Ireland"],
    ["eu-west-2", "London"],
    ["eu-west-3", "Paris"],
    ["eu-central-1", "Frankfurt"],
    ["ap-south-1", "Mumbai"],
    ["ap-northeast-1", "Tokyo"],
    ["ap-northeast-2", "Seoul"],
    ["ap-southeast-1", "Singapore"],
    ["ap-southeast-2", "Sydney"],
    ["sa-east-1", "São Paulo"],
]

interface ProviderCredentialsFieldsProps {
    provider: ProviderName
    // Plain (non-secret) field values — secrets are owned by renderSecret
    name?: string
    baseUrl?: string
    awsRegion?: string
    // Bedrock: also offer an API key (the user dialog; the admin panel
    // stores access keys only)
    bedrockApiKey?: boolean
    disabled?: boolean
    // Update a plain text field
    onChange: (field: "name" | "baseUrl" | "awsRegion", value: string) => void
    // Render the control for a secret field. The caller may include trailing
    // UI (e.g. the user dialog's inline Test button + validation error); the
    // shared component only supplies the label above it.
    renderSecret: (opts: { field: SecretField; id: string }) => ReactNode
    // Extra content after the fields — used for the Bedrock test row and the
    // EdgeOne test button, which aren't beside a credential input.
    footer?: ReactNode
    // The user's settings page: the secrets come first, the display name and
    // base URL fold under "More options", and Bedrock shows only the way of
    // signing in that is chosen. Switching it empties the other way's
    // secrets (clearSecrets), so a request carries one kind of credential.
    settingsLayout?: boolean
    clearSecrets?: (fields: SecretField[]) => void
    // Bedrock credentials filled in, to choose the way of signing in shown
    bedrockFilled?: { apiKey: boolean; accessKey: boolean }
    // Bedrock's optional session token input, for temporary access keys
    // (the admin panel has none)
    sessionTokenInput?: ReactNode
}

// Display name + per-provider credential inputs, shared by the user
// ModelConfigDialog and the admin Models panel.
export function ProviderCredentialsFields({
    provider,
    name,
    baseUrl,
    awsRegion,
    bedrockApiKey,
    disabled,
    onChange,
    renderSecret,
    footer,
    settingsLayout,
    clearSecrets,
    bedrockFilled,
    sessionTokenInput,
}: ProviderCredentialsFieldsProps) {
    const dict = useDictionary()
    const info = PROVIDER_INFO[provider]
    const baseUrlLabel = formatMessage(dict.modelConfig.baseUrlWithExample, {
        example: info.defaultBaseUrl || "https://api.example.com/v1",
    })
    const requestUrl = baseUrl ? chatRequestUrl(provider, baseUrl) : null
    // Open when it holds something the user set, or for a provider whose
    // base URL usually needs changing or comes with a hint
    const [optionsOpen, setOptionsOpen] = useState(
        () =>
            !!name ||
            (!!baseUrl && baseUrl !== info.defaultBaseUrl) ||
            OPTIONS_OPEN.includes(provider),
    )
    // Bedrock: the way that is filled in (an API key is used first when both
    // are, as the server does), else the one shown last, so emptying the
    // fields to type new keys keeps them on screen
    const filledAuth: BedrockAuth | null = bedrockFilled?.apiKey
        ? "apiKey"
        : bedrockFilled?.accessKey
          ? "accessKey"
          : null
    const [chosenAuth, setChosenAuth] = useState<BedrockAuth>(
        filledAuth ?? "apiKey",
    )
    if (filledAuth && filledAuth !== chosenAuth) setChosenAuth(filledAuth)
    const bedrockAuth: BedrockAuth = filledAuth ?? chosenAuth

    const nameField = (
        <div className="space-y-2">
            <Label
                htmlFor="provider-name"
                className="text-xs font-medium flex items-center gap-1.5"
            >
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                {dict.modelConfig.displayName}
            </Label>
            <Input
                id="provider-name"
                value={name ?? ""}
                disabled={disabled}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder={info.label}
                className="h-9"
            />
        </div>
    )
    const regionField = (
        <div className="space-y-2">
            <Label
                htmlFor="aws-region"
                className="text-xs font-medium flex items-center gap-1.5"
            >
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                {dict.modelConfig.awsRegion}
            </Label>
            <Select
                value={awsRegion || ""}
                disabled={disabled}
                onValueChange={(v) => onChange("awsRegion", v)}
            >
                <SelectTrigger
                    id="aws-region"
                    className="h-9 font-mono text-xs hover:bg-accent"
                >
                    <SelectValue placeholder={dict.modelConfig.selectRegion} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                    {AWS_REGIONS.map(([region, label]) => (
                        <SelectItem key={region} value={region}>
                            {region} ({label})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
    const vertexBaseUrlField = (
        <div className="space-y-2">
            <Label
                htmlFor="vertex-base-url"
                className="text-xs font-medium flex items-center gap-1.5"
            >
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                {baseUrlLabel}
            </Label>
            <Input
                id="vertex-base-url"
                value={baseUrl ?? ""}
                disabled={disabled}
                onChange={(e) => onChange("baseUrl", e.target.value)}
                placeholder={dict.modelConfig.customEndpoint}
                className="h-9 font-mono text-xs"
            />
        </div>
    )
    // API key, with a link to where the provider issues keys
    const apiKeyField = (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label
                    htmlFor="api-key"
                    className="text-xs font-medium flex items-center gap-1.5"
                >
                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                    {dict.modelConfig.apiKey}
                    {provider === "ollama" && ` ${dict.modelConfig.optional}`}
                </Label>
                {info.apiKeyUrl && (
                    <a
                        href={info.apiKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                    >
                        {dict.modelConfig.getApiKey}
                    </a>
                )}
            </div>
            {renderSecret({ field: "apiKey", id: "api-key" })}
        </div>
    )
    const baseUrlField = (
        <div className="space-y-2">
            <Label
                htmlFor="base-url"
                className="text-xs font-medium flex items-center gap-1.5"
            >
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                {baseUrlLabel}
            </Label>
            <Input
                id="base-url"
                value={baseUrl ?? ""}
                disabled={disabled}
                onChange={(e) => onChange("baseUrl", e.target.value)}
                // Drop a pasted endpoint path such as /chat/completions
                onBlur={(e) => {
                    const normalized = normalizeBaseUrl(e.target.value)
                    if (normalized !== e.target.value) {
                        onChange("baseUrl", normalized)
                    }
                }}
                placeholder={
                    info.defaultBaseUrl || dict.modelConfig.customEndpoint
                }
                className="h-9 rounded-xl font-mono text-xs"
            />
            {requestUrl && (
                <p className="text-xs text-muted-foreground font-mono break-all">
                    {formatMessage(dict.modelConfig.requestUrl, {
                        url: requestUrl,
                    })}
                </p>
            )}
            {provider === "minimax" && (
                <p className="text-xs text-muted-foreground">
                    {dict.modelConfig.minimaxBaseUrlHint}
                </p>
            )}
            {provider === "mimo" && (
                <p className="text-xs text-muted-foreground">
                    {dict.modelConfig.mimoBaseUrlHint}
                </p>
            )}
        </div>
    )

    // EdgeOne needs no credentials — the caller supplies just a test button
    if (provider === "edgeone") {
        return <div className="space-y-5">{footer}</div>
    }

    if (settingsLayout) {
        return (
            <div className="space-y-4">
                {provider === "bedrock" ? (
                    <>
                        {/* Buttons, not radios: arrow keys would empty
                            secrets without a deliberate press */}
                        <fieldset
                            aria-label={dict.modelConfig.awsCredentials}
                            className="inline-flex rounded-lg bg-muted p-0.5"
                        >
                            {(["apiKey", "accessKey"] as const).map((auth) => (
                                <button
                                    key={auth}
                                    type="button"
                                    aria-pressed={bedrockAuth === auth}
                                    disabled={disabled}
                                    onClick={() => {
                                        if (bedrockAuth === auth) return
                                        setChosenAuth(auth)
                                        clearSecrets?.(
                                            auth === "apiKey"
                                                ? [
                                                      "awsAccessKeyId",
                                                      "awsSecretAccessKey",
                                                  ]
                                                : ["apiKey"],
                                        )
                                    }}
                                    className={cn(
                                        "inline-flex h-7 items-center rounded-md px-2.5 text-xs text-muted-foreground transition-colors",
                                        bedrockAuth === auth &&
                                            "bg-card font-medium text-foreground shadow-float",
                                    )}
                                >
                                    {auth === "apiKey"
                                        ? dict.modelConfig.bedrockAuthApiKey
                                        : dict.modelConfig.bedrockAuthAccessKey}
                                </button>
                            ))}
                        </fieldset>
                        {/* Both kinds kept (saved before the choice): the
                            access keys sit unused behind the API key */}
                        {bedrockFilled?.apiKey && bedrockFilled.accessKey && (
                            <p className="text-xs text-muted-foreground">
                                {dict.modelConfig.bedrockBothSaved}{" "}
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => {
                                        clearSecrets?.([
                                            "awsAccessKeyId",
                                            "awsSecretAccessKey",
                                        ])
                                        // This note goes away with the keys
                                        document
                                            .getElementById("bedrock-api-key")
                                            ?.focus()
                                    }}
                                    className="font-medium text-foreground underline underline-offset-2"
                                >
                                    {dict.modelConfig.removeAccessKeys}
                                </button>
                            </p>
                        )}
                        {bedrockAuth === "apiKey" ? (
                            <div className="space-y-2">
                                <Label
                                    htmlFor="bedrock-api-key"
                                    className="text-xs font-medium flex items-center gap-1.5"
                                >
                                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                    {dict.modelConfig.bedrockApiKey}
                                </Label>
                                {renderSecret({
                                    field: "apiKey",
                                    id: "bedrock-api-key",
                                })}
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="aws-access-key-id"
                                        className="text-xs font-medium flex items-center gap-1.5"
                                    >
                                        <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                        {dict.modelConfig.awsAccessKeyId}
                                    </Label>
                                    {renderSecret({
                                        field: "awsAccessKeyId",
                                        id: "aws-access-key-id",
                                    })}
                                </div>
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="aws-secret-access-key"
                                        className="text-xs font-medium flex items-center gap-1.5"
                                    >
                                        <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                        {dict.modelConfig.awsSecretAccessKey}
                                    </Label>
                                    {renderSecret({
                                        field: "awsSecretAccessKey",
                                        id: "aws-secret-access-key",
                                    })}
                                </div>
                                {sessionTokenInput && (
                                    <div className="space-y-2">
                                        <Label
                                            htmlFor="aws-session-token"
                                            className="text-xs font-medium flex items-center gap-1.5"
                                        >
                                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                            {dict.modelConfig.awsSessionToken}
                                        </Label>
                                        {sessionTokenInput}
                                        <p className="text-xs text-muted-foreground">
                                            {
                                                dict.modelConfig
                                                    .awsSessionTokenHint
                                            }
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                        {regionField}
                    </>
                ) : provider === "vertexai" ? (
                    <div className="space-y-2">
                        <Label
                            htmlFor="vertex-api-key"
                            className="text-xs font-medium flex items-center gap-1.5"
                        >
                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                            {dict.modelConfig.apiKey}
                        </Label>
                        {renderSecret({
                            field: "vertexApiKey",
                            id: "vertex-api-key",
                        })}
                    </div>
                ) : (
                    apiKeyField
                )}
                <div className="space-y-4">
                    <button
                        type="button"
                        onClick={() => setOptionsOpen(!optionsOpen)}
                        aria-expanded={optionsOpen}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <ChevronRight
                            className={cn(
                                "size-3.5 transition-transform",
                                optionsOpen && "rotate-90",
                            )}
                        />
                        {provider === "bedrock"
                            ? dict.modelConfig.moreOptionsName
                            : dict.modelConfig.moreOptions}
                    </button>
                    {optionsOpen && (
                        <>
                            {provider !== "bedrock" &&
                                (provider === "vertexai"
                                    ? vertexBaseUrlField
                                    : baseUrlField)}
                            {nameField}
                        </>
                    )}
                </div>
                {footer}
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {nameField}

            {provider === "bedrock" ? (
                <>
                    {/* Bedrock API key: used instead of the access keys */}
                    {bedrockApiKey && (
                        <div className="space-y-2">
                            <Label
                                htmlFor="bedrock-api-key"
                                className="text-xs font-medium flex items-center gap-1.5"
                            >
                                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                {dict.modelConfig.bedrockApiKey}
                            </Label>
                            {renderSecret({
                                field: "apiKey",
                                id: "bedrock-api-key",
                            })}
                            <p className="text-xs text-muted-foreground">
                                {dict.modelConfig.bedrockApiKeyHint}
                            </p>
                        </div>
                    )}

                    {/* AWS Access Key ID */}
                    <div className="space-y-2">
                        <Label
                            htmlFor="aws-access-key-id"
                            className="text-xs font-medium flex items-center gap-1.5"
                        >
                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                            {dict.modelConfig.awsAccessKeyId}
                        </Label>
                        {renderSecret({
                            field: "awsAccessKeyId",
                            id: "aws-access-key-id",
                        })}
                    </div>

                    {/* AWS Secret Access Key */}
                    <div className="space-y-2">
                        <Label
                            htmlFor="aws-secret-access-key"
                            className="text-xs font-medium flex items-center gap-1.5"
                        >
                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                            {dict.modelConfig.awsSecretAccessKey}
                        </Label>
                        {renderSecret({
                            field: "awsSecretAccessKey",
                            id: "aws-secret-access-key",
                        })}
                    </div>

                    {regionField}
                </>
            ) : provider === "vertexai" ? (
                <>
                    {/* Vertex AI API Key (Express Mode) */}
                    <div className="space-y-2">
                        <Label
                            htmlFor="vertex-api-key"
                            className="text-xs font-medium flex items-center gap-1.5"
                        >
                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                            {dict.modelConfig.apiKey}
                        </Label>
                        {renderSecret({
                            field: "vertexApiKey",
                            id: "vertex-api-key",
                        })}
                    </div>

                    {vertexBaseUrlField}
                </>
            ) : (
                <>
                    {apiKeyField}
                    {baseUrlField}
                </>
            )}

            {footer}
        </div>
    )
}
