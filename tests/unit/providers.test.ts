/**
 * The rules the provider record (lib/providers.ts) must keep, and the parts
 * of the UI that follow its order. The record replaced thirteen tables keyed
 * by provider name; while they were being replaced, a fixture of their old
 * values checked the derived ones, and the behavior snapshot
 * (provider-matrix.test.ts) still holds every scenario's answer.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { envVarsOf } from "@/lib/ai-providers"
import { i18n } from "@/lib/i18n/config"
import { PROVIDER_GROUPS } from "@/lib/provider-setup"
import { PROVIDER_NAMES, PROVIDERS, publicDefaultUrl } from "@/lib/providers"

vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => ({}),
    getEnvFallback: (key: string) => process.env[key] ?? null,
}))

const sorted = (list: Iterable<string>) => [...list].sort()

describe("the provider record", () => {
    // The fields that change what the server does are spelled out here, so
    // a slip in one record fails a test instead of changing a request
    const withField = (field: "listNeedsNoKey" | "sdkKnowsEndpoint") =>
        sorted(PROVIDER_NAMES.filter((p) => PROVIDERS[p][field]))

    it("lets the server auto-detect exactly the providers that need a key", () => {
        // credential apiKey or vertexKey: the providers whose <P>_API_KEY the
        // server must have; aws, optionalKey and none need no key
        const detected = PROVIDER_NAMES.filter((p) =>
            ["apiKey", "vertexKey"].includes(PROVIDERS[p].credential),
        )
        expect(sorted(detected)).toEqual(
            sorted([
                "openai",
                "anthropic",
                "google",
                "deepseek",
                "qwen",
                "doubao",
                "glm",
                "kimi",
                "minimax",
                "mimo",
                "openrouter",
                "aihubmix",
                "siliconflow",
                "modelscope",
                "novita",
                "atlascloud",
                "qiniu",
                "gateway",
                "vertexai",
                "azure",
                "sglang",
                "custom",
            ]),
        )
        // Ollama has a key variable too, an optional one
        const withKeyVar = PROVIDER_NAMES.filter((p) => !!envVarsOf(p).apiKey)
        expect(sorted(detected)).toEqual(
            sorted(withKeyVar.filter((p) => p !== "ollama")),
        )
    })

    it("lists models without a key for the providers with a public or local list", () => {
        expect(withField("listNeedsNoKey")).toEqual(
            sorted(["ollama", "openrouter", "aihubmix"]),
        )
    })

    it("leaves the base URL to the SDKs that know their endpoint", () => {
        expect(withField("sdkKnowsEndpoint")).toEqual(
            sorted([
                "openai",
                "google",
                "azure",
                "openrouter",
                "gateway",
                "deepseek",
            ]),
        )
    })

    it("writes every note and hint in every UI language", () => {
        for (const p of PROVIDER_NAMES) {
            for (const copy of [PROVIDERS[p].note, PROVIDERS[p].baseUrlHint]) {
                if (!copy) continue
                expect(sorted(Object.keys(copy))).toEqual(sorted(i18n.locales))
                for (const text of Object.values(copy)) {
                    expect(text.trim()).not.toBe("")
                }
            }
        }
    })

    it("only calls https defaults on its own", () => {
        expect(publicDefaultUrl("sglang")).toBeUndefined()
        expect(publicDefaultUrl("openai")).toBe("https://api.openai.com/v1")
        expect(publicDefaultUrl("bedrock")).toBeUndefined()
    })

    it("gives the no-key providers no env prefix and limits fixed credentials to non-key kinds", () => {
        for (const p of PROVIDER_NAMES) {
            const { credential, envPrefix, fixedCredentials } = PROVIDERS[p]
            if (credential === "none") expect([p, envPrefix]).toEqual([p, null])
            if (credential === "aws") expect([p, envPrefix]).toEqual([p, null])
            if (fixedCredentials) {
                expect(["aws", "vertexKey", "optionalKey"]).toContain(
                    credential,
                )
            }
        }
        const fixed = PROVIDER_NAMES.filter(
            (p) => PROVIDERS[p].fixedCredentials,
        )
        expect(fixed).toEqual(["bedrock", "vertexai", "ollama"])
    })

    it("keeps a short model list exactly for the providers that cannot list models", () => {
        for (const p of PROVIDER_NAMES) {
            const { modelList, models } = PROVIDERS[p]
            if (modelList) {
                expect([p, models]).toEqual([p, undefined])
            } else {
                expect([p, models?.length ?? 0]).not.toEqual([p, 0])
            }
        }
    })

    it("names every server variable in env.example", () => {
        // env.example is written by hand; a new provider adds its two lines
        const example = readFileSync(
            path.join(process.cwd(), "env.example"),
            "utf8",
        )
        for (const p of PROVIDER_NAMES) {
            const { apiKey, baseUrl } = envVarsOf(p)
            for (const name of [apiKey, baseUrl]) {
                if (!name) continue
                expect([p, name, example.includes(name)]).toEqual([
                    p,
                    name,
                    true,
                ])
            }
        }
    })
})

describe("the picker's order", () => {
    it("groups every provider once, in record order", () => {
        expect(PROVIDER_GROUPS).toEqual([
            {
                id: "vendors",
                providers: [
                    "openai",
                    "anthropic",
                    "google",
                    "deepseek",
                    "qwen",
                    "doubao",
                    "glm",
                    "kimi",
                    "minimax",
                    "mimo",
                ],
            },
            {
                id: "aggregators",
                providers: [
                    "openrouter",
                    "aihubmix",
                    "siliconflow",
                    "modelscope",
                    "novita",
                    "atlascloud",
                    "qiniu",
                    "gateway",
                ],
            },
            {
                id: "cloud",
                providers: ["bedrock", "vertexai", "azure", "edgeone"],
            },
            { id: "selfHosted", providers: ["ollama", "sglang", "custom"] },
        ])
    })
})
