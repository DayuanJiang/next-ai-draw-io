/**
 * The provider record (lib/providers.ts) replaces thirteen tables keyed by
 * provider name. This file freezes those tables' values as they were written
 * before the refactor and checks that the record derives the same values.
 * The fixture goes away once the derived tables have no readers left; the
 * last two tests stay.
 */
import { describe, expect, it, vi } from "vitest"
import { SINGLE_SYSTEM_PROVIDERS } from "@/lib/ai-providers"
import { i18n } from "@/lib/i18n/config"
import enDict from "@/lib/i18n/dictionaries/en.json"
import jaDict from "@/lib/i18n/dictionaries/ja.json"
import zhDict from "@/lib/i18n/dictionaries/zh.json"
import zhHantDict from "@/lib/i18n/dictionaries/zh-Hant.json"
import {
    OPTIONS_OPEN,
    POPULAR_PROVIDERS,
    PROVIDER_GROUPS,
} from "@/lib/provider-setup"
import { PROVIDER_NAMES, PROVIDERS, publicDefaultUrl } from "@/lib/providers"
import {
    chatRequestUrl,
    FIXED_CRED_PROVIDERS,
    PROVIDER_INFO,
    PROVIDER_LOGO_MAP,
    SUGGESTED_MODELS,
} from "@/lib/types/model-config"

vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => ({}),
    getEnvFallback: (key: string) => process.env[key] ?? null,
}))

// The tables as they were before lib/providers.ts existed
const fixture = {
    providerNames: [
        "openai",
        "anthropic",
        "google",
        "vertexai",
        "azure",
        "bedrock",
        "ollama",
        "openrouter",
        "aihubmix",
        "deepseek",
        "siliconflow",
        "sglang",
        "gateway",
        "edgeone",
        "doubao",
        "modelscope",
        "glm",
        "qwen",
        "qiniu",
        "kimi",
        "minimax",
        "novita",
        "mimo",
        "atlascloud",
    ],
    providerInfo: {
        openai: {
            label: "OpenAI",
            defaultBaseUrl: "https://api.openai.com/v1",
            apiKeyUrl: "https://platform.openai.com/api-keys",
            modelList: "openai",
        },
        anthropic: {
            label: "Anthropic",
            defaultBaseUrl: "https://api.anthropic.com/v1",
            apiKeyUrl: "https://platform.claude.com/settings/keys",
            modelList: "anthropic",
        },
        google: {
            label: "Google",
            defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
            apiKeyUrl: "https://aistudio.google.com/apikey",
            modelList: "google",
        },
        vertexai: { label: "Google Vertex AI" },
        azure: {
            label: "Azure OpenAI",
            defaultBaseUrl: "https://your-resource.openai.azure.com/openai",
        },
        bedrock: { label: "Amazon Bedrock" },
        ollama: {
            label: "Ollama",
            defaultBaseUrl: "https://ollama.com/api",
            apiKeyUrl: "https://ollama.com/settings/keys",
            modelList: "ollama",
        },
        openrouter: {
            label: "OpenRouter",
            defaultBaseUrl: "https://openrouter.ai/api/v1",
            apiKeyUrl: "https://openrouter.ai/keys",
            modelList: "openrouter",
        },
        aihubmix: {
            label: "AIHubMix",
            defaultBaseUrl: "https://aihubmix.com/v1",
            apiKeyUrl: "https://aihubmix.com/token",
            modelList: "aihubmix",
        },
        deepseek: {
            label: "DeepSeek",
            defaultBaseUrl: "https://api.deepseek.com/v1",
            apiKeyUrl: "https://platform.deepseek.com/api_keys",
            modelList: "openai",
        },
        siliconflow: {
            label: "SiliconFlow",
            defaultBaseUrl: "https://api.siliconflow.cn/v1",
            apiKeyUrl: "https://cloud.siliconflow.cn/account/ak",
            modelList: "openai",
        },
        sglang: {
            label: "SGLang",
            defaultBaseUrl: "http://127.0.0.1:8000/v1",
            modelList: "openai",
        },
        gateway: {
            label: "AI Gateway",
            defaultBaseUrl: "https://ai-gateway.vercel.sh/v1/ai",
            apiKeyUrl: "https://vercel.com/ai-gateway",
            modelList: "gateway",
        },
        edgeone: { label: "EdgeOne Pages" },
        doubao: {
            label: "Doubao (ByteDance)",
            defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
            apiKeyUrl:
                "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
        },
        modelscope: {
            label: "ModelScope",
            defaultBaseUrl: "https://api-inference.modelscope.cn/v1",
            apiKeyUrl: "https://modelscope.cn/my/myaccesstoken",
            modelList: "openai",
        },
        glm: {
            label: "GLM (Zhipu)",
            defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
            apiKeyUrl: "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys",
            modelList: "openai",
        },
        qwen: {
            label: "Qwen (Alibaba)",
            defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            apiKeyUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
            modelList: "openai",
        },
        qiniu: {
            label: "Qiniu",
            defaultBaseUrl: "https://api.qnaigc.com/v1",
            apiKeyUrl: "https://www.qiniu.com/ai/models",
            modelList: "openai",
        },
        kimi: {
            label: "Kimi (Moonshot)",
            defaultBaseUrl: "https://api.moonshot.cn/v1",
            apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
            modelList: "openai",
        },
        minimax: {
            label: "MiniMax",
            defaultBaseUrl: "https://api.minimaxi.com/anthropic",
            apiKeyUrl:
                "https://platform.minimaxi.com/user-center/basic-information/interface-key",
        },
        novita: {
            label: "Novita AI",
            defaultBaseUrl: "https://api.novita.ai/openai",
            apiKeyUrl: "https://novita.ai/dashboard/key",
            modelList: "openai",
        },
        mimo: {
            label: "MiMo (Xiaomi)",
            defaultBaseUrl: "https://api.xiaomimimo.com/v1",
            apiKeyUrl: "https://platform.xiaomimimo.com/#/console/api-keys",
            modelList: "openai",
        },
        atlascloud: {
            label: "Atlas Cloud",
            defaultBaseUrl: "https://api.atlascloud.ai/v1",
            apiKeyUrl: "https://www.atlascloud.ai/console/api-keys",
            modelList: "openai",
        },
    } as Record<
        string,
        {
            label: string
            defaultBaseUrl?: string
            apiKeyUrl?: string
            modelList?: string
        }
    >,
    fixedCredProviders: ["bedrock", "vertexai", "ollama"],
    providerLogoMap: {
        openai: "openai",
        anthropic: "anthropic",
        google: "google",
        azure: "azure",
        bedrock: "amazon-bedrock",
        openrouter: "openrouter",
        aihubmix: "aihubmix",
        deepseek: "deepseek",
        siliconflow: "siliconflow",
        sglang: "openai",
        gateway: "vercel",
        edgeone: "tencent-cloud",
        vertexai: "google",
        doubao: "bytedance",
        modelscope: "modelscope",
        minimax: "minimax",
        novita: "novita",
        mimo: "xiaomi",
        atlascloud: "openai",
    } as Record<string, string>,
    ownPaths: [
        "google",
        "vertexai",
        "azure",
        "bedrock",
        "gateway",
        "minimax",
        "edgeone",
    ],
    singleSystemProviders: [
        "minimax",
        "glm",
        "qwen",
        "kimi",
        "qiniu",
        "novita",
        "mimo",
    ],
    providerEnvVars: {
        bedrock: null,
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        google: "GOOGLE_GENERATIVE_AI_API_KEY",
        vertexai: "GOOGLE_VERTEX_API_KEY",
        azure: "AZURE_API_KEY",
        ollama: null,
        openrouter: "OPENROUTER_API_KEY",
        aihubmix: "AIHUBMIX_API_KEY",
        deepseek: "DEEPSEEK_API_KEY",
        siliconflow: "SILICONFLOW_API_KEY",
        sglang: "SGLANG_API_KEY",
        gateway: "AI_GATEWAY_API_KEY",
        edgeone: null,
        doubao: "DOUBAO_API_KEY",
        modelscope: "MODELSCOPE_API_KEY",
        glm: "GLM_API_KEY",
        qwen: "QWEN_API_KEY",
        qiniu: "QINIU_API_KEY",
        kimi: "KIMI_API_KEY",
        minimax: "MINIMAX_API_KEY",
        novita: "NOVITA_API_KEY",
        mimo: "MIMO_API_KEY",
        atlascloud: "ATLASCLOUD_API_KEY",
    } as Record<string, string | null>,
    sdkKnowsEndpoint: [
        "openai",
        "google",
        "azure",
        "openrouter",
        "gateway",
        "deepseek",
    ],
    providerGroups: [
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
        { id: "cloud", providers: ["bedrock", "vertexai", "azure", "edgeone"] },
        { id: "selfHosted", providers: ["ollama", "sglang"] },
    ],
    popularProviders: [
        "openai",
        "anthropic",
        "google",
        "deepseek",
        "openrouter",
        "qwen",
    ],
    providerNoteKeys: {
        bedrock: "noteBedrock",
        vertexai: "noteVertex",
        azure: "noteAzure",
        edgeone: "noteEdgeone",
        ollama: "noteOllama",
        sglang: "noteSglang",
    } as Record<string, string>,
    baseUrlHintKeys: {
        minimax: "minimaxBaseUrlHint",
        mimo: "mimoBaseUrlHint",
    } as Record<string, string>,
    optionsOpen: ["azure", "ollama", "sglang", "minimax", "mimo"],
    noKeyNeeded: ["ollama", "openrouter", "aihubmix"],
}

const sorted = (list: Iterable<string>) => [...list].sort()

describe("the provider record derives the old tables", () => {
    it("names the same providers", () => {
        expect(sorted(PROVIDER_NAMES)).toEqual(sorted(fixture.providerNames))
        expect(PROVIDER_INFO).toBe(PROVIDERS)
    })

    it("PROVIDER_INFO: label, defaultBaseUrl, apiKeyUrl and modelList", () => {
        for (const p of PROVIDER_NAMES) {
            const { label, defaultBaseUrl, apiKeyUrl, modelList } = PROVIDERS[p]
            expect([
                p,
                { label, defaultBaseUrl, apiKeyUrl, modelList },
            ]).toEqual([p, { ...fixture.providerInfo[p] }])
        }
    })

    it("FIXED_CRED_PROVIDERS", () => {
        expect(FIXED_CRED_PROVIDERS).toEqual(fixture.fixedCredProviders)
    })

    it("PROVIDER_LOGO_MAP, as its reader resolves it", () => {
        for (const p of PROVIDER_NAMES) {
            expect([p, PROVIDER_LOGO_MAP[p] || p]).toEqual([
                p,
                fixture.providerLogoMap[p] || p,
            ])
            expect([p, PROVIDERS[p].logo ?? p]).toEqual([
                p,
                fixture.providerLogoMap[p] || p,
            ])
        }
    })

    it("chatRequestUrl's ownPaths", () => {
        const own = PROVIDER_NAMES.filter(
            (p) => chatRequestUrl(p, "https://x.example/v1") === null,
        )
        expect(sorted(own)).toEqual(sorted(fixture.ownPaths))
    })

    it("SINGLE_SYSTEM_PROVIDERS", () => {
        expect(sorted(SINGLE_SYSTEM_PROVIDERS)).toEqual(
            sorted(fixture.singleSystemProviders),
        )
    })

    it("PROVIDER_ENV_VARS: the key variable each provider must have", () => {
        for (const p of PROVIDER_NAMES) {
            const { credential, envPrefix, keyEnv } = PROVIDERS[p]
            const required =
                credential === "apiKey" || credential === "vertexKey"
            const derived = required ? (keyEnv ?? `${envPrefix}_API_KEY`) : null
            expect([p, derived]).toEqual([p, fixture.providerEnvVars[p]])
        }
    })

    it("SDK_KNOWS_ENDPOINT", () => {
        const derived = PROVIDER_NAMES.filter(
            (p) => PROVIDERS[p].sdkKnowsEndpoint,
        )
        expect(sorted(derived)).toEqual(sorted(fixture.sdkKnowsEndpoint))
    })

    it("PROVIDER_GROUPS, in the picker's order", () => {
        expect(PROVIDER_GROUPS).toEqual(fixture.providerGroups)
    })

    it("POPULAR_PROVIDERS", () => {
        expect(POPULAR_PROVIDERS).toEqual(fixture.popularProviders)
    })

    it("OPTIONS_OPEN", () => {
        expect(sorted(OPTIONS_OPEN)).toEqual(sorted(fixture.optionsOpen))
    })

    it("NO_KEY_NEEDED", () => {
        const derived = PROVIDER_NAMES.filter(
            (p) => PROVIDERS[p].listNeedsNoKey,
        )
        expect(sorted(derived)).toEqual(sorted(fixture.noKeyNeeded))
    })

    it("the picker notes and base URL hints, word for word in every language", () => {
        const dicts: Record<string, Record<string, string>> = {
            en: enDict.modelConfig,
            zh: zhDict.modelConfig,
            ja: jaDict.modelConfig,
            "zh-Hant": zhHantDict.modelConfig,
        }
        const noted = PROVIDER_NAMES.filter((p) => PROVIDERS[p].note)
        expect(sorted(noted)).toEqual(
            sorted(Object.keys(fixture.providerNoteKeys)),
        )
        for (const p of noted) {
            for (const [lang, dict] of Object.entries(dicts)) {
                expect([p, lang, PROVIDERS[p].note?.[lang as never]]).toEqual([
                    p,
                    lang,
                    dict[fixture.providerNoteKeys[p]],
                ])
            }
        }
        const hinted = PROVIDER_NAMES.filter((p) => PROVIDERS[p].baseUrlHint)
        expect(sorted(hinted)).toEqual(
            sorted(Object.keys(fixture.baseUrlHintKeys)),
        )
        for (const p of hinted) {
            for (const [lang, dict] of Object.entries(dicts)) {
                expect([
                    p,
                    lang,
                    PROVIDERS[p].baseUrlHint?.[lang as never],
                ]).toEqual([p, lang, dict[fixture.baseUrlHintKeys[p]]])
            }
        }
    })

    it("the model lists of the providers that cannot list models", () => {
        for (const p of PROVIDER_NAMES) {
            const { modelList, models } = PROVIDERS[p]
            if (modelList) {
                expect([p, models]).toEqual([p, undefined])
            } else {
                expect([p, models]).toEqual([p, SUGGESTED_MODELS[p]])
            }
        }
    })
})

describe("the provider record's own rules", () => {
    it("has 21 providers taking part in server key auto-detection", () => {
        // credential apiKey or vertexKey: the providers whose <P>_API_KEY the
        // server must have; aws, optionalKey and none need no key
        const detected = PROVIDER_NAMES.filter((p) =>
            ["apiKey", "vertexKey"].includes(PROVIDERS[p].credential),
        )
        expect(detected).toHaveLength(21)
        expect(sorted(detected)).toEqual(
            sorted(
                Object.entries(fixture.providerEnvVars)
                    .filter(([, v]) => v)
                    .map(([p]) => p),
            ),
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

    it("gives the no-key and fixed-credential providers no key variable to detect", () => {
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
})
