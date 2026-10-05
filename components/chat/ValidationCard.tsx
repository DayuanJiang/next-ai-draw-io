"use client"

import {
    AlertTriangle,
    Check,
    ChevronDown,
    ChevronUp,
    Eye,
    ImageIcon,
    RefreshCw,
    X,
} from "lucide-react"
import { useState } from "react"
import Image from "@/components/image-with-basepath"
import { useDictionary } from "@/hooks/use-dictionary"
import type { ValidationResult } from "@/lib/diagram-validator"

export type ValidationStatus =
    | "idle"
    | "capturing"
    | "validating"
    | "success"
    | "success_with_warnings"
    | "failed"
    | "error"
    | "skipped"

export interface ValidationState {
    status: ValidationStatus
    attempt?: number
    maxAttempts?: number
    result?: ValidationResult
    error?: string
    imageData?: string // Base64 PNG data URL
}

interface ValidationCardProps {
    state: ValidationState
    onImproveWithSuggestions?: (feedback: string) => void
}

export function ValidationCard({
    state,
    onImproveWithSuggestions,
}: ValidationCardProps) {
    const dict = useDictionary()
    const [isExpanded, setIsExpanded] = useState(
        state.status === "validating" || state.status === "failed",
    )
    const [hasRequestedImprovement, setHasRequestedImprovement] =
        useState(false)

    // Generate improvement feedback from validation result
    const generateImprovementFeedback = (): string => {
        if (!state.result) return ""

        const lines: string[] = []
        lines.push(
            "Please improve the diagram based on the following visual analysis feedback:",
        )
        lines.push("")

        if (state.result.issues.length > 0) {
            lines.push("Issues to address:")
            for (const issue of state.result.issues) {
                lines.push(
                    `  - [${issue.severity}] ${issue.type}: ${issue.description}`,
                )
            }
            lines.push("")
        }

        if (state.result.suggestions.length > 0) {
            lines.push("Suggestions for improvement:")
            for (const suggestion of state.result.suggestions) {
                lines.push(`  - ${suggestion}`)
            }
            lines.push("")
        }

        lines.push("Regenerate the diagram with these improvements applied.")
        return lines.join("\n")
    }

    const handleImproveClick = () => {
        if (
            !onImproveWithSuggestions ||
            !state.result ||
            hasRequestedImprovement
        )
            return
        setHasRequestedImprovement(true)
        const feedback = generateImprovementFeedback()
        onImproveWithSuggestions(feedback)
    }

    // Check if we should show the improve button
    const showImproveButton =
        onImproveWithSuggestions &&
        state.result &&
        (state.status === "success" ||
            state.status === "success_with_warnings" ||
            state.status === "skipped") &&
        (state.result.issues.length > 0 || state.result.suggestions.length > 0)

    const getStatusDisplay = () => {
        switch (state.status) {
            case "capturing":
                return {
                    label: dict.validation.capturing,
                    color: "text-blue-600 bg-blue-50",
                    icon: (
                        <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    ),
                }
            case "validating":
                return {
                    label: state.attempt
                        ? dict.validation.validatingWithAttempt
                              .replace("{attempt}", String(state.attempt))
                              .replace("{max}", String(state.maxAttempts || 3))
                        : dict.validation.validating,
                    color: "text-blue-600 bg-blue-50",
                    icon: (
                        <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    ),
                }
            case "success":
                return {
                    label: dict.validation.valid,
                    color: "text-green-600 bg-green-50",
                    icon: <Check className="h-4 w-4" aria-hidden="true" />,
                }
            case "success_with_warnings":
                return {
                    label: dict.validation.validWithWarnings,
                    color: "text-amber-600 bg-amber-50",
                    icon: (
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    ),
                }
            case "failed":
                return {
                    label: dict.validation.issuesFound,
                    color: "text-yellow-600 bg-yellow-50",
                    icon: (
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    ),
                }
            case "error":
                return {
                    label: dict.validation.error,
                    color: "text-red-600 bg-red-50",
                    icon: <X className="h-4 w-4" aria-hidden="true" />,
                }
            case "skipped":
                return {
                    label: dict.validation.skipped,
                    color: "text-gray-600 bg-gray-50",
                    icon: <Check className="h-4 w-4" aria-hidden="true" />,
                }
            default:
                return null
        }
    }

    const statusDisplay = getStatusDisplay()
    if (!statusDisplay || state.status === "idle") return null

    return (
        <div className="my-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                        <Eye
                            className="w-3.5 h-3.5 text-primary"
                            aria-hidden="true"
                        />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">
                        {dict.validation.title}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${statusDisplay.color}`}
                    >
                        {statusDisplay.icon}
                        <span className="ml-1">{statusDisplay.label}</span>
                    </span>
                    {(state.result || state.error) && (
                        <button
                            type="button"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1 rounded hover:bg-muted transition-colors"
                        >
                            {isExpanded ? (
                                <ChevronUp
                                    className="w-4 h-4 text-muted-foreground"
                                    aria-hidden="true"
                                />
                            ) : (
                                <ChevronDown
                                    className="w-4 h-4 text-muted-foreground"
                                    aria-hidden="true"
                                />
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Validation details when expanded */}
            {isExpanded && (state.result || state.imageData) && (
                <div className="px-4 py-3 border-t border-border/40 bg-muted/20 space-y-3">
                    {/* Captured image */}
                    {state.imageData && (
                        <div>
                            <div className="text-xs font-medium text-foreground/70 mb-2 flex items-center gap-1">
                                <ImageIcon
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                />
                                {dict.validation.capturedScreenshot}
                            </div>
                            <div className="rounded-lg border border-border/50 overflow-hidden bg-white">
                                <Image
                                    src={state.imageData}
                                    alt="Captured diagram for validation"
                                    width={400}
                                    height={300}
                                    className="w-full h-auto max-h-48 object-contain"
                                    unoptimized
                                />
                            </div>
                        </div>
                    )}

                    {/* Issues */}
                    {state.result && state.result.issues.length > 0 && (
                        <div>
                            <div className="text-xs font-medium text-foreground/70 mb-2">
                                {dict.validation.issuesFoundLabel}
                            </div>
                            <div className="space-y-2">
                                {state.result.issues.map((issue, index) => (
                                    <div
                                        key={index}
                                        className={`text-xs px-3 py-2 rounded-lg border ${
                                            issue.severity === "critical"
                                                ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300"
                                                : "bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300"
                                        }`}
                                    >
                                        <span className="font-medium uppercase text-[10px] mr-2">
                                            [{issue.type}]
                                        </span>
                                        {issue.description}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Suggestions */}
                    {state.result && state.result.suggestions.length > 0 && (
                        <div>
                            <div className="text-xs font-medium text-foreground/70 mb-2">
                                {dict.validation.suggestions}
                            </div>
                            <ul className="text-xs text-foreground/60 space-y-1 list-disc list-inside">
                                {state.result.suggestions.map(
                                    (suggestion, index) => (
                                        <li key={index}>{suggestion}</li>
                                    ),
                                )}
                            </ul>
                        </div>
                    )}

                    {/* Valid result message */}
                    {state.result?.valid &&
                        state.result.issues.length === 0 && (
                            <div className="text-xs text-green-600 dark:text-green-400">
                                {dict.validation.passedValidation}
                            </div>
                        )}
                </div>
            )}

            {/* Improve with Suggestions button - shown when validation passed but has suggestions */}
            {showImproveButton && (
                <div className="px-4 py-3 border-t border-border/40 bg-muted/10">
                    {hasRequestedImprovement ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">
                            <Check className="h-4 w-4" aria-hidden="true" />
                            {dict.validation.improvementRequested}
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={handleImproveClick}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                            >
                                <RefreshCw
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                                {dict.validation.improveWithSuggestions}
                            </button>
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                                {dict.validation.regenerateWithFeedback}
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* Error details when expanded */}
            {isExpanded && state.error && (
                <div className="px-4 py-3 border-t border-border/40 bg-red-50/50">
                    <div className="text-xs text-red-600">{state.error}</div>
                </div>
            )}
        </div>
    )
}
