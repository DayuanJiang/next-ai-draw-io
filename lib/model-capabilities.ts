export function supportsImages(provider?: string, modelId?: string): boolean {
    const p = (provider || "").toLowerCase()
    const m = (modelId || "").toLowerCase()
    if (!p && !m) return false
    if (p === "openai" && m.includes("gpt-4o")) return true
    if (p === "google" || m.includes("gemini")) return true
    if (p === "siliconflow") {
        if (m.includes("vl")) return true
        if (m.includes("glm-4v")) return true
        if (m.includes("yi-vl")) return true
        return false
    }
    if (p === "openrouter") {
        if (m.includes("gpt-4o")) return true
        if (m.includes("gemini")) return true
        if (m.includes("vl")) return true
        if (m.includes("glm-4v")) return true
        if (m.includes("yi-vl")) return true
        return false
    }
    return false
}

const LS_KEY = "next-ai-draw-io-image-capabilities"

function readCache(): Record<string, boolean> {
    if (typeof window === "undefined") return {}
    try {
        const raw = localStorage.getItem(LS_KEY)
        return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    } catch {
        return {}
    }
}

function writeCache(cache: Record<string, boolean>) {
    if (typeof window === "undefined") return
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(cache))
    } catch {
        // ignore
    }
}

function capabilityKey(provider?: string, modelId?: string): string {
    return `${(provider || "").toLowerCase()}::${(modelId || "").toLowerCase()}`
}

export function getCachedImageCapability(
    provider?: string,
    modelId?: string,
): boolean | undefined {
    const cache = readCache()
    const key = capabilityKey(provider, modelId)
    return key in cache ? cache[key] : undefined
}

export function setCachedImageCapability(
    provider?: string,
    modelId?: string,
    supported?: boolean,
) {
    if (supported === undefined) return
    const cache = readCache()
    cache[capabilityKey(provider, modelId)] = supported
    writeCache(cache)
}

export function resolveImageSupport(
    provider?: string,
    modelId?: string,
): boolean {
    const cached = getCachedImageCapability(provider, modelId)
    if (cached !== undefined) return cached
    return supportsImages(provider, modelId)
}
