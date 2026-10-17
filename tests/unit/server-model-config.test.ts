import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _resetForTests } from "@/lib/admin/settings"
import {
    loadFlattenedServerModels,
    type ServerModelsConfig,
    ServerModelsConfigSchema,
    slugify,
} from "@/lib/server-model-config"

beforeEach(() => {
    // Isolate from any local data/settings.json (admin panel providers
    // are merged into the server models config)
    vi.stubEnv("SETTINGS_FILE", "/nonexistent/settings.json")
    _resetForTests()
})

afterEach(() => {
    _resetForTests()
})

describe("ServerModelsConfigSchema", () => {
    it("accepts valid provider names", () => {
        const config: ServerModelsConfig = {
            providers: [
                {
                    name: "OpenAI Server",
                    provider: "openai",
                    models: ["gpt-4o"],
                },
            ],
        }

        expect(() => ServerModelsConfigSchema.parse(config)).not.toThrow()
    })

    it("rejects invalid provider names", () => {
        const invalidConfig = {
            providers: [
                {
                    name: "Invalid Provider",
                    // Cast to any so we can verify runtime validation, not TypeScript
                    provider: "invalid-provider" as any,
                    models: ["model-1"],
                },
            ],
        }

        expect(() =>
            ServerModelsConfigSchema.parse(invalidConfig as any),
        ).toThrow()
    })

    it("accepts apiKeyEnv as single string", () => {
        const config: ServerModelsConfig = {
            providers: [
                {
                    name: "OpenAI Server",
                    provider: "openai",
                    models: ["gpt-4o"],
                    apiKeyEnv: "OPENAI_API_KEY_TEAM_A",
                    baseUrlEnv: "OPENAI_BASE_URL_TEAM_A",
                },
            ],
        }

        const parsed = ServerModelsConfigSchema.parse(config)
        expect(parsed.providers[0].apiKeyEnv).toBe("OPENAI_API_KEY_TEAM_A")
        expect(parsed.providers[0].baseUrlEnv).toBe("OPENAI_BASE_URL_TEAM_A")
    })

    it("accepts apiKeyEnv as array of strings for load balancing", () => {
        const config: ServerModelsConfig = {
            providers: [
                {
                    name: "OpenAI Server",
                    provider: "openai",
                    models: ["gpt-4o"],
                    apiKeyEnv: ["OPENAI_KEY_1", "OPENAI_KEY_2", "OPENAI_KEY_3"],
                },
            ],
        }

        const parsed = ServerModelsConfigSchema.parse(config)
        expect(parsed.providers[0].apiKeyEnv).toEqual([
            "OPENAI_KEY_1",
            "OPENAI_KEY_2",
            "OPENAI_KEY_3",
        ])
    })

    it("rejects empty array for apiKeyEnv", () => {
        const config = {
            providers: [
                {
                    name: "OpenAI Server",
                    provider: "openai",
                    models: ["gpt-4o"],
                    apiKeyEnv: [],
                },
            ],
        }

        expect(() => ServerModelsConfigSchema.parse(config)).toThrow()
    })

    it("rejects empty string in apiKeyEnv array", () => {
        const config = {
            providers: [
                {
                    name: "OpenAI Server",
                    provider: "openai",
                    models: ["gpt-4o"],
                    apiKeyEnv: ["VALID_KEY", ""],
                },
            ],
        }

        expect(() => ServerModelsConfigSchema.parse(config)).toThrow()
    })
})

describe("loadFlattenedServerModels", () => {
    it("returns empty array when config file is missing", async () => {
        // Point to a non-existent config path so fs.readFile throws ENOENT
        vi.stubEnv(
            "AI_MODELS_CONFIG_PATH",
            `non-existent-config-${Date.now()}.json`,
        )

        const models = await loadFlattenedServerModels()
        expect(models).toEqual([])
    })

    it("flattens providers and marks default model from env var config", async () => {
        // Use AI_MODELS_CONFIG env var instead of file
        const config: ServerModelsConfig = {
            providers: [
                {
                    name: "OpenAI Server",
                    provider: "openai",
                    models: ["gpt-4o", "gpt-4o-mini"],
                    default: true,
                },
            ],
        }
        vi.stubEnv("AI_MODELS_CONFIG", JSON.stringify(config))
        vi.stubEnv("AI_MODELS_CONFIG_PATH", "") // Clear file path

        const models = await loadFlattenedServerModels()

        expect(models.length).toBe(2)

        const defaults = models.filter((m) => m.isDefault)
        expect(defaults.length).toBe(1)

        const defaultModel = defaults[0]
        expect(defaultModel.provider).toBe("openai")
        expect(defaultModel.modelId).toBe("gpt-4o") // First model of default provider
    })

    it("falls back to comma-separated AI_MODEL when no other config is set", async () => {
        vi.stubEnv("AI_MODELS_CONFIG", "")
        vi.stubEnv(
            "AI_MODELS_CONFIG_PATH",
            `non-existent-config-${Date.now()}.json`,
        )
        vi.stubEnv("AI_PROVIDER", "openai")
        vi.stubEnv("AI_MODEL", "gpt-4o, gpt-4o-mini, gpt-4o")

        const models = await loadFlattenedServerModels()

        // Trims, deduplicates, and preserves order
        expect(models.map((m) => m.modelId)).toEqual(["gpt-4o", "gpt-4o-mini"])
        expect(models.every((m) => m.provider === "openai")).toBe(true)

        // First model is marked default (provider has default: true)
        const defaults = models.filter((m) => m.isDefault)
        expect(defaults.length).toBe(1)
        expect(defaults[0].modelId).toBe("gpt-4o")
    })

    it("does not synthesize when AI_MODEL has no comma", async () => {
        vi.stubEnv("AI_MODELS_CONFIG", "")
        vi.stubEnv(
            "AI_MODELS_CONFIG_PATH",
            `non-existent-config-${Date.now()}.json`,
        )
        vi.stubEnv("AI_PROVIDER", "openai")
        vi.stubEnv("AI_MODEL", "gpt-4o")

        const models = await loadFlattenedServerModels()
        expect(models).toEqual([])
    })

    it("does not synthesize when AI_PROVIDER is unset", async () => {
        vi.stubEnv("AI_MODELS_CONFIG", "")
        vi.stubEnv(
            "AI_MODELS_CONFIG_PATH",
            `non-existent-config-${Date.now()}.json`,
        )
        vi.stubEnv("AI_PROVIDER", undefined)
        vi.stubEnv("AI_MODEL", "gpt-4o, gpt-4o-mini")

        const models = await loadFlattenedServerModels()
        expect(models).toEqual([])
    })

    it("preserves apiKeyEnv array in flattened models for load balancing", async () => {
        const config: ServerModelsConfig = {
            providers: [
                {
                    name: "OpenAI LoadBalanced",
                    provider: "openai",
                    models: ["gpt-4o"],
                    apiKeyEnv: ["OPENAI_KEY_1", "OPENAI_KEY_2"],
                },
            ],
        }
        vi.stubEnv("AI_MODELS_CONFIG", JSON.stringify(config))
        vi.stubEnv("AI_MODELS_CONFIG_PATH", "") // Clear file path

        const models = await loadFlattenedServerModels()

        expect(models.length).toBe(1)
        expect(models[0].apiKeyEnv).toEqual(["OPENAI_KEY_1", "OPENAI_KEY_2"])
    })
})

describe("slugify", () => {
    it("keeps ASCII names readable", () => {
        expect(slugify("OpenAI Production")).toBe("openai-production")
    })

    it("gives distinct ASCII slugs to distinct CJK names", () => {
        const slugs = ["主力", "备用", "DeepSeek 官方", "DeepSeek 备用"].map(
            slugify,
        )
        expect(new Set(slugs).size).toBe(4)
        for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/)
    })
})

describe("loadFlattenedServerModels id collisions", () => {
    it("drops a model whose id repeats an earlier provider's", async () => {
        const config: ServerModelsConfig = {
            providers: [
                { name: "OpenAI", provider: "openai", models: ["gpt-4o"] },
                {
                    name: "openai",
                    provider: "openai",
                    models: ["gpt-4o"],
                    apiKeyEnv: "OTHER_KEY",
                },
                {
                    name: "主力",
                    provider: "deepseek",
                    models: ["deepseek-chat"],
                },
                {
                    name: "备用",
                    provider: "deepseek",
                    models: ["deepseek-chat"],
                },
            ],
        }
        vi.stubEnv("AI_MODELS_CONFIG", JSON.stringify(config))

        const models = await loadFlattenedServerModels()
        const ids = models.map((m) => m.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toHaveLength(3)
        expect(models[0].apiKeyEnv).toBeUndefined()
    })
})
