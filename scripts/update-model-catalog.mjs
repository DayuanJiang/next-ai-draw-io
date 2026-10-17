// Refresh lib/model-catalog.json from models.dev (MIT licensed model data):
// whether each model can call tools and read images, its limits and its
// price. The app uses it for hints in model settings and the estimated cost
// under each answer. Run before a release:
//   node scripts/update-model-catalog.mjs
import { writeFileSync } from "node:fs"

// Our provider id -> models.dev provider id
const PROVIDERS = {
    openai: "openai",
    anthropic: "anthropic",
    google: "google",
    vertexai: "google-vertex",
    azure: "azure",
    bedrock: "amazon-bedrock",
    ollama: "ollama-cloud",
    openrouter: "openrouter",
    aihubmix: "aihubmix",
    deepseek: "deepseek",
    siliconflow: "siliconflow-cn",
    gateway: "vercel",
    doubao: "volcengine",
    modelscope: "modelscope",
    glm: "zhipuai",
    qwen: "alibaba-cn",
    qiniu: "qiniu-ai",
    kimi: "moonshotai-cn",
    minimax: "minimax-cn",
    novita: "novita-ai",
    mimo: "xiaomi",
}

const response = await fetch("https://models.dev/api.json")
if (!response.ok) throw new Error(`models.dev answered ${response.status}`)
const data = await response.json()

const catalog = {}
for (const [provider, source] of Object.entries(PROVIDERS)) {
    const models = data[source]?.models
    if (!models) {
        console.warn(`models.dev has no provider ${source}`)
        continue
    }
    catalog[provider] = {}
    for (const [id, m] of Object.entries(models).sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        // Chat models only, and none that are on their way out
        if (!m.modalities?.output?.includes("text")) continue
        if (m.status === "deprecated") continue
        const cost = priceOf(m.cost)
        // A tier's price replaces the base one above that many input tokens
        const tiers = (m.cost?.tiers ?? [])
            .filter((t) => t.tier?.type === "context" && priceOf(t))
            .map((t) => ({ above: t.tier.size, ...priceOf(t) }))
            .sort((a, b) => a.above - b.above)
        catalog[provider][id] = {
            tools: m.tool_call === true,
            images: m.modalities?.input?.includes("image") === true,
            reasoning: m.reasoning === true,
            ...(m.limit?.context && { context: m.limit.context }),
            ...(m.limit?.output && { output: m.limit.output }),
            ...(cost && {
                cost: { ...cost, ...(tiers.length > 0 && { tiers }) },
            }),
        }
    }
}

/** A models.dev price in our names (USD per million tokens), if complete */
function priceOf(c) {
    if (c?.input == null || c?.output == null) return undefined
    return {
        input: c.input,
        output: c.output,
        ...(c.cache_read != null && { cacheRead: c.cache_read }),
        ...(c.cache_write != null && { cacheWrite: c.cache_write }),
        ...(c.reasoning != null && { reasoning: c.reasoning }),
    }
}

// One model per line, so a refresh shows up as a readable diff
const lines = ["{"]
const providers = Object.entries(catalog)
providers.forEach(([provider, models], p) => {
    lines.push(`  ${JSON.stringify(provider)}: {`)
    const entries = Object.entries(models)
    entries.forEach(([id, info], i) => {
        const comma = i < entries.length - 1 ? "," : ""
        lines.push(`    ${JSON.stringify(id)}: ${JSON.stringify(info)}${comma}`)
    })
    lines.push(`  }${p < providers.length - 1 ? "," : ""}`)
})
lines.push("}")
writeFileSync(
    new URL("../lib/model-catalog.json", import.meta.url),
    `${lines.join("\n")}\n`,
)
const count = providers.reduce((n, [, m]) => n + Object.keys(m).length, 0)
console.log(`Wrote ${count} models for ${providers.length} providers`)
