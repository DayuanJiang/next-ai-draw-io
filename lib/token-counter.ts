/**
 * Token counting utilities using js-tiktoken
 *
 * Uses cl100k_base encoding (GPT-4) which is close to Claude's tokenization.
 * This is a pure JavaScript implementation, no WASM required.
 */

import { encodingForModel } from "js-tiktoken"
import { DEFAULT_SYSTEM_PROMPT, EXTENDED_SYSTEM_PROMPT } from "./system-prompts"

const encoder = encodingForModel("gpt-4o")

/**
 * Count the number of tokens in a text string
 * @param text - The text to count tokens for
 * @returns The number of tokens
 */
export function countTextTokens(text: string): number {
    return encoder.encode(text).length
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
    const defaultTokens = countTextTokens(DEFAULT_SYSTEM_PROMPT)
    const extendedTokens = countTextTokens(EXTENDED_SYSTEM_PROMPT)
    return {
        default: defaultTokens,
        extended: extendedTokens,
        additions: extendedTokens - defaultTokens,
    }
}
