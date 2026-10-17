import { describe, expect, it } from "vitest"
import {
    filterProviderGroups,
    hasCredentials,
    PROVIDER_GROUPS,
    providerStatus,
} from "@/lib/provider-setup"
import { PROVIDERS } from "@/lib/providers"
import type { ProviderConfig } from "@/lib/types/model-config"
import { useUiStore } from "@/stores/ui-store"

const provider = (p: Partial<ProviderConfig>): ProviderConfig => ({
    id: "p",
    provider: "openai",
    apiKey: "",
    models: [],
    ...p,
})

describe("provider groups", () => {
    it("hold every provider exactly once", () => {
        const grouped = PROVIDER_GROUPS.flatMap((g) => g.providers)
        expect([...grouped].sort()).toEqual(Object.keys(PROVIDERS).sort())
        expect(new Set(grouped).size).toBe(grouped.length)
    })

    it("are searched by label or name, ignoring case and spaces", () => {
        expect(filterProviderGroups("  ")).toBe(PROVIDER_GROUPS)
        const kimi = filterProviderGroups("MOONSHOT")
        expect(kimi.map((g) => g.providers)).toEqual([["kimi"]])
        // By the provider's own name too
        expect(
            filterProviderGroups("vertexai").flatMap((g) => g.providers),
        ).toEqual(["vertexai"])
        expect(filterProviderGroups("no such provider")).toEqual([])
    })
})

describe("hasCredentials", () => {
    it("asks each provider for what it signs in with", () => {
        const cases: [Partial<ProviderConfig>, boolean][] = [
            [{ provider: "openai" }, false],
            [{ provider: "openai", apiKey: "k" }, true],
            [{ provider: "ollama" }, true],
            [{ provider: "edgeone" }, true],
            [{ provider: "vertexai", apiKey: "k" }, false],
            [{ provider: "vertexai", vertexApiKey: "k" }, true],
            // Azure has no default URL: the user's own is part of signing in
            [{ provider: "azure", apiKey: "k" }, false],
            [
                {
                    provider: "azure",
                    apiKey: "k",
                    baseUrl: "https://contoso.openai.azure.com/openai",
                },
                true,
            ],
            // The placeholder Azure once wrote into new entries names no resource
            [
                {
                    provider: "azure",
                    apiKey: "k",
                    baseUrl: "https://your-resource.openai.azure.com/openai",
                },
                false,
            ],
            // The OpenAI-compatible preset has no default URL either
            [{ provider: "custom", apiKey: "k" }, false],
            [
                {
                    provider: "custom",
                    apiKey: "k",
                    baseUrl: "http://127.0.0.1:1234/v1",
                },
                true,
            ],
            // SGLang's local default fills the form, so a key is enough here
            [{ provider: "sglang", apiKey: "k" }, true],
            [{ provider: "bedrock", apiKey: "k" }, false],
            [
                { provider: "bedrock", apiKey: "k", awsRegion: "us-east-1" },
                true,
            ],
            [
                {
                    provider: "bedrock",
                    awsAccessKeyId: "a",
                    awsRegion: "us-east-1",
                },
                false,
            ],
            [
                {
                    provider: "bedrock",
                    awsAccessKeyId: "a",
                    awsSecretAccessKey: "s",
                    awsRegion: "us-east-1",
                },
                true,
            ],
        ]
        for (const [p, expected] of cases) {
            expect([p, hasCredentials(provider(p))]).toEqual([p, expected])
        }
    })
})

describe("providerStatus", () => {
    const models = (...validated: (boolean | undefined)[]) =>
        validated.map((v, i) => ({
            id: `m${i}`,
            modelId: `m${i}`,
            validated: v,
        }))

    it("puts a failed model first", () => {
        expect(
            providerStatus(provider({ models: models(false, false, true) })),
        ).toEqual({ kind: "error", count: 2 })
        // Even without credentials
        expect(providerStatus(provider({ models: models(false) }))).toEqual({
            kind: "error",
            count: 1,
        })
    })

    it("then a missing key or no model", () => {
        expect(providerStatus(provider({ models: models(true) }))).toEqual({
            kind: "incomplete",
        })
        expect(providerStatus(provider({ apiKey: "k" }))).toEqual({
            kind: "incomplete",
        })
    })

    it("then untested models, else all working", () => {
        expect(
            providerStatus(
                provider({ apiKey: "k", models: models(true, undefined) }),
            ),
        ).toEqual({ kind: "untested", count: 1 })
        expect(
            providerStatus(
                provider({ apiKey: "k", models: models(true, true) }),
            ),
        ).toEqual({ kind: "ok", count: 2 })
    })
})

describe("openSettings", () => {
    it("opens the models tab's list unless a page is given", () => {
        const store = useUiStore.getState()
        store.openSettings("models", { providerId: "p1" })
        expect(useUiStore.getState().modelsPage).toEqual({ providerId: "p1" })
        store.setSettingsOpen(false)
        // Opened again some other way: back on the list, on the last tab
        store.setSettingsTab("drawing")
        store.openSettings()
        expect(useUiStore.getState()).toMatchObject({
            settingsOpen: true,
            settingsTab: "drawing",
            modelsPage: "list",
        })
        store.openSettings("models", "picker")
        expect(useUiStore.getState().modelsPage).toBe("picker")
    })
})
