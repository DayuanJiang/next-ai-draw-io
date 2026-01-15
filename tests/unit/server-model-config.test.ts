import path from "path"
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
})

describe("ServerModelsConfigSchema", () => {
    it("accepts valid provider names", () => {
        const config: ServerModelsConfig = {
            version: 1,
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
            version: 1,
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
})

describe("loadFlattenedServerModels", () => {
    it("returns empty array when config file is missing", async () => {
        // Point to a non-existent config path so fs.readFile throws ENOENT
        process.env.AI_MODELS_CONFIG_PATH = `non-existent-config-${Date.now()}.json`

        const models = await loadFlattenedServerModels()
        expect(models).toEqual([])
    })

    it("flattens providers and marks default model from env", async () => {
        const configPath = path.join(process.cwd(), "ai-models.json")
        process.env.AI_MODELS_CONFIG_PATH = configPath
        process.env.AI_PROVIDER = "openai"
        process.env.AI_MODEL = "gpt-4o-mini"

        const models = await loadFlattenedServerModels()

        expect(models.length).toBeGreaterThan(0)

        const defaults = models.filter((m) => m.isDefault)
        expect(defaults.length).toBe(1)

        const defaultModel = defaults[0]
        expect(defaultModel.provider).toBe("openai")
        expect(defaultModel.modelId).toBe("gpt-4o-mini")
        expect(defaultModel.id).toBe(
            `server:${defaultModel.provider}:${defaultModel.modelId}`,
        )
    })
})
