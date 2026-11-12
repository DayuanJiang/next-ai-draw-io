import { describe, expect, it } from "vitest"
import {
    filterProviderGroups,
    hasCredentials,
    isValidBaseUrl,
    PROVIDER_GROUPS,
    providerStatus,
} from "@/lib/provider-setup"
import { PROVIDERS } from "@/lib/providers"
import {
    flattenModels,
    type ProviderConfig,
    providerLabel,
} from "@/lib/types/model-config"
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

    it("does not count a base URL that no request can go to", () => {
        for (const baseUrl of ["not a url", "127.0.0.1:7140/v1", "ftp://x"]) {
            expect([baseUrl, isValidBaseUrl(baseUrl)]).toEqual([baseUrl, false])
            // Required (custom), in place of the default (openai), optional
            // (ollama): typed in, it is where the requests would go
            for (const name of ["custom", "openai", "ollama"] as const) {
                expect(
                    hasCredentials(
                        provider({ provider: name, apiKey: "k", baseUrl }),
                    ),
                ).toBe(false)
            }
        }
        for (const baseUrl of [
            "http://127.0.0.1:7140/v1",
            "https://api.example.com/v1",
            " HTTPS://API.EXAMPLE.COM ",
        ]) {
            expect([baseUrl, isValidBaseUrl(baseUrl)]).toEqual([baseUrl, true])
        }
    })
})

describe("providerLabel", () => {
    const custom = (id: string, baseUrl: string, name?: string) =>
        provider({ id, provider: "custom", apiKey: "k", baseUrl, name })

    it("adds the host to providers that would show the same name", () => {
        const local = custom("a", "http://127.0.0.1:7140/v1")
        const gateway = custom("b", "https://llm.example.com/v1")
        const named = custom("c", "https://other.example.com/v1", "Work")
        const all = [local, gateway, named]
        expect(all.map((p) => providerLabel(p, all))).toEqual([
            "OpenAI-compatible (127.0.0.1:7140)",
            "OpenAI-compatible (llm.example.com)",
            "Work",
        ])
        // The model picker's groups carry the same names
        const config = {
            version: 1 as const,
            providers: all.map((p) => ({
                ...p,
                models: [{ id: `m-${p.id}`, modelId: "same-model" }],
            })),
        }
        expect(flattenModels(config).map((m) => m.providerLabel)).toEqual([
            "OpenAI-compatible (127.0.0.1:7140)",
            "OpenAI-compatible (llm.example.com)",
            "Work",
        ])
    })

    it("adds the path too where two providers share a host", () => {
        const teamA = custom("a", "https://gateway.example.com/team-a/v1")
        const teamB = custom("b", "https://gateway.example.com/team-b/v1/")
        const other = custom("c", "https://llm.example.com/v1")
        const all = [teamA, teamB, other]
        expect(all.map((p) => providerLabel(p, all))).toEqual([
            "OpenAI-compatible (gateway.example.com/team-a/v1)",
            "OpenAI-compatible (gateway.example.com/team-b/v1)",
            "OpenAI-compatible (llm.example.com)",
        ])
        // The model picker keeps them in two groups
        const config = {
            version: 1 as const,
            providers: [teamA, teamB].map((p) => ({
                ...p,
                models: [{ id: `m-${p.id}`, modelId: "same-model" }],
            })),
        }
        const labels = flattenModels(config).map((m) => m.providerLabel)
        expect(new Set(labels).size).toBe(2)
    })

    it("adds the host to two providers on one address when a third is elsewhere", () => {
        const first = custom("a", "http://127.0.0.1:7711/v1")
        const second = custom("b", "http://localhost:7711/v1")
        const third = custom("c", "http://localhost:7711/v1")
        const all = [first, second, third]
        expect(all.map((p) => providerLabel(p, all))).toEqual([
            "OpenAI-compatible (127.0.0.1:7711)",
            "OpenAI-compatible (localhost:7711)",
            "OpenAI-compatible (localhost:7711)",
        ])
        // Two keys on one path of a gateway, a third on another path
        const teamA = custom("d", "https://gateway.example.com/team-a/v1")
        const twin = custom("e", "https://gateway.example.com/team-a/v1")
        const teamB = custom("f", "https://gateway.example.com/team-b/v1")
        const gateway = [teamA, twin, teamB]
        expect(gateway.map((p) => providerLabel(p, gateway))).toEqual([
            "OpenAI-compatible (gateway.example.com/team-a/v1)",
            "OpenAI-compatible (gateway.example.com/team-a/v1)",
            "OpenAI-compatible (gateway.example.com/team-b/v1)",
        ])
    })

    it("leaves a name alone when it is the only one, or the host says nothing", () => {
        const local = custom("a", "http://127.0.0.1:7140/v1")
        expect(providerLabel(local, [local])).toBe("OpenAI-compatible")
        // Two keys for the same endpoint
        const twin = custom("b", "http://127.0.0.1:7140/v1")
        expect(providerLabel(local, [local, twin])).toBe("OpenAI-compatible")
        // No address yet
        const empty = custom("c", "")
        expect(providerLabel(empty, [local, empty])).toBe("OpenAI-compatible")
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
