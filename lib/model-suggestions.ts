import type { ProviderName } from "@/lib/providers"

/** Filter new suggestions only; saved and custom model IDs remain requestable. */
export function currentModelSuggestions<T extends { id: string }>(
    provider: ProviderName,
    models: T[],
): T[] {
    if (provider === "custom") return models
    const isMiniMaxText = (id: string) =>
        /^(?:minimax\/)?minimax-m\d/i.test(id) &&
        (id.includes("/") || provider === "minimax" || provider === "ollama")
    const flash =
        provider === "minimax"
            ? "minimax-m3.1-flash"
            : provider === "openrouter"
              ? "minimax/minimax-m3.1-flash:free"
              : undefined
    const current = models.filter(({ id }) => {
        if (!isMiniMaxText(id)) return true
        const lower = id.toLowerCase()
        return lower === flash || /^(?:minimax\/)?minimax-m3$/.test(lower)
    })
    // Keep other providers' models in order, and prefer Flash within MiniMax.
    const first = current.findIndex(({ id }) => isMiniMaxText(id))
    const preferred = current.findIndex(({ id }) => id.toLowerCase() === flash)
    if (preferred > first && first !== -1) {
        current.splice(first, 0, ...current.splice(preferred, 1))
    }
    return current
}
