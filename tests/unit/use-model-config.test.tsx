import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getSelectedAIConfig, useModelConfig } from "@/hooks/use-model-config"
import type { FlattenedServerModel } from "@/lib/server-model-config"
import { STORAGE_KEYS } from "@/lib/storage"
import type { MultiModelConfig } from "@/lib/types/model-config"

const SERVER_MODELS: FlattenedServerModel[] = [
    {
        id: "server:openai-main:gpt-4o-mini",
        modelId: "gpt-4o-mini",
        provider: "openai",
        providerLabel: "OpenAI Main",
        isDefault: false,
    },
    {
        id: "server:openai-main:gpt-4o",
        modelId: "gpt-4o",
        provider: "openai",
        providerLabel: "OpenAI Main",
        isDefault: true,
    },
]

const USER_CONFIG: MultiModelConfig = {
    version: 1,
    providers: [
        {
            id: "p1",
            provider: "openai",
            apiKey: "sk-test",
            models: [{ id: "m1", modelId: "gpt-4o" }],
        },
    ],
}

function storeConfig(config: MultiModelConfig) {
    localStorage.setItem(STORAGE_KEYS.modelConfigs, JSON.stringify(config))
}

async function renderLoaded() {
    const hook = renderHook(() => useModelConfig())
    await waitFor(() => expect(hook.result.current.isLoaded).toBe(true))
    return hook
}

beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
            ok: true,
            json: async () => ({ models: SERVER_MODELS }),
        })),
    )
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe("useModelConfig server model selection", () => {
    it("replaces a saved server model that no longer exists", async () => {
        storeConfig({
            ...USER_CONFIG,
            selectedModelId: "server:openai-production:gpt-4o",
        })
        const { result } = await renderLoaded()
        expect(result.current.selectedModelId).toBe("server:openai-main:gpt-4o")
    })

    it("keeps a server model saved under its old id", async () => {
        // Before non-ASCII provider names got their own slug, "主力 OpenAI"
        // became "openai"
        const renamed: FlattenedServerModel = {
            id: "server:4e3b-529b-openai:gpt-4o-mini",
            modelId: "gpt-4o-mini",
            provider: "openai",
            providerLabel: "主力 OpenAI",
            isDefault: false,
        }
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => ({ models: [...SERVER_MODELS, renamed] }),
            })),
        )
        storeConfig({
            ...USER_CONFIG,
            selectedModelId: "server:openai:gpt-4o-mini",
        })
        const { result } = await renderLoaded()
        expect(result.current.selectedModelId).toBe(renamed.id)
    })

    it("keeps a saved server model that still exists", async () => {
        storeConfig({
            ...USER_CONFIG,
            selectedModelId: "server:openai-main:gpt-4o-mini",
        })
        const { result } = await renderLoaded()
        expect(result.current.selectedModelId).toBe(
            "server:openai-main:gpt-4o-mini",
        )
    })

    it("skips a saved provider this version does not know", async () => {
        // Saved by another version, or edited by hand: it used to crash the
        // whole page on load
        storeConfig({
            ...USER_CONFIG,
            providers: [
                ...USER_CONFIG.providers,
                {
                    id: "p9",
                    provider: "not-a-provider" as any,
                    apiKey: "k",
                    models: [{ id: "m9", modelId: "x" }],
                },
            ],
        })
        const { result } = await renderLoaded()
        expect(result.current.config.providers.map((p) => p.id)).toEqual(["p1"])
        expect(result.current.models.map((m) => m.id)).toContain("m1")
    })

    it("keeps an unknown provider and its key in storage", async () => {
        // The version that saved it may be opened again (an older desktop
        // build, another tab): the provider must still be there
        storeConfig({
            ...USER_CONFIG,
            providers: [
                ...USER_CONFIG.providers,
                {
                    id: "p9",
                    provider: "not-a-provider" as any,
                    apiKey: "k9",
                    models: [{ id: "m9", modelId: "x" }],
                },
            ],
            selectedModelId: "m1",
        })
        const { result } = await renderLoaded()
        act(() => result.current.setSelectedModelId(undefined))
        await waitFor(() => {
            const stored = JSON.parse(
                localStorage.getItem(STORAGE_KEYS.modelConfigs) ?? "{}",
            )
            expect(stored.selectedModelId).toBeUndefined()
            expect(stored.providers.map((p: { id: string }) => p.id)).toEqual([
                "p1",
                "p9",
            ])
            expect(stored.providers[1].apiKey).toBe("k9")
        })
        // Sending reads the stored config too, and must not trip over it
        act(() => result.current.setSelectedModelId("m1"))
        expect(getSelectedAIConfig()).toMatchObject({
            aiProvider: "openai",
            aiModel: "gpt-4o",
        })
    })

    it("keeps a selected user model", async () => {
        storeConfig({ ...USER_CONFIG, selectedModelId: "m1" })
        const { result } = await renderLoaded()
        expect(result.current.selectedModelId).toBe("m1")
    })

    it("falls back to the default server model when the selected model is deleted", async () => {
        storeConfig({ ...USER_CONFIG, selectedModelId: "m1" })
        const { result } = await renderLoaded()
        act(() => result.current.deleteModel("p1", "m1"))
        expect(result.current.selectedModelId).toBe("server:openai-main:gpt-4o")
    })

    it("falls back to the default server model when the selected provider is deleted", async () => {
        storeConfig({ ...USER_CONFIG, selectedModelId: "m1" })
        const { result } = await renderLoaded()
        act(() => result.current.deleteProvider("p1"))
        expect(result.current.selectedModelId).toBe("server:openai-main:gpt-4o")
    })
})

describe("useModelConfig in the desktop app", () => {
    it("reloads the server models after a preset switch restarts the server", async () => {
        // The new preset offers other models; the saved one is gone
        let restarted: (() => void) | undefined
        ;(window as any).electronAPI = {
            onServerRestarted: (callback: () => void) => {
                restarted = callback
                return () => {
                    restarted = undefined
                }
            },
        }
        try {
            storeConfig({
                ...USER_CONFIG,
                selectedModelId: "server:openai-main:gpt-4o-mini",
            })
            const { result } = await renderLoaded()
            await waitFor(() => expect(restarted).toBeDefined())
            const nextModels: FlattenedServerModel[] = [
                {
                    id: "server:claude:claude-sonnet-5-5",
                    modelId: "claude-sonnet-5-5",
                    provider: "anthropic",
                    providerLabel: "Claude",
                    isDefault: true,
                },
            ]
            vi.stubGlobal(
                "fetch",
                vi.fn(async () => ({
                    ok: true,
                    json: async () => ({ models: nextModels }),
                })),
            )
            act(() => restarted?.())
            await waitFor(() =>
                expect(result.current.selectedModelId).toBe(
                    "server:claude:claude-sonnet-5-5",
                ),
            )
        } finally {
            delete (window as any).electronAPI
        }
    })
})

describe("useModelConfig across tabs", () => {
    it("reloads the config when another tab saves it", async () => {
        storeConfig({ ...USER_CONFIG, selectedModelId: "m1" })
        const { result } = await renderLoaded()

        const fromOtherTab: MultiModelConfig = {
            ...USER_CONFIG,
            providers: [
                ...USER_CONFIG.providers,
                {
                    id: "p2",
                    provider: "anthropic",
                    apiKey: "sk-ant",
                    models: [{ id: "m2", modelId: "claude-sonnet-4-5" }],
                },
            ],
            selectedModelId: "m2",
        }
        act(() => {
            storeConfig(fromOtherTab)
            window.dispatchEvent(
                new StorageEvent("storage", { key: STORAGE_KEYS.modelConfigs }),
            )
        })

        expect(result.current.selectedModelId).toBe("m2")
        expect(result.current.config.providers).toHaveLength(2)
    })
})

describe("useModelConfig migration", () => {
    const OLD = {
        provider: "next-ai-draw-io-ai-provider",
        baseUrl: "next-ai-draw-io-ai-base-url",
        apiKey: "next-ai-draw-io-ai-api-key",
        model: "next-ai-draw-io-ai-model",
    }

    it("moves an old keyless Ollama setup into the new format", async () => {
        localStorage.setItem(OLD.provider, "ollama")
        localStorage.setItem(OLD.baseUrl, "http://localhost:11434/api")
        localStorage.setItem(OLD.apiKey, "")
        localStorage.setItem(OLD.model, "llama3.2")
        const { result } = await renderLoaded()
        const [provider] = result.current.config.providers
        expect(provider).toMatchObject({
            provider: "ollama",
            apiKey: "",
            baseUrl: "http://localhost:11434/api",
            models: [{ modelId: "llama3.2" }],
        })
        expect(result.current.selectedModelId).toBe(provider.models[0].id)
        expect(localStorage.getItem(OLD.model)).toBeNull()
    })

    it("keeps an old Ollama without a URL on the server's Ollama", async () => {
        localStorage.setItem(OLD.provider, "ollama")
        localStorage.setItem(OLD.apiKey, "")
        localStorage.setItem(OLD.model, "llama3.2")
        const { result } = await renderLoaded()
        // No cloud address: the request takes OLLAMA_BASE_URL or this machine
        expect(result.current.config.providers[0].baseUrl).toBe("")
    })

    it("still needs a key for other providers", async () => {
        localStorage.setItem(OLD.provider, "openai")
        localStorage.setItem(OLD.model, "gpt-4o")
        const { result } = await renderLoaded()
        expect(result.current.config.providers).toEqual([])
    })
})
