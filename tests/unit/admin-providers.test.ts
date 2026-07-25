import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
    ADMIN_PROVIDERS_KEY,
    adminProvidersToConfig,
    deriveEnvUpdates,
    loadAdminProviders,
    maskAdminProviders,
    mergeSecrets,
    type StoredAdminProvider,
    validateAdminProviders,
} from "@/lib/admin/providers"
import { _resetForTests, saveSettings } from "@/lib/admin/settings"
import { loadRawServerModelsConfig } from "@/lib/server-model-config"

let tmpDir: string

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-providers-"))
    process.env.SETTINGS_FILE = path.join(tmpDir, "settings.json")
    _resetForTests()
})

afterEach(() => {
    _resetForTests()
    delete process.env.SETTINGS_FILE
    delete process.env.AI_MODELS_CONFIG
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

function provider(
    overrides: Partial<StoredAdminProvider> = {},
): StoredAdminProvider {
    return {
        id: "p1",
        provider: "openai",
        apiKey: "sk-test",
        models: ["gpt-5.2"],
        ...overrides,
    }
}

describe("deriveEnvUpdates", () => {
    it("writes credentials to ADMIN_-prefixed env vars (never shadows standard vars)", () => {
        const updates = deriveEnvUpdates([provider()], [])
        expect(updates.ADMIN_OPENAI_API_KEY).toBe("sk-test")
        expect(updates.OPENAI_API_KEY).toBeUndefined()
        expect(JSON.parse(updates.ADMIN_PROVIDERS as string)).toHaveLength(1)
        // AI_MODELS_CONFIG is no longer written (merged at read time)
        expect(updates.AI_MODELS_CONFIG).toBeNull()
    })

    it("suffixes env vars for a second instance of the same provider", () => {
        const updates = deriveEnvUpdates(
            [
                provider({ id: "p1", name: "First" }),
                provider({
                    id: "p2",
                    name: "Second",
                    apiKey: "sk-second",
                    models: ["gpt-5-mini"],
                }),
            ],
            [],
        )
        expect(updates.ADMIN_OPENAI_API_KEY).toBe("sk-test")
        expect(updates.ADMIN_OPENAI_API_KEY_2).toBe("sk-second")
    })

    it("maps bedrock credentials to AWS env vars", () => {
        const updates = deriveEnvUpdates(
            [
                provider({
                    provider: "bedrock",
                    apiKey: undefined,
                    awsAccessKeyId: "AKIA123",
                    awsSecretAccessKey: "secret",
                    awsRegion: "us-west-2",
                    models: ["claude-x"],
                }),
            ],
            [],
        )
        expect(updates.AWS_ACCESS_KEY_ID).toBe("AKIA123")
        expect(updates.AWS_SECRET_ACCESS_KEY).toBe("secret")
        expect(updates.AWS_REGION).toBe("us-west-2")
    })

    it("clears keys owned by the previous list when providers are removed", () => {
        const prev = [provider()]
        const updates = deriveEnvUpdates([], prev)
        expect(updates.ADMIN_OPENAI_API_KEY).toBeNull()
        expect(updates.AI_MODELS_CONFIG).toBeNull()
        expect(updates.ADMIN_PROVIDERS).toBeNull()
    })

    it("sets AI_PROVIDER/AI_MODEL only when a default is flagged", () => {
        const noDefault = deriveEnvUpdates([provider()], [])
        expect(noDefault.AI_PROVIDER).toBeNull()
        expect(noDefault.AI_MODEL).toBeNull()

        const updates = deriveEnvUpdates(
            [
                provider({ id: "p1" }),
                provider({
                    id: "p2",
                    provider: "deepseek",
                    models: ["deepseek-chat"],
                    isDefault: true,
                }),
            ],
            [],
        )
        expect(updates.AI_PROVIDER).toBe("deepseek")
        expect(updates.AI_MODEL).toBe("deepseek-chat")
    })
})

describe("adminProvidersToConfig", () => {
    it("builds a config with ADMIN_-prefixed apiKeyEnv wiring", () => {
        const config = adminProvidersToConfig([provider()])
        expect(config.providers).toHaveLength(1)
        expect(config.providers[0].models).toEqual(["gpt-5.2"])
        expect(config.providers[0].apiKeyEnv).toBe("ADMIN_OPENAI_API_KEY")
    })

    it("wires suffixed env vars for a second instance", () => {
        const config = adminProvidersToConfig([
            provider({ id: "p1", name: "First" }),
            provider({
                id: "p2",
                name: "Second",
                apiKey: "sk-second",
                models: ["gpt-5-mini"],
            }),
        ])
        expect(config.providers[1].apiKeyEnv).toBe("ADMIN_OPENAI_API_KEY_2")
    })

    it("skips providers without models and carries the default flag", () => {
        const config = adminProvidersToConfig([
            provider({ id: "p1", models: [] }),
            provider({ id: "p2", name: "D", isDefault: true }),
        ])
        expect(config.providers).toHaveLength(1)
        expect(config.providers[0].default).toBe(true)
    })
})

describe("mergeSecrets", () => {
    it("keeps stored secret when client sends an isSet marker", () => {
        const stored = [provider({ apiKey: "sk-original" })]
        const merged = mergeSecrets(
            [
                {
                    ...provider(),
                    apiKey: { isSet: true, hint: "…test" },
                },
            ],
            stored,
        )
        expect(merged[0].apiKey).toBe("sk-original")
    })

    it("replaces secret when client sends a plaintext string", () => {
        const stored = [provider({ apiKey: "sk-original" })]
        const merged = mergeSecrets(
            [{ ...provider(), apiKey: "sk-new" }],
            stored,
        )
        expect(merged[0].apiKey).toBe("sk-new")
    })

    it("clears secret when client sends undefined", () => {
        const stored = [provider({ apiKey: "sk-original" })]
        const merged = mergeSecrets(
            [{ ...provider(), apiKey: undefined }],
            stored,
        )
        expect(merged[0].apiKey).toBeUndefined()
    })
})

describe("loadRawServerModelsConfig merge", () => {
    it("combines env AI_MODELS_CONFIG with panel providers", async () => {
        process.env.AI_MODELS_CONFIG = JSON.stringify({
            providers: [
                {
                    name: "Env OpenAI",
                    provider: "openai",
                    models: ["gpt-from-env"],
                    default: true,
                },
            ],
        })
        saveSettings(deriveEnvUpdates([provider({ name: "Panel" })], []))

        const merged = await loadRawServerModelsConfig()
        expect(merged?.providers.map((p) => p.name)).toEqual([
            "Env OpenAI",
            "Panel",
        ])
        // Env default kept because panel set none
        expect(merged?.providers[0].default).toBe(true)
    })

    it("panel default overrides the env default", async () => {
        process.env.AI_MODELS_CONFIG = JSON.stringify({
            providers: [
                {
                    name: "Env OpenAI",
                    provider: "openai",
                    models: ["gpt-from-env"],
                    default: true,
                },
            ],
        })
        saveSettings(
            deriveEnvUpdates(
                [provider({ name: "Panel", isDefault: true })],
                [],
            ),
        )

        const merged = await loadRawServerModelsConfig()
        expect(merged?.providers[0].default).toBeFalsy()
        expect(merged?.providers[1].default).toBe(true)
    })

    it("returns only env config when the panel has no providers", async () => {
        process.env.AI_MODELS_CONFIG = JSON.stringify({
            providers: [
                {
                    name: "Env Only",
                    provider: "openai",
                    models: ["gpt-from-env"],
                },
            ],
        })
        const merged = await loadRawServerModelsConfig()
        expect(merged?.providers.map((p) => p.name)).toEqual(["Env Only"])
    })
})

describe("validateAdminProviders", () => {
    it("rejects names clashing with env-configured providers", () => {
        expect(
            validateAdminProviders([provider({ name: "Env OpenAI" })], {
                providers: [
                    {
                        name: "Env OpenAI",
                        provider: "openai",
                        models: ["gpt-x"],
                    },
                ],
            }),
        ).toMatch(/already defined/)
    })

    it("rejects a global-credential provider already in the env config", () => {
        expect(
            validateAdminProviders(
                [
                    provider({
                        provider: "bedrock",
                        apiKey: undefined,
                        awsAccessKeyId: "AKIA-panel",
                        awsSecretAccessKey: "panel-secret",
                        awsRegion: "us-east-1",
                        models: ["claude-x"],
                    }),
                ],
                {
                    providers: [
                        {
                            name: "Env Bedrock",
                            provider: "bedrock",
                            models: ["claude-env"],
                        },
                    ],
                },
            ),
        ).toMatch(/shares global credentials/)
    })

    it("allows a normal provider type alongside the same env type", () => {
        expect(
            validateAdminProviders([provider({ name: "Panel OpenAI" })], {
                providers: [
                    {
                        name: "Env OpenAI",
                        provider: "openai",
                        models: ["gpt-x"],
                    },
                ],
            }),
        ).toBeNull()
    })

    it("rejects two bedrock instances", () => {
        const list = [
            provider({ id: "p1", provider: "bedrock" }),
            provider({ id: "p2", provider: "bedrock" }),
        ]
        expect(validateAdminProviders(list)).toMatch(/Only one/)
    })

    it("rejects duplicate display names", () => {
        const list = [
            provider({ id: "p1", name: "Same" }),
            provider({ id: "p2", name: "Same" }),
        ]
        expect(validateAdminProviders(list)).toMatch(/unique/)
    })

    it("rejects multiple defaults", () => {
        const list = [
            provider({ id: "p1", isDefault: true }),
            provider({ id: "p2", name: "Other", isDefault: true }),
        ]
        expect(validateAdminProviders(list)).toMatch(/default/)
    })

    it("accepts a valid list", () => {
        const list = [
            provider({ id: "p1", isDefault: true }),
            provider({ id: "p2", name: "Backup" }),
        ]
        expect(validateAdminProviders(list)).toBeNull()
    })
})

describe("loadAdminProviders", () => {
    it("returns [] when nothing is stored", () => {
        expect(loadAdminProviders()).toEqual([])
    })

    it("loads valid stored providers", () => {
        saveSettings({ [ADMIN_PROVIDERS_KEY]: JSON.stringify([provider()]) })
        expect(loadAdminProviders()).toHaveLength(1)
    })

    it("round-trips a bedrock provider with multiple string secrets", () => {
        const bedrock = provider({
            provider: "bedrock",
            apiKey: undefined,
            awsAccessKeyId: "AKIA123",
            awsSecretAccessKey: "secret",
            awsRegion: "us-west-2",
            models: ["claude-x"],
        })
        saveSettings({ [ADMIN_PROVIDERS_KEY]: JSON.stringify([bedrock]) })
        const loaded = loadAdminProviders()
        expect(loaded).toHaveLength(1)
        expect(loaded[0].awsAccessKeyId).toBe("AKIA123")
        expect(loaded[0].awsSecretAccessKey).toBe("secret")
    })

    it("drops malformed entries and keeps valid ones", () => {
        saveSettings({
            [ADMIN_PROVIDERS_KEY]: JSON.stringify([
                provider({ id: "good" }),
                { id: "missing-fields" }, // no provider/models
                { provider: "openai", models: ["x"] }, // no id
                "not-an-object",
            ]),
        })
        const loaded = loadAdminProviders()
        expect(loaded).toHaveLength(1)
        expect(loaded[0].id).toBe("good")
    })

    it("returns [] when the stored value is not an array", () => {
        saveSettings({ [ADMIN_PROVIDERS_KEY]: JSON.stringify({ nope: true }) })
        expect(loadAdminProviders()).toEqual([])
    })

    it("returns [] on invalid JSON", () => {
        saveSettings({ [ADMIN_PROVIDERS_KEY]: "{ broken" })
        expect(loadAdminProviders()).toEqual([])
    })

    it("drops entries whose secret is an {isSet} marker, not a string", () => {
        // A hand-edited file could hold a transit-only marker object; if it
        // slipped through, maskSecret() would throw on a non-string value.
        saveSettings({
            [ADMIN_PROVIDERS_KEY]: JSON.stringify([
                { ...provider(), apiKey: { isSet: true, hint: "…1234" } },
            ]),
        })
        const loaded = loadAdminProviders()
        expect(loaded).toEqual([])
        // Masking the loaded list must not throw
        expect(() => maskAdminProviders(loaded)).not.toThrow()
    })
})
