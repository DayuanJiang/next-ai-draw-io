"use client"

/**
 * Hook for VLM-based diagram validation using AI SDK's useObject.
 */

import { experimental_useObject as useObject } from "@ai-sdk/react"
import { useCallback, useRef } from "react"
import { getApiEndpoint } from "@/lib/base-path"
import {
    type ValidationResult,
    ValidationResultSchema,
} from "@/lib/validation-schema"

export type { ValidationResult }

// Default valid result for fallback cases
const DEFAULT_VALID_RESULT: ValidationResult = {
    valid: true,
    issues: [],
    suggestions: [],
}

interface UseValidateDiagramOptions {
    onSuccess?: (result: ValidationResult) => void
    onError?: (error: Error) => void
}

// Track pending validation promises for imperative API
type PendingValidation = {
    resolve: (result: ValidationResult) => void
    reject: (error: Error) => void
}

export function useValidateDiagram(options: UseValidateDiagramOptions = {}) {
    const { onSuccess, onError } = options
    const pendingValidationRef = useRef<PendingValidation | null>(null)

    const { object, submit, isLoading, error, stop } = useObject({
        api: getApiEndpoint("/api/validate-diagram"),
        schema: ValidationResultSchema,
        onFinish: ({
            object,
            error: finishError,
        }: {
            object: ValidationResult | undefined
            error: Error | undefined
        }) => {
            if (finishError) {
                console.error(
                    "[useValidateDiagram] Validation error:",
                    finishError,
                )
                onError?.(finishError)
                pendingValidationRef.current?.reject(finishError)
                pendingValidationRef.current = null
                return
            }

            if (object) {
                const result = object as ValidationResult
                onSuccess?.(result)
                pendingValidationRef.current?.resolve(result)
                pendingValidationRef.current = null
            }
        },
        onError: (err: Error) => {
            console.error("[useValidateDiagram] Stream error:", err)
            onError?.(err)
            pendingValidationRef.current?.reject(err)
            pendingValidationRef.current = null
        },
    })

    /**
     * Validate a diagram image.
     * Returns a promise that resolves with the validation result.
     */
    const validate = useCallback(
        async (
            imageData: string,
            sessionId?: string,
        ): Promise<ValidationResult> => {
            // Reject any pending validation to prevent promise leaks
            if (pendingValidationRef.current) {
                pendingValidationRef.current.reject(
                    new Error("Validation superseded by new request"),
                )
                pendingValidationRef.current = null
            }

            return new Promise((resolve, reject) => {
                // Store the promise handlers
                pendingValidationRef.current = { resolve, reject }

                // Submit the validation request
                submit({ imageData, sessionId })
            })
        },
        [submit],
    )

    /**
     * Validate with fallback - returns default valid result on error.
     * Use this to avoid blocking the user on validation failures.
     */
    const validateWithFallback = useCallback(
        async (
            imageData: string,
            sessionId?: string,
        ): Promise<ValidationResult> => {
            try {
                return await validate(imageData, sessionId)
            } catch (error) {
                console.warn(
                    "[useValidateDiagram] Validation failed, using fallback:",
                    error,
                )
                return DEFAULT_VALID_RESULT
            }
        },
        [validate],
    )

    return {
        // Validation functions
        validate,
        validateWithFallback,
        stop,

        // State
        isValidating: isLoading,
        partialResult: object as ValidationResult | undefined,
        error,
    }
}
