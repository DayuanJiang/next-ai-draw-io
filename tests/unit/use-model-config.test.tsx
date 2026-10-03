import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useModelConfig } from "@/hooks/use-model-config"
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
