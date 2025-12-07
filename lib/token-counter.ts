/**
 * Token counting utilities using Anthropic's tokenizer
 *
 * This file is separate from system-prompts.ts because the @anthropic-ai/tokenizer
 * package uses WebAssembly which doesn't work well with Next.js server-side rendering.
 * Import this file only in scripts or client-side code, not in API routes.
 */

import { countTokens } from "@anthropic-ai/tokenizer"
import { DEFAULT_SYSTEM_PROMPT, EXTENDED_SYSTEM_PROMPT } from "./system-prompts"

/**
 * Count the number of tokens in a text string using Anthropic's tokenizer
 * @param text - The text to count tokens for
 * @returns The number of tokens
 */
export function countTextTokens(text: string): number {
    return countTokens(text)
}

/**
 * Get token counts for the system prompts
 * Useful for debugging and optimizing prompt sizes
 * @returns Object with token counts for default and extended prompts
 */
export function getSystemPromptTokenCounts(): {
    default: number
    extended: number
    additions: number
} {
    const defaultTokens = countTokens(DEFAULT_SYSTEM_PROMPT)
    const extendedTokens = countTokens(EXTENDED_SYSTEM_PROMPT)
    return {
        default: defaultTokens,
        extended: extendedTokens,
        additions: extendedTokens - defaultTokens,
    }
}
