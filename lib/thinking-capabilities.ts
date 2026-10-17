import type { ProviderName } from "@/lib/types/model-config"

/**
 * How a model's thinking is turned on and off:
 * - effort: OpenAI's reasoningEffort, where "none" turns it off
 * - budget: Claude's extended thinking with a token budget
 * - adaptive: Claude's adaptive thinking, where the model decides how much
 * - gemini: Gemini 2.5 Flash's thinkingBudget, where 0 turns it off
 * - nova: Amazon Nova 2's reasoningConfig
 * - deepseek: DeepSeek V4's thinking.type
 */
export type ThinkingSwitch =
    | "effort"
    | "budget"
    | "adaptive"
    | "gemini"
    | "nova"
    | "deepseek"

/**
 * Claude 3.7 and 4 to 4.5 think with a budget, 4.6 and later, Opus 5,
 * Sonnet 5 and Haiku 5.5 adaptively. Opus 5.5, Sonnet 5.5 and Fable always
 * think, so they get no switch.
 */
function claudeSwitch(id: string): ThinkingSwitch | undefined {
    if (id.includes("claude-3-7-sonnet")) return "budget"
    // claude-sonnet-4-20250514, claude-opus-4-1, claude-haiku-4-5-20251001
    const match = id.match(/claude-(opus|sonnet|haiku)-(\d)(?:-(\d))?(?!\d)/)
    if (!match) return undefined
    const [, family, major, minor = "0"] = match
    if (major === "4") return Number(minor) <= 5 ? "budget" : "adaptive"
    if (major === "5" && (minor === "0" || family === "haiku"))
        return "adaptive"
    return undefined
}

/**
 * The model's thinking switch, or undefined when its API has no real off
 * switch (GPT-5, Gemini 2.5 Pro, Claude Opus 5.5) or the app does not know
 * the model. A custom ID only gets one if it names a model below.
 */
export function thinkingSwitchOf(
    provider: ProviderName,
    modelId: string,
): ThinkingSwitch | undefined {
    const id = modelId.toLowerCase()
    switch (provider) {
        case "openai":
        case "azure": {
            // GPT-5.1 and later 5.x, GPT-6 Sol and Luna accept "none";
            // GPT-5, the other GPT-6 models, the Pro and Codex models and
            // the chat aliases do not
            const gpt5 =
                /^gpt-5\.[1-9]/.test(id) && !/-(pro|codex|chat)/.test(id)
            const gpt6 = id === "gpt-6-sol" || id === "gpt-6-luna"
            return gpt5 || gpt6 ? "effort" : undefined
        }
        case "anthropic":
            return claudeSwitch(id)
        case "google":
        case "vertexai":
            // Not the image and speech models of the family
            return id.includes("gemini-2.5-flash") &&
                !/image|tts|audio|live/.test(id)
                ? "gemini"
                : undefined
        case "bedrock":
            if (id.includes("nova-2-lite")) return "nova"
            return claudeSwitch(id)
        case "deepseek":
            // The V4 models as the SDK names them, aliases included
            return /^deepseek-(v4|flash|pro)/.test(id) ? "deepseek" : undefined
        default:
            return undefined
    }
}

export function supportsThinkingToggle(
    provider: ProviderName,
    modelId: string,
): boolean {
    return thinkingSwitchOf(provider, modelId) !== undefined
}
