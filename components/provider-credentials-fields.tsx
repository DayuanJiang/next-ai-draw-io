"use client"

import { Key, Link2, Tag } from "lucide-react"
import type { ReactNode } from "react"
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
import { PROVIDER_INFO, type ProviderName } from "@/lib/types/model-config"

// Logical secret field. The caller owns the actual input — plaintext for the
// user dialog, write-only masked for the admin panel — supplied via
// renderSecret. That (and the optional test action) are the only genuine
// differences between the two screens; the field structure is shared here.
export type SecretField =
    | "apiKey"
    | "awsAccessKeyId"
    | "awsSecretAccessKey"
    | "vertexApiKey"

// AWS regions offered for Bedrock (shared by both screens)
const AWS_REGIONS: Array<[string, string]> = [
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
}

// Display name + per-provider credential inputs, shared by the user
// ModelConfigDialog and the admin Models panel.
export function ProviderCredentialsFields({
    provider,
    name,
    baseUrl,
    awsRegion,
    disabled,
    onChange,
    renderSecret,
    footer,
}: ProviderCredentialsFieldsProps) {
    const dict = useDictionary()
    const info = PROVIDER_INFO[provider]
    const baseUrlLabel = formatMessage(dict.modelConfig.baseUrlWithExample, {
        example: info.defaultBaseUrl || "https://api.example.com/v1",
    })

    // EdgeOne needs no credentials — the caller supplies just a test button
    if (provider === "edgeone") {
        return <div className="space-y-5">{footer}</div>
    }

    return (
        <div className="space-y-5">
            {/* Display Name */}
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

            {provider === "bedrock" ? (
                <>
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

                    {/* AWS Region */}
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
                                <SelectValue
                                    placeholder={dict.modelConfig.selectRegion}
                                />
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

                    {/* Base URL (optional) */}
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
                            onChange={(e) =>
                                onChange("baseUrl", e.target.value)
                            }
                            placeholder={dict.modelConfig.customEndpoint}
                            className="h-9 font-mono text-xs"
                        />
                    </div>
                </>
            ) : (
                <>
                    {/* API Key */}
                    <div className="space-y-2">
                        <Label
                            htmlFor="api-key"
                            className="text-xs font-medium flex items-center gap-1.5"
                        >
                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                            {dict.modelConfig.apiKey}
                            {provider === "ollama" &&
                                ` ${dict.modelConfig.optional}`}
                        </Label>
                        {renderSecret({ field: "apiKey", id: "api-key" })}
                    </div>

                    {/* Base URL */}
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
                            onChange={(e) =>
                                onChange("baseUrl", e.target.value)
                            }
                            placeholder={
                                info.defaultBaseUrl ||
                                dict.modelConfig.customEndpoint
                            }
                            className="h-9 rounded-xl font-mono text-xs"
                        />
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
                </>
            )}

            {footer}
        </div>
    )
}
