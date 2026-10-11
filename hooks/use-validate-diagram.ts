"use client"

/**
 * Hook for VLM-based diagram validation: one request, one JSON result.
 */

import { useCallback, useRef } from "react"
import { getSelectedAIConfig } from "@/hooks/use-model-config"
import { getApiEndpoint } from "@/lib/base-path"
import {
    type ValidationResult,
    ValidationResultSchema,
} from "@/lib/validation-schema"

// Default valid result for fallback cases
const DEFAULT_VALID_RESULT: ValidationResult = {
    valid: true,
    issues: [],
    suggestions: [],
}

export function useValidateDiagram() {
    // The running check's controller; a new check or cancel() aborts it
    const controllerRef = useRef<AbortController | null>(null)

    /**
     * Validate a diagram image, with fallback: a failed check gives the
     * default valid result so it never blocks the user. A cancelled check
     * is passed on as its AbortError.
     */
    const validateWithFallback = useCallback(
        async (
            imageData: string,
            sessionId?: string,
        ): Promise<ValidationResult> => {
            controllerRef.current?.abort()
            const controller = new AbortController()
            controllerRef.current = controller
            try {
                const res = await fetch(
                    getApiEndpoint("/api/validate-diagram"),
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            // Read per request so a changed access code is
                            // picked up
                            "x-access-code": getSelectedAIConfig().accessCode,
                        },
                        body: JSON.stringify({ imageData, sessionId }),
                        signal: controller.signal,
                    },
                )
                if (!res.ok) {
                    throw new Error(`Validation request failed: ${res.status}`)
                }
                return ValidationResultSchema.parse(await res.json())
            } catch (error) {
                if ((error as Error)?.name === "AbortError") throw error
                console.warn(
                    "[useValidateDiagram] Validation failed, using fallback:",
                    error,
                )
                return DEFAULT_VALID_RESULT
            } finally {
                if (controllerRef.current === controller) {
                    controllerRef.current = null
                }
            }
        },
        [],
    )

    /**
     * End a running check (the user pressed Stop): its promise rejects with
     * an AbortError, so the tool handler can finish at once.
     */
    const cancel = useCallback(() => {
        controllerRef.current?.abort()
        controllerRef.current = null
    }, [])

    return { validateWithFallback, cancel }
}
