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

export function useValidateDiagram() {
    // The running check's controller; a new check or cancel() aborts it
    const controllerRef = useRef<AbortController | null>(null)

    /**
     * Validate a diagram image. A check that could not run rejects with the
     * reason (the tool handler shows it on the diagram's card and goes on:
     * the diagram is drawn already); a cancelled one with its AbortError.
     */
    const validate = useCallback(
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
                    // The server says why as { error }
                    const reason = (await res.json().catch(() => null))?.error
                    throw new Error(
                        typeof reason === "string"
                            ? reason
                            : `Validation request failed: ${res.status}`,
                    )
                }
                return ValidationResultSchema.parse(await res.json())
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

    return { validate, cancel }
}
