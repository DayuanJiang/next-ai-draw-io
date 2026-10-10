# AI provider 层重构方案

本文基于 2026-10-11 对提交 2418c47 的代码阅读写成，文中所有文件行号都在该提交上核对过。三份从不同角度写的草稿经过对照和核实后合并为本文，取舍记录在文末的"评审记录"。

术语约定，首次出现时解释，之后直接使用：

- "provider"指一个模型服务商的接入配置，例如 OpenAI、Qiniu、Amazon Bedrock。
- "AI SDK"指 Vercel 的 `ai` 包和各家 `@ai-sdk/*` 工厂函数（createOpenAI、createAnthropic 等）。"provider 层"指把（provider 名、模型 id、凭据、base URL）变成 AI SDK 的 LanguageModel 对象、并向界面描述每个 provider 的那部分代码。
- "OpenAI 兼容服务商"指只提供与 OpenAI `/v1/chat/completions` 相同接口的服务商，走 `@ai-sdk/openai-compatible`。
- "凭据来源"指一次请求最终用谁的 API key：客户端随请求送来的（用户自己的），还是服务器环境变量里的（部署者付费）。
- "服务器模型"指管理员在 ai-models.json、AI_MODELS_CONFIG 或管理面板里配置、由服务器 key 付费、供所有用户使用的模型。它们通过 apiKeyEnv 和 baseUrlEnv 两个字段指向环境变量名。
- "管理面板"指 app/[lang]/admin 下的页面，它把 provider 条目存进 settings.json，并把凭据写进 `ADMIN_<PROVIDER>_API_KEY[_n]` / `ADMIN_<PROVIDER>_BASE_URL[_n]` 环境变量。

## 1. 背景与目标

### 1.1 现状的问题（已逐条核对）

**"用谁的 key、发到哪个 URL"这一个问题由多个函数各自推导，靠人手保持一致。** 相关函数如下：

| 函数 | 位置 | 回答的问题 |
|---|---|---|
| resolveBaseURL | lib/ai-providers.ts:135 | 有用户 key 时只许用户 URL 或官方 URL |
| resolveApiKey | lib/ai-providers.ts:160 | 用户 key，否则 apiKeyEnv，否则默认变量 |
| resolveBaseUrlEnv | lib/ai-providers.ts:196 | baseUrlEnv，否则默认变量 |
| detectProvider | lib/ai-providers.ts:532 | 服务器配了哪些 provider 的 key（Anthropic 和 Azure 各有特例） |
| validateProviderCredentials | lib/ai-providers.ts:574 | 服务器 key 是否齐全（Anthropic 和 Azure 的特例再写一遍） |
| getAIModel 的五个分支 | lib/ai-providers.ts:909 到 1121 | bedrock、vertexai、ollama、edgeone、default 各自算一遍 key 和 URL |
| globalBaseUrl | lib/ai-providers.ts:1147 | 服务器自己的 URL，供管理面板的 Test 按钮用 |
| getServerProvider | lib/ai-providers.ts:1171 | AI_PROVIDER，否则自动检测 |
| usesServerEndpoint | lib/ai-providers.ts:1182 | 请求是否落在部署自己的网络上（配额） |
| usesServerCredentials | lib/ai-providers.ts:1202 | 是否由服务器 key 付费（配额和白名单） |
| listFallbackUrl | lib/provider-models.ts:138 | 列模型时没有用户 URL 该去哪 |

其中 usesServerCredentials 的注释写着 "Mirrors which key each branch of getAIModel ends up using"（第 1199 行），说明它必须和 getAIModel 的分支手工对齐，没有机制保证。环境变量名的拼法 `provider === "gateway" ? "AI_GATEWAY_BASE_URL" : \`${provider.toUpperCase()}_BASE_URL\`` 在 lib/ai-providers.ts:1073、lib/ai-providers.ts:1164 和 lib/admin/providers.ts:92 出现三次。Anthropic 接受 ANTHROPIC_AUTH_TOKEN、Azure 还需要 URL 或资源名这两条规则，在 detectProvider 和 validateProviderCredentials 里各写一遍。

核对后要指出，这十一个函数并不都在回答同一个问题。真正按请求推导"用谁的 key、去哪个 URL"的是 getAIModel 的五个分支和 usesServerCredentials；detectProvider 和 validateProviderCredentials 回答"服务器环境配齐了没有"；getServerProvider 回答"用哪家"；usesServerEndpoint 回答"请求落在谁的网络"；listFallbackUrl 的规则与请求不同（列模型永远不用服务器 key）。本方案按这个区分处理：按请求推导的部分合并为一个函数，其余函数改为读统一的数据，但保留各自的职责。

**同一个 provider 的事实散在十三张以 provider 名为键的表里，分布在五个文件。**

| 表 | 位置 | 内容 |
|---|---|---|
| ProviderName 联合类型 | lib/types/model-config.ts:3 | 24 个名字 |
| PROVIDER_INFO | lib/types/model-config.ts:140 | label、defaultBaseUrl、apiKeyUrl、modelList |
| FIXED_CRED_PROVIDERS | lib/types/model-config.ts:98 | bedrock、vertexai、ollama |
| PROVIDER_LOGO_MAP | lib/types/model-config.ts:105 | models.dev 的 logo 名 |
| SUGGESTED_MODELS | lib/types/model-config.ts:278 到 537 | 手工维护的推荐模型 id，约 260 行 |
| chatRequestUrl 内的 ownPaths | lib/types/model-config.ts:647 | SDK 自己拼请求路径的 7 家 |
| SINGLE_SYSTEM_PROVIDERS | lib/ai-providers.ts:45 | 只接受一条 system 消息的 7 家 |
| PROVIDER_ENV_VARS | lib/ai-providers.ts:501 | 每家 API key 的环境变量名 |
| SDK_KNOWS_ENDPOINT | lib/ai-providers.ts:648 | SDK 内置官方地址的 6 家 |
| PROVIDER_GROUPS | lib/provider-setup.ts:13 | 选择器的四个分组及组内顺序 |
| POPULAR_PROVIDERS | lib/provider-setup.ts:50 | 空状态时推荐的 6 家 |
| PROVIDER_NOTE_KEYS | lib/provider-setup.ts:60 | 选择器里的提示文案 key |
| OPTIONS_OPEN | lib/provider-setup.ts:74 | 默认展开高级选项的 5 家 |
| NO_KEY_NEEDED | app/api/provider-models/route.ts:20 | 列模型不需要 key 的 3 家 |

此外还有两张表在先前分析没有列出的地方：electron/main/config-manager.ts:394 的 PROVIDER_ENV_MAP（桌面版预设把通用的 AI_API_KEY 映射到各家变量名，只覆盖 11 家，少了 vertexai、edgeone、aihubmix、sglang、doubao、glm、qwen、qiniu、kimi、minimax、novita、mimo、atlascloud 这 13 家），以及 scripts/update-model-catalog.mjs:8 的 PROVIDERS（本项目 provider 名到 models.dev provider id 的映射，21 项）。这两张表分别运行在 Electron 主进程和一个独立的 node 脚本里，本方案把它们列为待决问题。

**加一个 provider 要改多处。** 提交 c8463ae（Atlas Cloud，纯 OpenAI 兼容）改了 lib/ai-providers.ts 3 处、lib/types/model-config.ts 2 处、app/api/validate-model/route.ts 1 处注释、env.example，加两个测试文件。提交 4984be8（MiMo）改了 12 个文件，其中 4 个 i18n 字典、3 个文档和 components/provider-credentials-fields.tsx 是为了一条 base URL 提示。需要说明的是，c8463ae 当时 validate-model 路由和 getAIModel 里还各有一个按 provider 名的 switch，提交 0b63e28 之后它们已经合并进 createModel 的 default 分支，所以今天的起点比当时好一些：一个纯 OpenAI 兼容服务商最少改 3 个代码文件 5 到 7 处。

**createModel 的 switch 按 24 个 provider 名分支，实际只有 14 种做法。** lib/ai-providers.ts:694 到 791 里，kimi、mimo 和 deepseek 共用 createDeepSeek；siliconflow、sglang、modelscope、glm、qwen、qiniu、novita、atlascloud、edgeone 九家全部落到 default 的 compatibleModel。Bedrock、Vertex、Ollama、EdgeOne 四家在 getAIModel 的第二个 switch（909 到 1121 行）里另有分支。要知道一个 provider 走哪条路，必须读完两个 switch。

**provider 名分支散落在层外。** 核对结果：components/provider-credentials-fields.tsx 11 处、lib/admin/providers.ts 8 处、lib/provider-models.ts 6 处、app/api/validate-model/route.ts 5 处（82、106、119、129、194 行）、lib/provider-setup.ts 5 处、components/model-config-dialog.tsx 5 处、components/provider-logo.tsx 3 处、app/api/chat/route.ts 3 处、lib/types/model-config.ts 2 处。这些分支问的几乎都是能力问题（"要不要 key""凭据是 AWS 形式还是单个 key""能不能列模型"），回答方式却是列举 provider 名。

**reasoning 判定靠模型名正则，模型目录闲置。** buildProviderOptions（lib/ai-providers.ts:266 到 499，234 行）用 `/^(o\d|gpt-([5-9]|[1-9]\d))/` 和 `modelId.includes("gemini-2")` 等判断是否开思维链。lib/model-catalog.json 有 21 个 provider 共 1638 个模型，其中 1182 个带 reasoning 标记，969 个带 images 标记，但 buildProviderOptions 不读它。第 3.7 节给出两者的实际对比数据，结论与先前分析的倾向有出入。

**规模。** lib/ai-providers.ts 1290 行，lib/types/model-config.ts 657 行，lib/provider-setup.ts 138 行，lib/provider-models.ts 259 行，lib/admin/providers.ts 315 行。

### 1.2 "完成"的样子（可度量）

1. 新增一个 OpenAI 兼容服务商：代码只改 1 个文件 1 处（lib/providers.ts 加一个对象字面量，约 10 行）；可选再在 lib/suggested-models.ts 加一行推荐模型；env.example 和 docs/{cn,en,ja}/ai-providers.md 照常各加一段。今天是 3 个代码文件 5 到 7 处。
2. 应用代码里以 provider 名为键的表从 13 张降到 3 张：PROVIDERS（唯一的事实来源）、SUGGESTED_MODELS（手工精选，理由见 3.7）、POPULAR_PROVIDERS（6 家的有序列表，是界面决定）。脚本和 Electron 的两张表是否并入见待决问题。
3. 按请求推导"用谁的 key、去哪个 URL"的代码从 getAIModel 的五个分支加 usesServerCredentials 的镜像，变为一个纯函数 resolveEndpoint；环境变量名的拼法只在 envVarsOf 一处；"服务器配齐了没有"的判断只在 hasServerCredentials 一处。usesServerCredentials 的"Mirrors…"注释随之删除。
4. createModel 按 SDK 种类分支，default 不再列 provider 名；getAIModel 的第二个 switch 消失。
5. 界面组件和 validate-model 路由里的凭据相关分支改读记录字段。保留按名字写的只有三类安全或部署逻辑：getAIModel 顶部的 guard、usesServerEndpoint、chat 和 validate-model 路由里 EdgeOne 的站点端点判断（理由见 3.4）。
6. 行数：lib/ai-providers.ts 从 1290 降到约 1150；lib/types/model-config.ts 从 657 降到约 200；新增 lib/providers.ts 约 370 行、lib/suggested-models.ts 约 265 行。整层总行数大致持平。这个数字要如实说明：本方案的收益在"每个事实只写一处"和"加 provider 的改动面"，而在行数上收益很小。
7. 现有 145 个相关单元测试（11 个文件，本文写作时全部通过）和 tests/e2e/provider-models.spec.ts 的 20 个用例全程保持通过，断言不改；新增一份行为快照测试，证明每一步前后 getAIModel 送给 SDK 工厂的参数、usesServerCredentials、usesServerEndpoint、globalBaseUrl 和 chatRequestUrl 的答案逐一相同。

## 2. 非目标与必须保持不变的行为

### 2.1 非目标

- 换掉 Vercel AI SDK，或自己实现协议转换。magpie（参考的第三方 Go 网关）的协议翻译、路由分组和账号管理与本项目无关，AI SDK 已经做了协议处理。
- 改动管理面板把凭据写进 `ADMIN_<PROVIDER>_API_KEY[_n]` / `ADMIN_<PROVIDER>_BASE_URL[_n]` 的机制（lib/admin/providers.ts:84 credEnvNames，:232 deriveEnvUpdates，:284 derivedEnvKeys）。它能用、有 35 个测试、所有者要求保留。本方案只让 credEnvNames 从统一记录读前缀和"固定凭据"标记，deriveEnvUpdates 里 bedrock、vertexai、ollama 三家写固定变量名的分支原样保留。
- 改 lib/ssrf-protection.ts。
- 改 Electron 主进程（electron/ 目录用 esbuild 单独打包，见 package.json 的 electron:compile）。
- 改 buildProviderOptions 读取的环境变量名、默认值和正则（第 3.7 节解释为什么维持现状）。
- 在界面上增删 provider，或改变 provider 选择器的分组。
- 合并七个 URL 帮助函数（normalizeBaseUrl、ollamaApiUrl、chatRequestUrl、normalizeMiniMaxBaseURL、isAihubmixStandardBaseURL、bedrockRuntimeUrl、edgeOneEndpoint）。每个函数负责一件事且有测试，合并只会产生一个更难读的函数。chatRequestUrl 内部的 ownPaths 列表改读记录字段，函数本身保留。

### 2.2 必须保持的规则

每条写明今天实现它的位置，以及方案如何保住它。"快照"指第 4 节第 0 步建立的行为快照测试。

| 规则 | 今天的实现 | 方案如何保住 |
|---|---|---|
| 用户自己的 key 永远不发到服务器配置的 base URL；用户 key 只去用户自己的 URL 或服务商官方 URL | resolveBaseURL（lib/ai-providers.ts:135）；Vertex 分支在 :1013 调用它；Ollama 分支在 :1040 到 1046 单独写了一遍 | resolveBaseURL 原样保留，其 15 个单元测试不改，resolveEndpoint 内部调用它。Ollama 的规则作为 resolveEndpoint 里唯一按名字写的分支逐字搬入。快照里每个 provider 都有"用户 key 加服务器 URL 变量"场景 |
| 客户端自定 base URL 必须带客户端自己的 key，例外：EdgeOne、没有服务器 OLLAMA_API_KEY 时的 Ollama、带 vertexApiKey 的 Vertex、trustedBaseUrl | getAIModel 顶部的 guard（lib/ai-providers.ts:801 到 821） | 原样保留，仍按名字写出三个例外。这是安全代码，三个名字显式列出比读标志位更容易审计。快照里有"仅 URL 无 key"场景，所有 provider 都应抛同一条错误 |
| 发往客户端选择的 URL 的请求用 redirectGuardedFetch；chat 和 validate-model 路由拒绝私网地址，除非 ALLOW_PRIVATE_URLS 允许；管理面板自己的服务器 URL 受信任（trustedBaseUrl） | lib/ai-providers.ts:904 到 907 guardedFetch；app/api/chat/route.ts:208；app/api/validate-model/route.ts:86 到 103 | guardedFetch 的构造条件搬进 resolveEndpoint 的 guarded 字段，条件逐字不变（有客户端 URL 且非 trusted）。两个路由的私网检查不动。快照记录每个场景 fetch 是否被守卫 |
| Bedrock：客户端 region 必须匹配 `/^[a-z]{2,4}(-[a-z]+)+-\d{1,2}$/`；客户端凭据时传 apiKey:"" 和显式 baseURL，使 SDK 不读服务器的 AWS_BEARER_TOKEN_BEDROCK 和 endpoint 环境变量；管理面板的 key 在 ADMIN_AWS_* | lib/ai-providers.ts:909 到 999，bedrockRuntimeUrl :630 | 整个分支逐字搬进函数 bedrockModel()，四个 createAmazonBedrock 调用的参数一个字不变。resolveEndpoint 对 Bedrock 只回答 keySource。tests/unit/ai-providers-credentials.test.ts 的 7 个 Bedrock 用例是门禁 |
| usesServerCredentials 和 usesServerEndpoint 决定配额计数与服务器模型白名单，对每个输入的答案必须不变 | lib/ai-providers.ts:1202 和 :1182；调用方 app/api/chat/route.ts:266、:292，app/api/validate-model/route.ts:138、:160 | usesServerEndpoint 不动。usesServerCredentials 保留签名，函数体改为读 resolveEndpoint 的 keySource。第 0 步把两个函数的现有函数体原文复制进测试文件，对全部有限输入域逐项断言新旧相等（第 5.1 节），这份差分测试在重构完成后仍保留 |
| 服务器凭据只在客户端没带自己的凭据时校验；ANTHROPIC_AUTH_TOKEN 可替代 ANTHROPIC_API_KEY；Azure 需要 AZURE_BASE_URL 或 AZURE_RESOURCE_NAME，或服务器模型自己的 baseUrlEnv | isClientOverride（:824）；validateProviderCredentials（:574）；detectProvider（:532） | 两个函数改为共用 hasServerCredentials，它读记录上的 keyEnv、altKeyEnv、resourceNameEnv 字段。三段错误文案逐字保留，快照包含"无客户端 key 且服务器缺变量"场景的错误文本 |
| 服务器模型的 apiKeyEnv 可以是数组，随机选一个有值的 | resolveApiKey（:160 到 194） | 逐字搬入 resolveEndpoint 内部；快照测试里把 Math.random 固定为 0 |
| OpenAI 官方 URL 走 Responses API，任何配置过的 base URL 走 Chat Completions | createModel openai 分支（:704 到 712）读 configuredBaseURL | resolveEndpoint 返回 configuredBaseURL，含义不变（URL 来自客户端或服务器变量时为真）。快照记录 openai 走的是 chat 还是 responses |
| 带用户 key 的 OpenAI 显式传官方 URL（避开服务器 OPENAI_BASE_URL）；带用户 key 的 Azure 必须有 URL（避开服务器 AZURE_RESOURCE_NAME）；SGLang 的 127.0.0.1 默认值只填表单，服务器不会主动调用 | getAIModel default 分支 :1076 到 1102 | 规则逐字进入 resolveEndpoint，sdkKnowsEndpoint 成为记录字段。现有用例"sends a user's OpenAI key to the official endpoint""needs a base URL with a user's Azure key""needs a base URL for SGLang instead of using 127.0.0.1"不改 |
| SINGLE_SYSTEM_PROVIDERS 的 provider 和带自定 URL 的 openai 合并 system 消息 | lib/ai-providers.ts:45；app/api/chat/route.ts:507 到 515 | 成为记录字段 singleSystem；SINGLE_SYSTEM_PROVIDERS 保留为派生常量，chat 路由这段不改 |
| 管理面板：Bedrock、Vertex、Ollama 只能各有一条，凭据写固定环境变量；gateway 的前缀是 AI_GATEWAY | FIXED_CRED_PROVIDERS（lib/types/model-config.ts:98）；lib/admin/providers.ts:88、:92、:173、:246 到 262、:294 到 310 | 成为记录字段 fixedCredentials 和 envPrefix；FIXED_CRED_PROVIDERS 保留为派生常量。新增测试断言 24 家的 credEnvNames 输出与改动前逐字相同 |
| 部署目标都要能用：Vercel、Cloudflare（open-next）、EdgeOne Pages（edgeone 用站点自己的 /api/edgeai 函数和 cookie）、Docker、Electron（NEXT_AI_DRAWIO_DESKTOP=1 时所有 key 都是用户的） | edgeOneEndpoint（:1133）；chat 路由 :196 到 203；edgeone 分支 :1054 到 1062；两个 uses* 函数开头的 desktop 判断 | 新文件 lib/providers.ts 是纯数据，没有任何 import，可被客户端组件、Edge runtime 和 Node runtime 同时引用。EdgeOne 的站点端点判断留在路由层。desktop 判断留在两个函数开头并进快照 |
| 列模型时只用客户端的 key；没有用户 URL 时去官方 URL，Ollama 无 key 时去服务器的 Ollama；SGLang 的本地默认值不作为列表地址 | lib/provider-models.ts:138 listFallbackUrl 及 :158 注释 | 函数保留，`startsWith("https://")` 的判断改为调用新的 publicDefaultUrl(provider) 帮助函数（getAIModel 共用）。tests/unit/provider-models.test.ts 的 19 个用例不改 |
| env.example、三语文档、四份 i18n 字典里的服务商文案 | 文件本身 | 现有内容不改；新增 custom 预设时各加一段。tests/unit/provider-setup.test.ts 的"have their notes in every language"继续检查每个 noteKey 在四种语言都有 |

## 3. 目标设计

### 3.1 数据模型：一条 provider 记录

新文件 lib/providers.ts，只含类型和数据，没有任何 import。ModelListStyle 类型从 lib/types/model-config.ts 搬过来。

```ts
// lib/providers.ts: pure data, no imports, safe for client components and every runtime

/** Which AI SDK factory createModel() calls */
export type Sdk =
    | "openai"            // @ai-sdk/openai: Responses API, Chat Completions behind a configured URL
    | "openai-compatible" // @ai-sdk/openai-compatible plus <think> tag extraction
    | "deepseek"          // @ai-sdk/deepseek: reasoning_content round trip (deepseek, kimi, mimo)
    | "doubao"            // deepseek for DeepSeek and Kimi model ids, openai-compatible otherwise
    | "anthropic"
    | "minimax"           // anthropic or openai-compatible, chosen from the URL path
    | "google"
    | "vertex"
    | "azure"
    | "bedrock"
    | "openrouter"
    | "gateway"
    | "aihubmix"          // @aihubmix/ai-sdk-provider on the official URL, openai-compatible elsewhere
    | "ollama"

/** What the settings form asks for and what a request signs in with */
export type Credential =
    | "apiKey"      // one key, required with a custom base URL
    | "optionalKey" // Ollama: the key may be empty
    | "none"        // EdgeOne: the site's own function, cookies authenticate
    | "aws"         // Bedrock: a Bedrock API key, or an access key pair, plus a region
    | "vertexKey"   // Vertex AI Express Mode key

export type ModelListStyle =
    | "openai" | "anthropic" | "google" | "ollama" | "openrouter" | "aihubmix" | "gateway"

export type ProviderGroup = "vendors" | "aggregators" | "cloud" | "selfHosted"

export interface ProviderDef {
    label: string
    sdk: Sdk
    credential: Credential
    /** The picker's group; the order of keys in PROVIDERS is the order inside a group */
    group: ProviderGroup
    /**
     * <PREFIX>_API_KEY and <PREFIX>_BASE_URL on the server; the admin panel
     * writes ADMIN_<PREFIX>_API_KEY[_n]. null: no key variables (Bedrock, EdgeOne)
     */
    envPrefix: string | null
    /** The key variable when it does not follow the prefix (GOOGLE_GENERATIVE_AI_API_KEY) */
    keyEnv?: string
    /** A second variable accepted as the server key (ANTHROPIC_AUTH_TOKEN, sent as Bearer) */
    altKeyEnv?: string
    /** Azure: the SDK builds the URL from this variable when there is no base URL */
    resourceNameEnv?: string
    /**
     * The official endpoint, also the form's placeholder. A non-https value
     * (SGLang's 127.0.0.1) only fills the form: the server never calls it
     */
    defaultBaseUrl?: string
    /** The SDK has the official endpoint built in: pass no baseURL unless one is configured */
    sdkKnowsEndpoint?: true
    /** Where users create a key */
    apiKeyUrl?: string
    /** How to list models; missing when a key alone cannot (Bedrock, Vertex, Azure) */
    modelList?: ModelListStyle
    /** The list is public or local: no key needed to list (Ollama, OpenRouter, AIHubMix) */
    listNeedsNoKey?: true
    /** The SDK builds the request path itself, so chatRequestUrl shows nothing */
    ownRequestPath?: true
    /** Only one system message per request */
    singleSystem?: true
    /** Server credentials live in fixed env vars; the admin panel allows one entry */
    fixedCredentials?: true
    /** models.dev logo name when it differs from the key */
    logo?: string
    /** A Lucide icon for providers without a logo on models.dev */
    icon?: "cloud" | "server" | "sparkles"
    /** i18n key under modelConfig: the note shown in the picker (noteBedrock) */
    noteKey?: string
    /** i18n key under modelConfig: a hint under the base URL field (minimaxBaseUrlHint) */
    baseUrlHintKey?: string
    /** The folded options start open: the base URL usually needs changing */
    optionsOpen?: true
}

export const PROVIDERS = {
    openai: {
        label: "OpenAI",
        sdk: "openai",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "OPENAI",
        defaultBaseUrl: "https://api.openai.com/v1",
        sdkKnowsEndpoint: true,
        apiKeyUrl: "https://platform.openai.com/api-keys",
        modelList: "openai",
    },
    qiniu: {
        label: "Qiniu",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "QINIU",
        defaultBaseUrl: "https://api.qnaigc.com/v1",
        apiKeyUrl: "https://www.qiniu.com/ai/models",
        modelList: "openai",
        singleSystem: true,
    },
    bedrock: {
        label: "Amazon Bedrock",
        sdk: "bedrock",
        credential: "aws",
        group: "cloud",
        envPrefix: null,
        fixedCredentials: true,
        ownRequestPath: true,
        logo: "amazon-bedrock",
        icon: "cloud",
        noteKey: "noteBedrock",
    },
    // ... the other 21, written in the order the picker shows them
} satisfies Record<string, ProviderDef>

export type ProviderName = keyof typeof PROVIDERS

/** The https default a server may call on its own; a local default only fills the form */
export function publicDefaultUrl(provider: ProviderName): string | undefined
```

字段语义说明：

- `sdk` 回答"createModel 调哪个工厂"，取代按 provider 名的 switch。其中 "doubao"、"minimax"、"aihubmix" 三个值是服务商专属的，因为这三家各有一段无法用布尔字段表达的规则（Doubao 按模型名选 createDeepSeek，MiniMax 按 URL 路径选协议，AIHubMix 在官方地址用专用 SDK 并附 appCode）。三个专属 case 比一套通用的"按 URL 或模型名选协议"抽象更短、更好懂。kimi 和 mimo 直接写 `sdk: "deepseek"`。
- `credential` 回答"表单收什么、路由查什么"，取代 lib/provider-setup.ts:97 hasCredentials、app/api/validate-model/route.ts:106 到 133、components/provider-credentials-fields.tsx 和 components/model-config-dialog.tsx:933 里按名字的分支。
- `envPrefix` 加 `keyEnv` 覆盖今天三处拼变量名的全部情况：21 家按 `<PREFIX>_API_KEY` / `<PREFIX>_BASE_URL`；gateway 的前缀是 AI_GATEWAY；vertexai 的前缀是 GOOGLE_VERTEX（正好对应 GOOGLE_VERTEX_API_KEY 和 GOOGLE_VERTEX_BASE_URL）；google 的 URL 变量是 GOOGLE_BASE_URL 但 key 变量是 GOOGLE_GENERATIVE_AI_API_KEY，所以需要 keyEnv；bedrock 和 edgeone 为 null。ollama 今天在 PROVIDER_ENV_VARS 里是 null，含义是"自动检测和校验时不要求它"，实际它有 OLLAMA_API_KEY。新模型里它的 envPrefix 是 "OLLAMA"，credential 是 "optionalKey"，自动检测按 `credential === "apiKey"` 过滤，语义更准确，结果相同。
- `fixedCredentials` 显式标在 bedrock、vertexai、ollama 三家上。从 credential 推导（非 apiKey 非 none 即固定）看似可行，但将来若加一个本地服务商也用 optionalKey，推导会把它误判为固定凭据，显式标注更安全。
- `sdkKnowsEndpoint` 逐字对应今天的 SDK_KNOWS_ENDPOINT 集合（openai、google、azure、openrouter、gateway、deepseek）。注意 kimi 和 mimo 虽然走 createDeepSeek 但不在集合里，它们的 defaultBaseUrl 要显式传给工厂，所以这是 provider 级别的字段，与 sdk 无关。
- `ownRequestPath` 逐字对应 chatRequestUrl 的 ownPaths（google、vertexai、azure、bedrock、gateway、minimax、edgeone）。EdgeOne 虽然是 openai-compatible 却在列表里（它的 URL 是站点自己的，显示请求地址没有意义），所以这个字段按 provider 逐条标注，与 sdk 字段无关。
- `logo` 只在 models.dev 的名字与 provider 键不同时填写（今天 PROVIDER_LOGO_MAP 的 19 条里有 11 条与键相同，可以省略）；`icon` 取代 components/provider-logo.tsx:14 到 22 的三个 if。
- `group`、`noteKey`、`optionsOpen`、`baseUrlHintKey` 取代 lib/provider-setup.ts 的 PROVIDER_GROUPS、PROVIDER_NOTE_KEYS、OPTIONS_OPEN，以及 provider-credentials-fields.tsx:259 到 268 的 minimax、mimo 提示分支。将来再加一家需要地址提示的服务商（MiMo 那种情况），改动变成记录里一个字段加四份字典各一句。
- 记录键的书写顺序就是选择器各组内的显示顺序。核对发现今天 PROVIDER_GROUPS 的组内顺序与 PROVIDER_INFO 的键顺序并不一致：vendors 组是 openai、anthropic、google、deepseek、qwen、doubao、glm、kimi、minimax、mimo，而 PROVIDER_INFO 的键顺序会得到 deepseek、doubao、glm、qwen；aggregators 和 cloud 两组也不同。方案是把记录按选择器顺序书写一次。管理面板"添加 provider"下拉框（app/[lang]/admin/models-section.tsx:529）用 `Object.keys(PROVIDER_INFO)`，顺序会跟着变成与选择器一致，列入待决问题。

**保留为独立表的两张及理由。** SUGGESTED_MODELS 搬到独立文件 lib/suggested-models.ts，类型 `Partial<Record<ProviderName, string[]>>`。它有约 260 行、180 个模型 id，放进记录会让每条 10 行的配置被几十行 id 淹没（bedrock 有 28 个）；它的变化节奏（模型发布）也和 provider 配置不同。POPULAR_PROVIDERS 是一个有顺序的 6 元素列表（openai、anthropic、google、deepseek、openrouter、qwen），顺序与记录键顺序不同（openrouter 在 qwen 前），保留为手写列表。

**兼容性与过渡。** lib/types/model-config.ts 改为转发导出：`export { PROVIDERS as PROVIDER_INFO, type ProviderName } from "@/lib/providers"`。PROVIDER_INFO 今天被 12 个文件引用，它们读的 label、defaultBaseUrl、apiKeyUrl、modelList 四个字段在新记录上同名存在，引用处不用改。其余十一张表全部变成从 PROVIDERS 派生的常量，放在原文件以原名导出：

```ts
// lib/provider-setup.ts, transitional
export const PROVIDER_GROUPS = (["vendors", "aggregators", "cloud", "selfHosted"] as const).map(
    (id) => ({
        id,
        providers: PROVIDER_NAMES.filter((p) => PROVIDERS[p].group === id),
    }),
)
export const PROVIDER_NOTE_KEYS = pick(PROVIDERS, "noteKey")

// lib/ai-providers.ts, transitional
export const SINGLE_SYSTEM_PROVIDERS = new Set(PROVIDER_NAMES.filter((p) => PROVIDERS[p].singleSystem))
```

这样数据层的改动和界面的改动分在不同步骤，各自可以单独回滚。读者在第 5 步后直接读字段的派生常量，在第 6 步删除。

### 3.2 从记录选 AI SDK 工厂

createModel（lib/ai-providers.ts:694）的签名不变，switch 的判别式从 provider 名换成 `PROVIDERS[provider].sdk`，每个 case 的内容照搬：

```ts
function createModel(provider: ProviderName, modelId: string, e: Endpoint): LanguageModel {
    switch (PROVIDERS[provider].sdk) {
        case "openai": ...            // unchanged body: chat behind a configured URL, else responses
        case "anthropic": ...
        case "google": ...
        case "azure": ...
        case "openrouter": ...
        case "gateway": ...
        case "deepseek": ...          // deepseek, kimi, mimo
        case "doubao": ...            // model-name choice, unchanged
        case "aihubmix": ...
        case "minimax": ...
        case "openai-compatible":     // siliconflow, sglang, modelscope, glm, qwen, qiniu, novita, atlascloud, edgeone, custom
            return compatibleModel(provider, modelId, e)
        case "bedrock":
            return bedrockModel(modelId, overrides)   // today's branch at :909, moved verbatim
        case "vertex":                 // today's createVertex call at :1020
            return createVertex({ apiKey: e.apiKey, ...(e.baseURL && { baseURL: e.baseURL }), ...(e.fetch && { fetch: e.fetch }) })(modelId)
        case "ollama":                 // today's createOllama call at :1047
            return createOllama({ ...(e.baseURL && { baseURL: ollamaApiUrl(e.baseURL) }), ...(e.apiKey && { headers: { Authorization: `Bearer ${e.apiKey}` } }), ...(e.fetch && { fetch: e.fetch }) })(modelId)
    }
}
```

getAIModel 里的第二个 switch（909 到 1121 行）随之消失。Bedrock 的 85 行搬进 bedrockModel(modelId, overrides)，内容不动（region 正则、apiKey:"" 和 bedrockRuntimeUrl、ADMIN_AWS_* 优先于 fromNodeProviderChain、anthropic.claude 的 beta 选项合并留在 getAIModel 里按 provider 判断）。Vertex、Ollama 的 key 和 URL 规则进入 resolveEndpoint，工厂调用成为 createModel 的 case。EdgeOne 成为 openai-compatible 加 `credential: "none"` 的普通情况。加一个 OpenAI 兼容服务商时这个函数一字不改。

### 3.3 一个决定 key 和 URL 的函数

```ts
// lib/ai-providers.ts

export type KeySource = "client" | "server" | "none"

/** Where and how to call a provider, once credentials are resolved */
export interface Endpoint {
    apiKey?: string
    authToken?: string          // Anthropic Bearer auth (ANTHROPIC_AUTH_TOKEN), server only
    resourceName?: string       // Azure, server resource only
    baseURL?: string            // undefined: the SDK's built-in endpoint
    configuredBaseURL: boolean  // the URL came from the client or a server env var
    guarded: boolean            // a client-chosen, untrusted URL: wrap fetch in redirectGuardedFetch
    keySource: KeySource        // "server" is what usesServerCredentials answers true for
    headers?: Record<string, string>
}

/**
 * Whose key the call uses and where it goes. Reads only its arguments and
 * process.env; never throws, never fetches. getAIModel decides what to do
 * when a key or URL is missing; usesServerCredentials reads keySource.
 */
export function resolveEndpoint(provider: ProviderName, overrides?: ClientOverrides): Endpoint

/** The env var names of a provider's key and base URL, from PROVIDERS */
export function envVarsOf(provider: ProviderName): { apiKey?: string; baseUrl?: string }

/** The server has this provider's credentials (detectProvider and validateProviderCredentials share it) */
function hasServerCredentials(provider: ProviderName, apiKeyEnv?: string | string[], baseUrlEnv?: string): boolean
```

resolveEndpoint 的规则按 credential 种类分五支，每支都是今天 getAIModel 里已有的逐行逻辑搬了位置，不新增判断：

1. 清理客户端 URL：`normalizeBaseUrl(overrides.baseUrl ?? "")`，空串视为没有。今天 getAIModel :795 和 usesServerCredentials :1209 各做一次。
2. `aws`（bedrock）：客户端带 apiKey，或同时带 awsAccessKeyId 和 awsSecretAccessKey，则 keySource 为 "client"，否则为 "server"（包括 ADMIN_AWS_* 和 IAM 角色两种情况，今天在 usesServerCredentials 里都算服务器付费）。apiKey 和 baseURL 不填，Bedrock 的 SDK 参数在 bedrockModel() 里按今天的写法构造。
3. `vertexKey`（vertexai）：有客户端 URL 时 apiKey 只取 overrides.vertexApiKey（:1005 的规则）；否则 vertexApiKey 优先，其次 GOOGLE_VERTEX_API_KEY。baseURL 调用 resolveBaseURL(vertexApiKey, 客户端 URL, GOOGLE_VERTEX_BASE_URL)。keySource 为有 vertexApiKey 时 "client"，否则 "server"。
4. `none`（edgeone）：apiKey 固定为 "edgeone"（:1058 传的值），baseURL 为 `overrides.baseUrl || "/api/edgeai"`，headers 透传，keySource "none"。
5. `optionalKey`（ollama）：有客户端 URL 时 key 只取 overrides.apiKey（:1033）；否则按 resolveApiKey 的三级优先取 OLLAMA_API_KEY。baseURL 为客户端 URL，否则客户端有 key 时为 Ollama Cloud 的 defaultBaseUrl，否则为服务器变量（:1040 到 1046）。keySource 为 "server" 的条件照抄 usesServerCredentials :1221 到 1225：无客户端 URL、无客户端 key，且 `overrides.apiKeyEnv || process.env.OLLAMA_API_KEY` 为真。这里判断的是 apiKeyEnv 变量名是否给了，变量值为空也算，与今天一致，含一个边角（见待决问题 3）。
6. `apiKey`（其余 19 家）：default 分支 :1066 到 1107 的逻辑原样搬入。apiKey 按 resolveApiKey 三级优先，默认变量名来自 envVarsOf；configuredBaseURL 为 resolveBaseURL(客户端 key, 客户端 URL, 服务器 URL 变量)；baseURL 为 configuredBaseURL，否则 sdkKnowsEndpoint 且不是"openai 带客户端 key"时留空，否则 publicDefaultUrl。anthropic 无 apiKey 时 authToken 取 altKeyEnv 的值；azure 无客户端 key 时 resourceName 取 resourceNameEnv 的值。keySource 为客户端有 key 时 "client"，否则 "server"。
7. `guarded` 等于 `!!clientUrl && !overrides.trustedBaseUrl`，对所有 provider 相同（:904 到 907）。

这个函数不抛异常的原因：validate-model 路由在请求之前就要问 usesServerCredentials（:138），那时凭据可能不全，必须得到一个布尔值。所以缺 key、缺 URL 的三条抛错留在 getAIModel 里，表达在结果上：Vertex 缺 key 抛 :1009 的原话；"needs a base URL" 的条件保留 :1093 到 1097 的原话；Azure 带客户端 key 却没有 URL 同理。错误文案不变、位置不变。

调用方的变化：

- getAIModel：顶部 guard、模型 id 选择、provider 选择、`if (!isClientOverride) validateProviderCredentials(...)` 四段不变。之后 `const e = resolveEndpoint(provider, overrides)`，检查上面三条抛错，然后 `createModel(provider, modelId, { ...e, fetch: e.guarded ? redirectGuardedFetch() : undefined })`。Bedrock 的 anthropic.claude beta 合并留在这里。
- usesServerCredentials 变成三行：desktop 判断，然后 `return resolveEndpoint(provider, overrides).keySource === "server"`。"Mirrors…"注释删除。
- detectProvider 和 validateProviderCredentials：共用 hasServerCredentials，它读 keyEnv、altKeyEnv、resourceNameEnv，Anthropic 和 Azure 的 if 只写一次。detectProvider 遍历 `credential === "apiKey"` 的 provider（与今天跳过 null 等价）。
- globalBaseUrl：函数体保留（它对 ollama 和 vertexai 用 getEnvFallback 读设置文件回退、对其余用 process.env 的差异是管理面板需要的，必须原样保留），只把 :1164 到 1166 的变量名拼法换成 envVarsOf(provider).baseUrl。
- lib/admin/providers.ts:92 credEnvNames 的前缀换成 `PROVIDERS[provider].envPrefix`，:88 的判断换成 `fixedCredentials || envPrefix === null`。
- listFallbackUrl：`startsWith("https://")` 换成 publicDefaultUrl(provider)，Ollama 那条按名字保留。
- usesServerEndpoint 不动。它只有三个名字（edgeone、ollama、bedrock），是配额逻辑，改成读字段的收益小于审计成本。
- resolveApiKey 和 resolveBaseUrlEnv 成为 resolveEndpoint 的私有帮助函数或内联，不再被别处调用。

### 3.4 界面和路由读能力字段

| 今天的分支 | 改为 |
|---|---|
| lib/provider-setup.ts:97 hasCredentials 按名字 switch | 按 `credential` 种类 switch。azure 的"默认 URL 不算填好"保留为名字判断，因为它读的是 azure 的 defaultBaseUrl 占位值 |
| app/api/validate-model/route.ts:106 到 133 按 bedrock、vertexai、ollama、edgeone 检查凭据 | `switch (PROVIDERS[provider].credential)`，五种凭据各一句，错误文案不变 |
| app/api/provider-models/route.ts:20 NO_KEY_NEEDED | `PROVIDERS[provider].listNeedsNoKey` |
| components/provider-credentials-fields.tsx:210 ollama 的"可选"标签 | `credential === "optionalKey"` |
| 同文件 :259、:264 minimax、mimo 的地址提示 | `baseUrlHintKey && dict.modelConfig[baseUrlHintKey]` |
| 同文件 :273 edgeone 不渲染凭据 | `credential === "none"` |
| 同文件 :116 OPTIONS_OPEN.includes | `optionsOpen` |
| 同文件 :280、:406、:436 到 :443、:459、:513 bedrock 与 vertexai 的两套表单 | `credential === "aws"` 与 `"vertexKey"`。这些仍是分支，但依据是凭据种类；再加一家 AWS 风格的服务商不用改表单 |
| components/settings/provider-picker.tsx:96 PROVIDER_NOTE_KEYS[provider] | `PROVIDERS[provider].noteKey` |
| components/provider-logo.tsx:14 到 24 三个 if 加 PROVIDER_LOGO_MAP | 读 `icon`，有则渲染对应 Lucide 图标；否则 `logo ?? provider`。components/model-selector.tsx:337、:426 同理 |
| components/model-config-dialog.tsx:933 testBlocker 文案、:305 errorHints | 按 `credential === "aws"` 和 `credential === "apiKey" && requires URL`（azure 仍按名字，与 hasCredentials 一致） |
| lib/types/model-config.ts:647 chatRequestUrl 的 ownPaths | `PROVIDERS[provider].ownRequestPath`；anthropic 和 ollama 两条特殊路径保留。tests/unit/base-url.test.ts 不改 |
| lib/admin/providers.ts:88、:92 credEnvNames | 读 fixedCredentials 和 envPrefix |
| lib/server-model-config.ts:9 ProviderNameSchema | `val in PROVIDERS`（今天是 `val in PROVIDER_INFO`，转发导出后无需改） |

**保留按名字写的地方及理由。** getAIModel 顶部的 guard（三个例外）、usesServerEndpoint（三个名字）、Bedrock 专用函数、resolveEndpoint 里 Ollama 的一个分支，这些是安全和配额逻辑，名字显式列出便于审计。app/api/chat/route.ts:199 和 :224 以及 validate-model :82、:194 的 EdgeOne 判断，和 components/model-config-dialog.tsx:538、:994 的 EdgeOne origin 拼接，属于 EdgeOne Pages 这个部署目标的专有逻辑（站点自己的函数、cookie 透传），只有一家，加字段换不来可读性。lib/admin/providers.ts:246 到 262 和 :294 到 310 的 bedrock、vertexai、ollama 三个固定变量分支属于非目标。deriveEnvUpdates 以外，预计层外剩约 12 处名字判断。

### 3.5 "custom" 预设

一条普通记录，没有新机制：

```ts
custom: {
    label: "OpenAI-compatible",
    sdk: "openai-compatible",
    credential: "apiKey",
    group: "selfHosted",
    envPrefix: "CUSTOM",
    modelList: "openai",
    icon: "server",
    noteKey: "noteCustom",       // "Any OpenAI-compatible URL and key"
    optionsOpen: true,
    singleSystem: true,          // open-source chat templates reject several system messages
},
```

没有 defaultBaseUrl，所以用户不填地址时 getAIModel 用现有文案报 "needs a base URL"，列模型报 "needs a base URL to list its models"，和 SGLang 今天的行为一样；chatRequestUrl 在地址下方显示 `…/chat/completions`，用户能看到请求去向。credential 填 apiKey，因为 getAIModel 顶部的 guard 要求自定义地址必须带 key；LM Studio 这类不校验 key 的服务填任意占位字符串即可，这也是 SGLang 用户今天的做法。服务器端对应 CUSTOM_API_KEY 和 CUSTOM_BASE_URL，管理面板自动得到 ADMIN_CUSTOM_API_KEY[_n]。需要同时加的内容：四份字典的 noteCustom 一句话、env.example 两行、三语文档一段。

协议选择留在预设之外。Anthropic 协议的网关（magpie、New API 的 Anthropic 端点）今天选 Anthropic 再填地址就能用，resolveBaseURL 会把用户 key 发到用户地址；Gemini 协议的网关同理选 Google。为 custom 加协议下拉框要改表单、createModel、chatRequestUrl 三处和客户端存储格式，收益只是少选一次服务商。这里和 magpie 的取舍不同：magpie 的 Provider 为每种协议各存一个 URL（internal/provider/provider.go 的 Speaks()），并按模型名前缀（claude*、gpt-*）决定走哪个协议（Native()）。那是网关需要的，本项目有 AI SDK 按 provider 选协议，一条记录一个 sdk 字段就够。

magpie 值得借的一点：internal/provider/detect.go:43 DetectBase 按协议清理粘贴的 URL（去掉 /chat/completions、/responses、/messages，Anthropic 去 /v1，裸主机加 /v1，Gemini 加 /v1beta）。本项目的 normalizeBaseUrl（lib/types/model-config.ts:620）已经做了去端点路径的部分。"裸主机加 /v1"会改变其他 provider 的行为，列入待决问题。

### 3.6 Bedrock、Vertex、Azure、Ollama、EdgeOne 各自变成什么

- **Bedrock**：记录 `sdk: "bedrock", credential: "aws", envPrefix: null, fixedCredentials, ownRequestPath, icon: "cloud", noteKey: "noteBedrock"`。getAIModel :909 到 999 的分支整体成为 bedrockModel(modelId, overrides)，内容不动。resolveEndpoint 对它只回答 keySource。管理面板的 ADMIN_AWS_* 分支原样。
- **Vertex**：记录 `sdk: "vertex", credential: "vertexKey", envPrefix: "GOOGLE_VERTEX", fixedCredentials, ownRequestPath, logo: "google", noteKey: "noteVertex"`。:1001 到 1027 的 key 和 URL 规则进入 resolveEndpoint 第 3 条，缺 key 的抛错留在 getAIModel，createVertex 调用成为 createModel 的 case。buildProviderOptions 的 vertexai 分支不动。
- **Azure**：记录 `sdk: "azure", credential: "apiKey", envPrefix: "AZURE", resourceNameEnv: "AZURE_RESOURCE_NAME", sdkKnowsEndpoint, ownRequestPath, defaultBaseUrl: "https://your-resource.openai.azure.com/openai"（占位示例，hasCredentials 用它判断"还没改过"）, optionsOpen, noteKey: "noteAzure"`。"服务器可用资源名"进 hasServerCredentials 和 resolveEndpoint 的 resourceName；"带客户端 key 必须有 URL"的抛错留在 getAIModel；globalBaseUrl :1156 到 1162 按资源名拼 URL 的分支原样。
- **Ollama**：记录 `sdk: "ollama", credential: "optionalKey", envPrefix: "OLLAMA", fixedCredentials, defaultBaseUrl: "https://ollama.com/api", apiKeyUrl, modelList: "ollama", listNeedsNoKey, optionsOpen, noteKey: "noteOllama"`。:1029 到 1052 的 key 和 URL 规则进入 resolveEndpoint 第 5 条（整个函数里唯一按名字写的分支），ollamaApiUrl 和 Bearer 头的拼装进 createModel 的 case。guard 里"没配 OLLAMA_API_KEY 时允许无 key 自定义地址"的例外按名字保留。
- **EdgeOne**：记录 `sdk: "openai-compatible", credential: "none", envPrefix: null, ownRequestPath, logo: "tencent-cloud", noteKey: "noteEdgeone"`。:1054 到 1062 的分支消失，由 resolveEndpoint 第 4 条给出 apiKey "edgeone" 和 baseURL，再走 compatibleModel。edgeOneEndpoint(req) 和两个路由里的 cookie 透传不动。

### 3.7 models.dev 数据怎么用

所有者的倾向是让 buildProviderOptions 先查 getModelInfo().reasoning 再退回正则，并从目录生成 SUGGESTED_MODELS。用当前的 lib/model-catalog.json 核对后，本文的建议有两点不同。

**reasoning 判定：维持正则，不读目录。** 用目录里每个 provider 的全部模型对比今天的正则：

| provider | 目录模型数 | 与正则不一致 | 不一致的内容 |
|---|---|---|---|
| openai | 40 | 3 | gpt-daybreak-blue-latest、gpt-daybreak-red-latest、gpt-realtime-2.1：目录说会推理，正则说不会 |
| google | 31 | 7 | deep-research 两个、gemini-flash-latest、gemini-flash-lite-latest、gemma-4 两个：目录说会，正则说不会；gemini-3.5-live-translate-preview 反之 |
| vertexai | 38 | 21 | 全部是 Claude 模型：目录说会推理，但 vertexai 分支设置的是 Google 的 thinkingConfig，对 Claude 无效 |
| bedrock | 184 | 77 | Nova 微型模型目录说不推理但正则命中；DeepSeek 等第三方模型目录说推理，但 Bedrock 的 reasoningConfig 只接受 Claude 与 Nova 的格式 |
| azure | 75 | 30 | 全部是 Claude 模型，与 vertexai 同理 |

结论是两者回答的问题不同：目录的 reasoning 标记回答"这个模型会不会推理"，现有正则回答"该给 SDK 哪种格式的选项"（例如 Bedrock 的判断区分的是模型厂商家族，决定 reasoningConfig 用 budgetTokens 还是 maxReasoningEffort）。"先查目录再退回正则"会在 Bedrock 和 Vertex 上发错选项格式，在 openai 和 google 上改变 10 个模型的请求参数（gemma 是否接受 thinkingConfig 没有验证过）。此外目录覆盖不全：sglang、edgeone、atlascloud 没有条目；google 下没有 gemini-2.0-flash（models.dev 已标弃用），而正则仍会为它开 includeThoughts；目录是发布前手动刷新的文件，新模型上线到目录收录之间有空窗，按命名规律写的正则对新模型即时有效。因此本方案不改 buildProviderOptions。可选的后续方向有两个，列入待决问题 4：一是"正则说有就有；正则说没有时，目录明确说有也算有"，这条规则只会增加开启思维链的模型，对 openai 和 google 的 9 个模型是行为变化；二是在模型设置里让用户显式勾选"推理模型"，根本不用猜。

**SUGGESTED_MODELS 不从目录生成。** 目录里 bedrock 有 184 个、openrouter 390 个、gateway 316 个、novita 107 个模型，而推荐列表每家 2 到 15 个、按新旧排序，是人工挑选的结果；lib/model-catalog.json 没有保留 release_date，没有热门度字段；azure 的模型 id 是用户自己的部署名。生成清单需要再写一套排序和筛选规则，等于用一种启发式替换另一种。建议保留手工列表，并加一个只警告的测试：对目录里有数据的 provider，每个推荐 id 若 getModelInfo 找不到就打印出来，提示"可能已下线"。

**models.dev 映射。** scripts/update-model-catalog.mjs 是直接用 node 运行的 .mjs，import TypeScript 记录需要 `node --experimental-strip-types`（本机 Node 24 支持）或 tsx。建议脚本保留自己的映射，另加一个测试断言它的键集合是 ProviderName 的子集。是否把映射并入记录见待决问题 5。

## 4. 分步迁移

每一步一个 commit 或 PR，可独立回滚。每步结束时运行"基线门禁"：

```
npx vitest run tests/unit/ai-providers.test.ts tests/unit/ai-providers-credentials.test.ts \
  tests/unit/ai-providers-cache.test.ts tests/unit/ai-providers-google.test.ts \
  tests/unit/ai-providers-openai.test.ts tests/unit/provider-models.test.ts \
  tests/unit/admin-providers.test.ts tests/unit/admin-providers-route.test.ts \
  tests/unit/provider-setup.test.ts tests/unit/base-url.test.ts tests/unit/server-model-config.test.ts
npx tsc --noEmit
npm run lint
```

本文写作时这组测试为 11 个文件 145 个用例全部通过。

### 第 0 步：先把现状录下来（只加测试）

- 文件：新增 tests/unit/provider-matrix.test.ts 和它生成的 tests/unit/__snapshots__/provider-matrix.json；新增 tests/unit/provider-legacy.test.ts。约 300 行测试代码，快照约 1500 条记录。
- 内容：
  1. 行为快照。对 24 个 provider × 9 种客户端 override 形状（无；仅 key；仅 URL；key 加 URL；URL 为 "/"；apiKeyEnv；apiKeyEnv 加 baseUrlEnv；AWS 成对 key；vertexApiKey 加 URL；trustedBaseUrl 加 URL）× 7 种服务器环境（空；`<P>_API_KEY`；key 加 `<P>_BASE_URL`；OLLAMA_API_KEY；AZURE_RESOURCE_NAME；ANTHROPIC_AUTH_TOKEN；ADMIN_AWS_*；NEXT_AI_DRAWIO_DESKTOP=1），用 vitest 把全部 SDK 工厂 mock 掉（tests/unit/ai-providers-credentials.test.ts:16 到 57 已这样做了六个，再补 anthropic、google、deepseek、openai-compatible、aihubmix、gateway 和 ai 包的 wrapLanguageModel）。对每个组合记录：哪个工厂被调用、传入的选项（fetch 记为 "guarded" 或 "none"）、openai 走的是 chat 还是 responses、providerOptions、抛出的错误文本，以及 usesServerCredentials、usesServerEndpoint（isPrivateUrl 按主机名 mock）、globalBaseUrl、chatRequestUrl 的返回值。Math.random 固定为 0。整体用 toMatchFileSnapshot 存成一个 JSON。
  2. 差分测试骨架：把 usesServerCredentials 和 usesServerEndpoint 的当前函数体原文复制到测试文件作为 legacy 版本，对第 5.1 节的全部输入域逐一比对。此时新旧是同一份代码，测试必然通过；它的价值在之后每一步。
  3. 表的一致性测试：13 张表里 `Record<ProviderName, …>` 类型的键必须齐全，列表类型的元素必须都在 ProviderName 内（tests/unit/provider-setup.test.ts:26 已检查 PROVIDER_GROUPS，复用）。
- 测试门：基线门禁通过；新测试通过；快照文件进入版本库。
- 行为检查：无生产代码改动，`git diff --stat -- lib app components` 为空。

### 第 1 步：样例，只迁移 Atlas Cloud、Novita、Qiniu

- 文件：新增 lib/providers.ts（Sdk、Credential、ProviderDef 类型，PROVIDERS 记录只含三条，约 110 行）；lib/types/model-config.ts、lib/ai-providers.ts、lib/provider-setup.ts 里这三家所在的表项删除，改为从记录派生后合并进表尾。新增 tests/unit/providers.test.ts 约 40 行。差异约 +150 / −30。
- 做法：这一步 ProviderName 联合类型仍然手写。每张旧表改成"手写部分加派生部分"：

```ts
// lib/ai-providers.ts, step 1 only
export const PROVIDER_ENV_VARS: Record<ProviderName, string | null> = {
    bedrock: null,
    openai: "OPENAI_API_KEY",
    // ... 21 hand-written rows, the three sample rows removed
    ...keyEnvsOf(PROVIDERS),   // atlascloud, novita, qiniu
}
```

  createModel 的 default 注释里去掉三家名字，改为 "and every provider whose sdk is openai-compatible"。

- 给所有者看的对比，以 Qiniu 为例。改动前它出现在 6 处：

```
lib/types/model-config.ts:22      | "qiniu"
lib/types/model-config.ts:239     qiniu: { label: "Qiniu", defaultBaseUrl: "https://api.qnaigc.com/v1", apiKeyUrl: "https://www.qiniu.com/ai/models", modelList: "openai" }
lib/types/model-config.ts:~470    qiniu: [ ...suggested models ]
lib/ai-providers.ts:50            "qiniu",            (SINGLE_SYSTEM_PROVIDERS)
lib/ai-providers.ts:520           qiniu: "QINIU_API_KEY",
lib/provider-setup.ts:41          "qiniu",            (PROVIDER_GROUPS aggregators)
```

  改动后它出现在 3 处，其中两处是不变的联合类型成员和推荐列表：

```ts
// lib/providers.ts
qiniu: {
    label: "Qiniu",
    sdk: "openai-compatible",
    credential: "apiKey",
    group: "aggregators",
    envPrefix: "QINIU",
    defaultBaseUrl: "https://api.qnaigc.com/v1",
    apiKeyUrl: "https://www.qiniu.com/ai/models",
    modelList: "openai",
    singleSystem: true,
},
```

  Novita 同理（多一个 `logo: "novita"`），Atlas Cloud 同理（`logo: "openai"`，无 singleSystem）。随 PR 附一张表，列出三家在每张旧表里的旧值和新记录派生出的值，逐项相同；并说明若再加第四家 OpenAI 兼容服务商，diff 将只有记录里一个条目加 env.example 两行。

- 测试门：第 0 步快照逐字节不变（这是本步最重要的证据，说明三家的运行时行为完全没变）；基线门禁全绿；tests/unit/ai-providers.test.ts 的 "Atlas Cloud provider" 3 个用例不改；新增 tests/unit/providers.test.ts 断言三条记录派生出的 PROVIDER_ENV_VARS、PROVIDER_INFO、SINGLE_SYSTEM_PROVIDERS、PROVIDER_LOGO_MAP、PROVIDER_GROUPS 条目与改动前的字面值相同（字面值写进测试）。
- 行为检查：`npx playwright test tests/e2e/provider-models.spec.ts` 通过；在设置里添加 Novita，拉模型列表，测一个模型。

所有者在此处决定是否继续。

### 第 2 步：其余 21 家进记录，十三张表变成派生常量

- 文件：lib/providers.ts 补齐到 24 条并按选择器顺序书写（约 +260 行）；lib/types/model-config.ts 删除 ProviderName 联合、PROVIDER_INFO、FIXED_CRED_PROVIDERS、PROVIDER_LOGO_MAP、ModelListStyle 的字面值，改为转发导出和派生常量，SUGGESTED_MODELS 整段搬到 lib/suggested-models.ts 并在原处 re-export（约 −460 / +30）；lib/ai-providers.ts 的 SINGLE_SYSTEM_PROVIDERS、PROVIDER_ENV_VARS、SDK_KNOWS_ENDPOINT 改派生（约 −50 / +15）；lib/provider-setup.ts 四张表改派生（约 −60 / +25）；app/api/provider-models/route.ts 的 NO_KEY_NEEDED 改派生（−5 / +2）。ProviderName 改为 `keyof typeof PROVIDERS`。差异约 +600 / −580。
- 新增测试：tests/unit/providers.test.ts 扩展，把第 2 步之前 13 张表的字面值冻结成一份 fixture（从第 1 步的代码直接复制），断言派生常量与 fixture 深相等，并额外断言 `Object.keys` 的顺序（toEqual 不比较键序）。这份 fixture 在第 6 步删除旧表时一并删除。
- 测试门：快照不变；fixture 相等测试通过；tests/unit/provider-setup.test.ts 的 "hold every provider exactly once" 自然通过；`npx tsc --noEmit` 无错，特别关注 `keyof typeof PROVIDERS` 推导后所有 `Record<ProviderName, …>` 与 `Partial<Record<…>>` 的使用点。
- 行为检查：设置页打开 provider 选择器，分组和顺序与改动前的截图一致；管理面板"添加 provider"下拉框的顺序变化见待决问题 2。

### 第 3 步：环境变量名与服务器凭据判断合一

- 文件：lib/ai-providers.ts（新增 envVarsOf 和 hasServerCredentials；detectProvider、validateProviderCredentials、globalBaseUrl、default 分支 :1070 到 1075 改为调用它们）；lib/admin/providers.ts（credEnvNames 读 envPrefix 和 fixedCredentials）。差异约 +40 / −60。
- 新增测试：credEnvNames 对 24 家的输出表（tests/unit/admin-providers.test.ts 已覆盖 openai、openrouter、bedrock、vertexai、ollama、gateway，补齐其余，期望值在改动前先生成）；hasServerCredentials 四个用例：Anthropic 只有 ANTHROPIC_AUTH_TOKEN、Azure 只有 key 没有地址、Azure 由服务器模型自己的 baseUrlEnv 提供地址、数组形式的 apiKeyEnv 至少一个有值。
- 测试门：快照不变（快照包含错误文本，三段 "environment variable is required" 文案逐字不变）；基线门禁；credEnvNames 表。
- 行为检查：管理面板添加一个 Qiniu 条目和一个 Gateway 条目并保存，检查 settings.json 旁写出的变量名仍是 ADMIN_QINIU_API_KEY 和 ADMIN_AI_GATEWAY_API_KEY。

### 第 4 步：resolveEndpoint 上线，getAIModel 的第二个 switch 消失

拆成三个小 PR，每个都有同样的门禁。

- 4a. 在 lib/ai-providers.ts 新增 resolveEndpoint（约 90 行），暂无调用方。新增 tests/unit/resolve-endpoint.test.ts：对第 5.1 节的输入域断言 `resolveEndpoint(...).keySource === "server"` 与 legacy usesServerCredentials 相等；再用快照矩阵里的每个场景断言 resolveEndpoint 给出的 apiKey、baseURL、configuredBaseURL、authToken、resourceName、guarded 与 mock 记录到的 SDK 工厂参数相等。门禁：差分测试通过。若发现任何不一致，以旧行为为准修改 resolveEndpoint，或列入待决问题。差异约 +90 / +120（测试）。
- 4b. getAIModel 的 bedrock、vertexai、ollama、edgeone、default 五个分支换成一次 resolveEndpoint 调用加 createModel；createModel 的 switch 改为按 sdk，bedrockModel()、vertex、ollama 三个 case 加入；三条抛错按 3.3 节保留。差异约 +130 / −250（Bedrock 的 85 行是搬动）。门禁：快照不变；tests/unit/ai-providers-credentials.test.ts 的 26 个用例和 tests/unit/ai-providers.test.ts 的 "Ollama API key security" 7 个用例不改。
- 4c. usesServerCredentials 改为读 keySource；listFallbackUrl 改用 publicDefaultUrl；删除 resolveApiKey、resolveBaseUrlEnv 的独立导出（逻辑已在 resolveEndpoint 内）。差异约 +15 / −45。门禁：快照不变；差分测试通过；tests/unit/provider-models.test.ts 19 个用例不改。
- 行为检查：对照 2.2 节的表逐条勾选；用一个真实 key 跑 chat 路由，确认服务器日志里 `[AI Provider] Initializing` 之后的请求 URL 与改前一致。

### 第 5 步：界面与路由读能力字段

- 文件：lib/provider-setup.ts（hasCredentials）、app/api/validate-model/route.ts（凭据检查）、components/provider-credentials-fields.tsx、components/settings/provider-picker.tsx、components/provider-logo.tsx、components/model-selector.tsx、components/model-config-dialog.tsx（:933 和 :305）、lib/types/model-config.ts（chatRequestUrl）。按 3.4 节的表执行，一个文件一个 commit。差异约 +70 / −90。
- 新增测试：hasCredentials 对 24 个 provider 的结果表（tests/unit/provider-setup.test.ts:58 已有 8 个，扩成全表，期望值改动前生成）；chatRequestUrl 对 24 家各一行。
- 测试门：快照不变（chatRequestUrl 在快照里）；基线门禁；tests/e2e/provider-models.spec.ts 的 20 个用例通过（它点击 `pick-provider-<name>` 按钮并走完"拉取模型列表、加入模型、测试"流程，含第 501 行 "Bedrock can be tested and used with an API key alone"）。
- 行为检查：设置页逐个打开 bedrock、vertexai、azure、ollama、edgeone、minimax、mimo 的凭据表单，与改动前截图对比字段、提示和图标。

### 第 6 步：删除过渡代码，写"如何新增 provider"

- 文件：lib/types/model-config.ts 删除 FIXED_CRED_PROVIDERS、PROVIDER_LOGO_MAP 等已无读者的派生常量（PROVIDER_INFO 的转发导出保留，见待决问题 1）；lib/provider-setup.ts 删除 PROVIDER_NOTE_KEYS、OPTIONS_OPEN 派生常量（PROVIDER_GROUPS 保留，filterProviderGroups 用它）；app/api/provider-models/route.ts 删除 NO_KEY_NEEDED；删除第 2 步的 fixture 测试；docs/{cn,en,ja}/ai-providers.md 末尾加一节"如何新增 provider"（三语各约 15 行：lib/providers.ts 加一条记录，可选 lib/suggested-models.ts 加一行，env.example 加两行，本文档加一段）；新增一个测试断言每条记录的 envPrefix 或 keyEnv 推出的变量名都出现在 env.example 里（bedrock 和 edgeone 除外）。约 −120 行。
- 测试门：快照不变；差分测试保留并通过；全部单元测试与 e2e 通过；`npx tsc --noEmit`、`npm run lint` 无错。

### 第 7 步：custom 预设

- 文件：lib/providers.ts（+12 行）；lib/i18n/dictionaries/{en,ja,zh,zh-Hant}.json 各加 noteCustom；env.example（+3 行）；docs/{cn,en,ja}/ai-providers.md 各一段。差异约 +50 行，全是数据和文档。
- 测试门：第 6 步的 env.example 覆盖测试和 provider-setup 的"notes in every language"自动覆盖它；快照新增 custom 行，其余行不变；一个安全用例确认 custom 带 URL 不带 key 被 guard 拒绝；e2e 新增一个用例：选 custom、填本地地址和占位 key、看到请求地址提示。
- 行为检查：用本机的 LM Studio 或一个 vLLM 容器填 URL 和 key，拉模型、测试、对话。

### 第 8 步（可选，行为变更，需所有者单独批准）：目录辅助 reasoning 判定

- 只在所有者选择待决问题 4 的第一个选项时做。文件：lib/ai-providers.ts buildProviderOptions 的 openai 和 google 两处正则抽成 isReasoningModel(provider, modelId)，规则为"正则说有就有；正则说没有时，目录明确说有也算有"（约 +15 / −6）；tests/unit/model-catalog.test.ts 新增一个用例打印目录与正则的全部不一致模型 id，让每次目录刷新时的差异可见。
- 测试门：快照里 providerOptions 字段允许变化，但变化的行必须恰好是 3.7 节列出的 openai 3 个和 google 6 个模型。
- 行为检查：对受影响的模型用真实 key 各试一个（至少 gemini-flash-latest 和一个 gemma），确认 thinkingConfig 和 reasoningSummary 不被拒绝。

## 5. 测试与验证

### 5.1 两个配额函数的同一性证明

- usesServerCredentials 的输入域是有限的：provider 24 个；overrides 里 apiKey 有或无、baseUrl 取无、"/"、"https://u.example" 三种、awsAccessKeyId 与 awsSecretAccessKey 成对有或无、vertexApiKey 有或无、apiKeyEnv 取无、有值的变量、无值的变量三种；环境里 OLLAMA_API_KEY 有或无、NEXT_AI_DRAWIO_DESKTOP 为 "1" 或无。共 24 × 2 × 3 × 2 × 2 × 3 × 2 × 2 = 6912 个组合，全部枚举，新旧实现逐一比对，运行时间毫秒级。第 3.3 节第 5 条提到的 Ollama 边角在这里会被原样守住。
- usesServerEndpoint 的输入域：provider 24 个、clientBaseUrl 取空、公网地址、私网地址三种（isPrivateUrl 按主机名 mock）、apiKey 有或无、桌面标记有或无，共 288 个组合。它本身不改，这份测试让将来任何顺手的改动立即可见。
- resolveBaseURL 本身不改，现有 15 个用例保留。
- 以上测试在第 0 步写好，之后每一步运行；legacy 副本在重构完成后仍保留，因为成本几乎为零而且是最直接的证据。

### 5.2 单元测试

每一步运行基线门禁。现有 145 个用例的断言不修改；若某个用例因为 import 了被删除的常量而编译失败，改成 import 派生常量，断言不变。新增文件：provider-matrix（快照）、provider-legacy（差分）、providers（记录派生值与 fixture）、resolve-endpoint，加 admin-providers 和 provider-setup 里的两张全表。预计新增约 40 个用例。

### 5.3 e2e

`npx playwright test tests/e2e/provider-models.spec.ts`，20 个用例，在第 1、2、5、6、7 步之后各跑一次。它覆盖选择器分组、拉模型、测试按钮、切换 provider 时迟到的响应不串台、多语言文案、Bedrock 只用 API key。CI 已经分 6 片跑 e2e（提交 04d3453），不需要改。

### 5.4 管理面板（手动，第 3、4c、6 步之后）

添加一个 OpenAI 条目和一个 Qiniu 条目，点 Test，保存；检查 settings.json 旁写出的变量名仍是 ADMIN_OPENAI_API_KEY、ADMIN_QINIU_API_KEY、ADMIN_QINIU_BASE_URL；添加第二个 Qiniu 条目，检查后缀 _2；添加 Bedrock 条目，检查 ADMIN_AWS_*；添加 Ollama 和 Vertex 各一条，检查 OLLAMA_API_KEY、GOOGLE_VERTEX_API_KEY；设为默认，检查 AI_PROVIDER / AI_MODEL 被写入；一个无 URL 的条目点 Test，确认 globalBaseUrl 返回的服务器 URL 被当作可信 URL（app/api/admin/test-model/route.ts:51）；删除条目后检查环境变量被清理；在聊天页用服务器模型发一条消息。

### 5.5 Electron 桌面版（第 2 和第 6 步之后）

`npm run electron:build` 通过（主进程用 esbuild 单独打包，与 lib/ 没有导入关系，这一步主要确认 `next build` 在类型改动后仍通过，且 lib/providers.ts 没有引入 Node 专有模块导致浏览器端构建失败）。设置 NEXT_AI_DRAWIO_DESKTOP=1 启动，确认 usesServerCredentials 与 usesServerEndpoint 对任意输入都返回 false（快照里的桌面环境列已覆盖），并用 "Ollama (Local)" 预设和一个 OpenAI 预设各发一条消息。

### 5.6 真实 key 的手动检查（每种线路协议至少一家）

| 线路协议或 SDK | 用哪家 | 检查什么 |
|---|---|---|
| OpenAI Responses API | openai 官方 key，无 base URL | 返回 reasoning 片段（gpt-5 系列）；快照里 openai 无配置 URL 时走 responses |
| OpenAI Chat Completions（兼容） | qiniu 或 novita，或 custom 指向本机 vLLM | 正常流式回复，`<think>` 内容出现在 reasoning 部分，正文里没有它 |
| DeepSeek 风格 reasoning_content | kimi 或 deepseek | 多轮工具调用不报 400 |
| Anthropic Messages | anthropic 官方 key（同时验证 ANTHROPIC_AUTH_TOKEN 形式）；minimax 用 /anthropic 地址 | 流式工具调用正常；MiniMax 走 createAnthropic |
| Google Gemini | google | includeThoughts 生效 |
| Bedrock Converse | Bedrock API key 和成对 access key 各一次 | 请求 host 为所填 region 的 bedrock-runtime；错误 region 返回 400 |
| Vertex Express | vertexai | 正常回复 |
| Azure OpenAI | azure，资源名方式和地址方式各一次 | 正常回复 |
| Ollama 本地 | 本机 Ollama，无 key | 请求打到 /api/chat，不计配额 |
| OpenRouter、Gateway、AIHubMix | 各自 | 正常回复，模型列表可拉取 |
| EdgeOne | 需要 EdgeOne Pages 部署环境 | /api/edgeai 被调用且带 cookie；没有环境时跳过并记录 |

每次都检查两条：请求成功，以及服务器日志里 `[AI Provider] Initializing` 之后的请求 URL 与改前一致。没有某家 key 时在待决问题里标记为"由所有者代测"。

## 6. 风险与回滚

| 风险 | 怎样发现 | 如何回滚 |
|---|---|---|
| resolveEndpoint 在某个少见组合上与旧分支不一致，导致服务器 key 发往客户端 URL，或配额漏计多计（最可能在 Ollama 的 apiKeyEnv 边角、Azure 四种组合、openai 带用户 key 的 URL） | 第 0 步快照和 5.1 的差分测试在 PR 内就会失败，差异行指出 provider 和场景 | 第 4 步分成 4a、4b、4c 三个 PR，任一 PR 单独 `git revert` 即恢复；旧函数在 4c 之前都还在 |
| envPrefix 填错一个字母，某家在服务器部署里读不到 key，报 "environment variable is required" | 第 2 步的 fixture 测试立即失败（PROVIDER_ENV_VARS 派生值与字面值不同）；部署后日志出现该错误 | 回滚第 2 步；没有数据迁移 |
| 管理面板 credEnvNames 的前缀派生错误，已存在的 ADMIN_<P>_API_KEY 读不到，用户的服务器模型全部失效 | 第 3 步的 24 项 credEnvNames 期望表；5.4 的手工验证 | 回滚第 3 步；settings.json 和环境变量未被改动，数据无损 |
| ProviderName 改为 `keyof typeof PROVIDERS` 后类型推导变化，某些 `Partial<Record<ProviderName,…>>` 或 zod refine 编译失败 | `npx tsc --noEmit` 在第 2 步 PR 内失败 | 原地补 `as ProviderName`（与今天 `process.env.AI_PROVIDER as ProviderName` 的写法一致），或回滚第 2 步；第 1 步的三条记录仍可独立工作 |
| 派生表的键顺序与旧表不同，选择器里 provider 顺序变化 | 第 2 步 fixture 测试额外断言 `Object.keys` 的顺序；e2e 的 `pick-provider-*` 用例；截图对比 | 调整 PROVIDERS 的书写顺序即可，无需回滚 |
| lib/providers.ts 被客户端组件 import，若误加 Node import 会让浏览器端构建失败 | `npm run build` 和 e2e | 把 import 挪回 lib/ai-providers.ts |
| e2e 对话框测试因表单分支改为按 credential 种类而失败 | 第 5 步 e2e | 第 5 步按文件逐个 commit，回滚对应 commit |
| i18n 字典缺 noteCustom 导致某语言显示 key 名 | provider-setup 测试 "have their notes in every language" 遍历 noteKey | 补字典 |
| 快照文件体积大（约 1500 条、几百 KB），PR review 噪音 | 快照只在第 7、8 步允许变化，其余步骤 diff 为零；评审只需看"快照无变化" | 若觉得过大，可按 provider 拆成 24 个文件 |
| 第 8 步启用目录判定后，某模型被加上它不接受的 reasoning 参数，请求 400 | 第 8 步的真实 key 检查；用户报错 | 第 8 步是独立 commit，revert 即可 |
| 文档与 env.example 没有和记录同步 | 第 6 步新增的 env.example 覆盖测试 | 随时可补 |
| Electron 的 PROVIDER_ENV_MAP 仍缺 13 家 | 这是现状，不因本方案变化 | 后续单独处理，见待决问题 6 |

所有步骤都只在 lib、app、components、tests、docs 内移动代码，不改 settings.json、localStorage 格式、ai-models.json 格式或任何环境变量名，因此每一步回滚都是纯代码回滚，无需迁移数据。

## 7. 预期效果

| 指标 | 改动前 | 改动后 |
|---|---|---|
| 新增 OpenAI 兼容服务商要改的代码文件 / 位置 | 3 个文件、5 到 7 处 | 1 个文件、1 处（可选再加 1 行推荐模型） |
| 新增服务商要改的文档 | env.example 加 3 份文档 | 不变 |
| 新增带地址提示的服务商（MiMo 那种） | 12 个文件 | 6 个（记录、4 份字典、env.example），文档可选 |
| 应用代码里以 provider 名为键的表 | 13 张，5 个文件 | 3 张（PROVIDERS、SUGGESTED_MODELS、POPULAR_PROVIDERS），3 个文件 |
| 仓库里以 provider 名为键的表（含脚本和 Electron） | 15 | 5，或处理待决问题 5、6 后更少 |
| 按请求推导"用谁的 key、去哪个 URL"的位置 | getAIModel 五个分支加 usesServerCredentials 镜像 | resolveEndpoint 一处 |
| 环境变量名拼法出现的位置 | 3 处 | 1 处（envVarsOf） |
| Anthropic 与 Azure 的服务器凭据特例 | 2 处 | 1 处（hasServerCredentials） |
| createModel 的分支依据 | 11 个 provider 名 case，default 列 9 个名字，加 getAIModel 里 4 个分支 | 14 个 sdk 种类 case，无名字列表 |
| 层外 provider 名判断 | 约 48 处 | 约 12 处（guard、usesServerEndpoint、EdgeOne 站点端点、Azure 占位 URL、管理面板三家固定变量） |
| lib/ai-providers.ts | 1290 行 | 约 1150 行（buildProviderOptions 的 234 行不动） |
| lib/types/model-config.ts | 657 行 | 约 200 行 |
| lib/provider-setup.ts | 138 行 | 约 80 行 |
| 新增文件 | 无 | lib/providers.ts 约 370 行，lib/suggested-models.ts 约 265 行 |
| 整层总行数 | 约 2740 | 约 2700，大致持平 |
| 单元测试 | 145 个 | 约 185 个，加一份约 1500 场景的快照和约 7200 组合的差分测试 |

总行数大致持平，收益体现在三处：加 provider 的改动面、key 与 URL 决策的单点化、不再有"必须手工镜像"的注释。

## 8. 待决问题

1. **记录的导出名。** 新文件里叫 PROVIDERS，lib/types/model-config.ts 以 PROVIDER_INFO 转发导出，12 个 import 处不用改。要统一成一个名字，需要改 12 个文件约 25 行。建议先保留别名，重构完成后再决定。
2. **选择器与管理面板的顺序。** 记录按选择器顺序书写后，管理面板"添加 provider"下拉框（用 `Object.keys(PROVIDER_INFO)`）的顺序会从今天的联合类型顺序变成与选择器一致。接受这一点，还是在记录上加一个 order 数字字段？建议接受。
3. **Ollama 的 apiKeyEnv 边角。** 今天 usesServerCredentials 在服务器模型配置了 apiKeyEnv 但该变量为空时返回 true（计配额、走白名单），而 getAIModel 此时不带 key 发请求。这个输入在管理面板里产生不出来（credEnvNames 对 ollama 返回空，面板不会给它 apiKeyEnv），只有手写 ai-models.json 才会碰到。本方案逐字保留旧答案。所有者可以决定改为"有 key 值才算 server"，那是一个有意的行为变化，应单独 commit 并在差分测试里标注为例外。
4. **buildProviderOptions 要不要读目录。** 三个选项：维持现状（本方案建议）；按第 8 步做"目录只能增加开启思维链的模型"，改变 openai 3 个和 google 6 个模型的请求参数；或者走产品方向，在模型设置里让用户勾选"推理模型"。
5. **scripts/update-model-catalog.mjs 的映射。** 让脚本用 `node --experimental-strip-types` 读 lib/providers.ts 的 catalogId 字段，还是保留脚本自己的表并加一个键集合测试。前者少一张表，后者零风险。建议后者。
6. **Electron 的 PROVIDER_ENV_MAP。** 它今天只覆盖 11 家，桌面版预设选其余 13 家时 AI_API_KEY 不会被映射。可以让 electron/main 用相对路径 import lib/providers.ts（纯数据，esbuild 能打包）从 envVarsOf 派生，也可以单独补齐。两者都在本方案范围外。
7. **SUGGESTED_MODELS 的位置。** 本方案放在独立文件 lib/suggested-models.ts。若所有者希望"一条记录带全部事实"，可以作为记录的 suggested 字段，代价是 bedrock 等条目变长。
8. **custom 预设是否做，以及是否支持 Anthropic 协议。** 只支持 OpenAI 兼容协议时改动极小，但和 SGLang 条目功能接近；另一个选择是把 SGLang 条目的标签改成更通用的名字。支持 Anthropic 协议需要加协议字段和新请求头，属于新功能。
9. **是否借鉴 magpie 的 DetectBase，给只有主机名的 OpenAI 兼容地址自动补 /v1。** 这是行为变更；若要做，应在第 7 步之后单独提，并限定在 custom 记录上。
10. **sdkKnowsEndpoint 能否去掉。** 若对所有 provider 都显式传 defaultBaseUrl，这个字段和 default 分支里 openai 的特例都可以删，resolveEndpoint 少两条规则。代价是传给工厂的参数从 undefined 变为显式 URL，快照会显示差异，需要确认每家 SDK 的内置默认值与记录一致。建议第 4 步先逐字移植，确认快照后再作为独立 commit 尝试。
11. **真实 key 的手动检查。** 5.6 节的 11 行里，所有者手头有哪些 key，哪些需要跳过或由他人代测。

## 评审记录

三份草稿从不同角度写成，终稿的取舍如下：

- **数据模型优先**：终稿采用了它的数据模型主干，包括独立的纯数据文件 lib/providers.ts、带 Sdk 和 Credential 两个枚举的 ProviderDef、createModel 按 sdk 分支并把 Bedrock 分支逐字搬进 bedrockModel()、EdgeOne 和 Electron 两张遗漏表的发现、"目录只增加开启思维链的模型"这一可选规则，以及 2.2 节逐条对应实现位置的写法。
- **迁移安全优先**：终稿采用了它的第 0 步行为快照加差分测试的设计、第 4 步拆成三个小 PR 的顺序、fixture 冻结旧表字面值并断言键序的做法，以及它用五个 provider 的完整目录数据证明"目录 reasoning 标记与正则回答的是两个不同问题"的分析；它关于 PROVIDER_GROUPS 顺序与 PROVIDER_INFO 键顺序一致的说法经核对不成立，终稿采用了相反的结论。
- **最小改动优先**：终稿采用了它对"十个函数"的职责区分（按请求推导的合并，其余只改读数据）、envVarsOf 与 hasServerCredentials 两个小帮助函数、让 getAIModel 顶部 guard 和 usesServerEndpoint 保留显式名字的审计理由、SUGGESTED_MODELS 和 POPULAR_PROVIDERS 保留为独立表、Ollama apiKeyEnv 边角的发现，以及维持 buildProviderOptions 现状的建议；它主张不加 sdk 字段、保留按 provider 名的 switch，终稿没有采用，因为加字段后 getAIModel 的第二个 switch 可以整体消失，而三个服务商专属的 sdk 值已经把它担心的"同一事实写两遍"限制在三处。
