import { type ProviderName, SUGGESTED_MODELS } from "@/lib/types/model-config"

/**
 * Suggested models in this app that expose a native, binary thinking switch.
 * Keep this explicit: custom IDs and aggregation endpoints must not gain a
 * toggle merely because their name resembles a supported model.
 */
export function supportsThinkingToggle(
    provider: ProviderName,
    modelId: string,
): boolean {
    const id = modelId.toLowerCase()

    // The setting is intentionally scoped to the curated list in
    // `model-config.ts`. A manually entered model never inherits it just by
    // sharing an ID pattern with a supported suggestion.
    if (
        !SUGGESTED_MODELS[provider]?.some((model) => model.toLowerCase() === id)
    ) {
        return false
    }

    switch (provider) {
        case "openai":
            return [
                "gpt-5.5",
                "gpt-5.4",
                "gpt-5.4-mini",
                "gpt-5.4-nano",
            ].includes(id)
        case "azure":
            return ["gpt-5.5", "gpt-5.4", "gpt-5.1"].includes(id)
        case "anthropic":
            return [
                "claude-sonnet-4-5-20250929",
                "claude-opus-4-5-20251101",
                "claude-3-7-sonnet-20250219",
            ].includes(id)
        case "google":
        case "vertexai":
            return ["gemini-2.5-flash", "gemini-2.5-flash-lite"].includes(id)
        case "bedrock":
            return [
                "amazon.nova-2-lite-v1:0",
                "anthropic.claude-opus-4-5-20251101-v1:0",
                "anthropic.claude-sonnet-4-5-20250929-v1:0",
            ].includes(id)
        case "deepseek":
            return ["deepseek-v4-pro", "deepseek-v4-flash"].includes(id)
        default:
            return false
    }
}
