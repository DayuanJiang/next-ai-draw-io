import { afterEach, describe, expect, it } from "vitest"
import {
    loadFlattenedServerModels,
    type ServerModelsConfig,
    ServerModelsConfigSchema,
} from "@/lib/server-model-config"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
    process.env.AI_PROVIDER = ORIGINAL_ENV.AI_PROVIDER
    process.env.AI_MODEL = ORIGINAL_ENV.AI_MODEL
    process.env.AI_MODELS_CONFIG_PATH = ORIGINAL_ENV.AI_MODELS_CONFIG_PATH
    process.env.AI_MODELS_CONFIG = ORIGINAL_ENV.AI_MODELS_CONFIG
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
                },
            ],
        }

        const parsed = ServerModelsConfigSchema.parse(config)
        expect(parsed.providers[0].apiKeyEnv).toBe("OPENAI_API_KEY_TEAM_A")
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
        process.env.AI_MODELS_CONFIG_PATH = `non-existent-config-${Date.now()}.json`

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
        process.env.AI_MODELS_CONFIG = JSON.stringify(config)
        process.env.AI_MODELS_CONFIG_PATH = "" // Clear file path

        const models = await loadFlattenedServerModels()

        expect(models.length).toBe(2)

        const defaults = models.filter((m) => m.isDefault)
        expect(defaults.length).toBe(1)

        const defaultModel = defaults[0]
        expect(defaultModel.provider).toBe("openai")
        expect(defaultModel.modelId).toBe("gpt-4o") // First model of default provider
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
        process.env.AI_MODELS_CONFIG = JSON.stringify(config)
        process.env.AI_MODELS_CONFIG_PATH = "" // Clear file path

        const models = await loadFlattenedServerModels()

        expect(models.length).toBe(1)
        expect(models[0].apiKeyEnv).toEqual(["OPENAI_KEY_1", "OPENAI_KEY_2"])
    })
})
