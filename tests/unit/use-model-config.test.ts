// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { getSelectedAIConfig } from "@/hooks/use-model-config"
import { STORAGE_KEYS } from "@/lib/storage"

describe("getSelectedAIConfig", () => {
    beforeEach(() => {
        const storage = new Map<string, string>()
        const localStorageMock = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value)
            },
            removeItem: (key: string) => {
                storage.delete(key)
            },
            clear: () => {
                storage.clear()
            },
        }

        Object.defineProperty(window, "localStorage", {
            value: localStorageMock,
            configurable: true,
        })
        Object.defineProperty(globalThis, "localStorage", {
            value: localStorageMock,
            configurable: true,
        })
    })

    it("returns user-configured pricing fields for the selected model", () => {
        localStorage.setItem(STORAGE_KEYS.accessCode, "demo-access-code")
        localStorage.setItem(
            STORAGE_KEYS.modelConfigs,
            JSON.stringify({
                version: 1,
                selectedModelId: "model-1",
                providers: [
                    {
                        id: "provider-1",
                        provider: "openai",
                        apiKey: "sk-test",
                        baseUrl: "https://api.openai.com/v1",
                        models: [
                            {
                                id: "model-1",
                                modelId: "gpt-4o",
                                inputPricePerMillionUsd: "2.5",
                                outputPricePerMillionUsd: "10",
                                cachedInputPricePerMillionUsd: "1.25",
                                cacheWritePricePerMillionUsd: "3.75",
                            },
                        ],
                    },
                ],
            }),
        )

        expect(getSelectedAIConfig()).toMatchObject({
            accessCode: "demo-access-code",
            aiProvider: "openai",
            aiBaseUrl: "https://api.openai.com/v1",
            aiApiKey: "sk-test",
            aiModel: "gpt-4o",
            inputPricePerMillionUsd: "2.5",
            outputPricePerMillionUsd: "10",
            cachedInputPricePerMillionUsd: "1.25",
            cacheWritePricePerMillionUsd: "3.75",
        })
    })
})
