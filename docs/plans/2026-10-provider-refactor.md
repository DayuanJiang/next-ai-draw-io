# AI provider 层重构方案

本文最初基于 2026-10-11 对提交 2418c47 的代码阅读写成；本次修订（2026-10-12）把它核对到提交 99ced88，即死代码清理（#986）和 AI SDK 用法修正（#987）之后的 main，文中所有文件行号都在该提交上重新核对过。三份从不同角度写的草稿经过对照和核实后合并为本文，取舍记录在文末的"评审记录"。

术语约定，首次出现时解释，之后直接使用：

- "provider"指一个模型服务商的接入配置，例如 OpenAI、Qiniu、Amazon Bedrock。
- "AI SDK"指 Vercel 的 `ai` 包和各家 `@ai-sdk/*` 工厂函数（createOpenAI、createAnthropic 等）。"provider 层"指把（provider 名、模型 id、凭据、base URL）变成 AI SDK 的 LanguageModel 对象、并向界面描述每个 provider 的那部分代码。
- "OpenAI 兼容服务商"指只提供与 OpenAI `/v1/chat/completions` 相同接口的服务商，走 `@ai-sdk/openai-compatible`。
- "凭据来源"指一次请求最终用谁的 API key：客户端随请求送来的（用户自己的），还是服务器环境变量里的（部署者付费）。
- "服务器模型"指管理员在 ai-models.json、AI_MODELS_CONFIG 或管理面板里配置、由服务器 key 付费、供所有用户使用的模型。它们通过 apiKeyEnv 和 baseUrlEnv 两个字段指向环境变量名。
- "管理面板"指 app/[lang]/admin 下的页面，它把 provider 条目存进 settings.json，并把凭据写进 `ADMIN_<PROVIDER>_API_KEY[_n]` / `ADMIN_<PROVIDER>_BASE_URL[_n]` 环境变量。
- "连接测试"指设置对话框的 Test 按钮和管理面板的 Test 按钮共用的那段逻辑，今天在 lib/test-model-connection.ts 的 testModelConnection(req, body, trustedBaseUrl) 里，由 app/api/validate-model/route.ts（29 行，只解析请求体）和 app/api/admin/test-model/route.ts 调用。

## 1. 背景与目标

### 1.1 现状的问题（已逐条核对）

核对范围：行号与函数位置逐条在提交 99ced88 上核对过；用例数用 `npx vitest run --reporter=dot` 的汇总和 `grep -c -E "^\s*test\(" <e2e 文件>` 生成，模型数来自 lib/model-catalog.json，行数用 `wc -l` 统计。

**"用谁的 key、发到哪个 URL"这一个问题由多个函数各自推导，靠人手保持一致。** 相关函数如下：

| 函数 | 位置 | 回答的问题 |
|---|---|---|
| resolveBaseURL | lib/ai-providers.ts:132 | 有用户 key 时只许用户 URL（没有则留空），否则用户 URL 或服务器 URL |
| resolveApiKey | lib/ai-providers.ts:156 | 用户 key，否则 apiKeyEnv，否则默认变量 |
| resolveBaseUrlEnv | lib/ai-providers.ts:192 | baseUrlEnv，否则默认变量 |
| detectProvider | lib/ai-providers.ts:483 | 服务器配了哪些 provider 的 key（Anthropic 和 Azure 各有特例） |
| validateProviderCredentials | lib/ai-providers.ts:525 | 服务器 key 是否齐全（Anthropic 和 Azure 的特例再写一遍） |
| getAIModel 的五个分支 | lib/ai-providers.ts:863 到 :1073 | bedrock、vertexai、ollama、edgeone、default 各自算一遍 key 和 URL |
| globalBaseUrl | lib/ai-providers.ts:1097 | 服务器自己的 URL，供管理面板的 Test 按钮用 |
| getServerProvider | lib/ai-providers.ts:1121 | AI_PROVIDER，否则自动检测 |
| usesServerEndpoint | lib/ai-providers.ts:1132 | 请求是否落在部署自己的网络上（配额） |
| usesServerCredentials | lib/ai-providers.ts:1152 | 是否由服务器 key 付费（配额和白名单） |
| listFallbackUrl | lib/provider-models.ts:138 | 列模型时没有用户 URL 该去哪 |

其中 usesServerCredentials 的注释写着 "Mirrors which key each branch of getAIModel ends up using"（:1149 到 :1150），说明它必须和 getAIModel 的分支手工对齐，没有机制保证。环境变量名的拼法 `provider === "gateway" ? "AI_GATEWAY_BASE_URL" : \`${provider.toUpperCase()}_BASE_URL\`` 在 lib/ai-providers.ts:1022 到 :1025、lib/ai-providers.ts:1113 到 :1116 和 lib/admin/providers.ts:92 出现三次。Anthropic 接受 ANTHROPIC_AUTH_TOKEN、Azure 还需要 URL 或资源名这两条规则，在 detectProvider 和 validateProviderCredentials 里各写一遍。

核对后要指出，这十一个函数并不都在回答同一个问题。真正按请求推导"用谁的 key、去哪个 URL"的是 getAIModel 的五个分支和 usesServerCredentials；detectProvider 和 validateProviderCredentials 回答"服务器环境配齐了没有"；getServerProvider 回答"用哪家"；usesServerEndpoint 回答"请求落在谁的网络"；listFallbackUrl 的规则与请求不同（列模型永远不用服务器 key）。本方案按这个区分处理：按请求推导的部分合并为一个函数，其余函数改为读统一的数据，但保留各自的职责。

**同一个 provider 的事实散在十三张以 provider 名为键的表加一个 ProviderName 联合类型里，分布在四个文件。**

| 表 | 位置 | 内容 |
|---|---|---|
| ProviderName 联合类型 | lib/types/model-config.ts:3 | 24 个名字 |
| PROVIDER_INFO | lib/types/model-config.ts:132 | label、defaultBaseUrl、apiKeyUrl、modelList |
| FIXED_CRED_PROVIDERS | lib/types/model-config.ts:90 | bedrock、vertexai、ollama |
| PROVIDER_LOGO_MAP | lib/types/model-config.ts:97 | models.dev 的 logo 名，19 条 |
| SUGGESTED_MODELS | lib/types/model-config.ts:270 到 :528 | 手工维护的推荐模型 id，259 行、179 个 id |
| chatRequestUrl 内的 ownPaths | lib/types/model-config.ts:638 | SDK 自己拼请求路径的 7 家 |
| SINGLE_SYSTEM_PROVIDERS | lib/ai-providers.ts:43 | 只接受一条 system 消息的 7 家 |
| PROVIDER_ENV_VARS | lib/ai-providers.ts:452 | 每家 API key 的环境变量名（模块私有） |
| SDK_KNOWS_ENDPOINT | lib/ai-providers.ts:599 | SDK 内置官方地址的 6 家 |
| PROVIDER_GROUPS | lib/provider-setup.ts:13 | 选择器的四个分组及组内顺序 |
| POPULAR_PROVIDERS | lib/provider-setup.ts:50 | 空状态时推荐的 6 家 |
| PROVIDER_NOTE_KEYS | lib/provider-setup.ts:60 | 选择器里的提示文案 key，6 家 |
| OPTIONS_OPEN | lib/provider-setup.ts:74 | 默认展开高级选项的 5 家 |
| NO_KEY_NEEDED | app/api/provider-models/route.ts:20 | 列模型不需要 key 的 3 家 |

此外脚本有一处：scripts/update-model-catalog.mjs:9 的 PROVIDERS（本项目 provider 名到 models.dev provider id 的映射，21 项）。它运行在一个独立的 node 脚本里，与 lib/ 没有导入关系，本方案保持它不变，列为待决问题 5。提交 #986 删掉了 Electron 的配置预设系统，electron/main/config-manager.ts 现在是 57 行，内容只有界面语言设置，与 provider 无关。

**加一个 provider 要改多处。** 提交 c8463ae（Atlas Cloud，纯 OpenAI 兼容）改了 lib/ai-providers.ts 5 处、lib/types/model-config.ts 4 处、当时的 app/api/validate-model/route.ts 1 处 case 加 1 处注释、env.example，加两个测试文件。提交 4984be8（MiMo）改了 12 个文件，其中 4 个 i18n 字典、3 个文档和 components/provider-credentials-fields.tsx 是为了一条 base URL 提示。需要说明的是，c8463ae 当时连接测试路由和 getAIModel 里还各有一个按 provider 名的 switch，提交 0b63e28 之后它们已经合并进 createModel 的 default 分支，所以今天的起点比当时好一些：一个纯 OpenAI 兼容服务商最少改 3 个代码文件 5 到 7 处（ProviderName 联合类型、PROVIDER_INFO、PROVIDER_ENV_VARS、PROVIDER_GROUPS 必改，SUGGESTED_MODELS、SINGLE_SYSTEM_PROVIDERS、PROVIDER_LOGO_MAP 视情况）。

**createModel 的 switch 按 24 个 provider 名分支，实际只有 14 种做法。** lib/ai-providers.ts:645 到 :736 里，kimi、mimo 和 deepseek 共用 createDeepSeek；siliconflow、sglang、modelscope、glm、qwen、qiniu、novita、atlascloud、edgeone 九家全部落到 default 的 compatibleModel。Bedrock、Vertex、Ollama、EdgeOne 四家在 getAIModel 的第二个 switch（:863 到 :1073）里另有分支。要知道一个 provider 走哪条路，必须读完两个 switch。

**provider 名分支散落在层外。** 按"与 provider 名字面量比较或 case"统计，lib/ai-providers.ts 之外共 44 处：components/provider-credentials-fields.tsx 11 处、lib/admin/providers.ts 8 处、lib/test-model-connection.ts 6 处（:80、:96、:109、:119 两处、:184）、lib/provider-setup.ts 5 处、components/model-config-dialog.tsx 5 处、components/provider-logo.tsx 3 处、app/api/chat/route.ts 2 处（:176 到 :178 的 isEdgeOne 和 :423 的 openai）、lib/types/model-config.ts 2 处（chatRequestUrl 的 anthropic 和 ollama）、lib/provider-models.ts 2 处（:139 ollama、:166 aihubmix；:173 到 :237 的六个 case 判别的是 modelList 字段，已经是能力字段，不计入）。这些分支问的几乎都是能力问题（"要不要 key""凭据是 AWS 形式还是单个 key""能不能列模型"），回答方式却是列举 provider 名。

**reasoning 判定靠模型名正则，模型目录闲置。** buildProviderOptions（lib/ai-providers.ts:295 到 :449，155 行）用 `/^(o\d|gpt-([5-9]|[1-9]\d))/`（:313）判断 OpenAI 模型，google 和 vertexai 两个分支共用 geminiThinkingOptions（:248），它用 `/gemini-?[23]/`（:253）判断是否开思维链。lib/model-catalog.json 有 21 个 provider 共 1638 个模型，其中 1182 个带 reasoning 标记，969 个带 images 标记，但 buildProviderOptions 不读它。第 3.7 节给出两者的实际对比数据，结论与先前分析的倾向有出入。

**规模。** lib/ai-providers.ts 1240 行，lib/types/model-config.ts 648 行，lib/provider-setup.ts 138 行，lib/provider-models.ts 259 行，lib/admin/providers.ts 309 行，五个文件合计 2594 行。连接测试另在 lib/test-model-connection.ts 244 行。

### 1.2 "完成"的样子（可度量）

1. 新增一个 OpenAI 兼容服务商：代码只改 1 个文件 1 处（lib/providers.ts 加一个对象字面量，约 10 行）；能在线列模型的服务商没有手写推荐列表，用户填好 key 后对话框自动拉取；env.example 和 docs/{cn,en,ja}/ai-providers.md 照常各加一段，env.example 继续手写，由第 6 步的测试保证每条记录的变量名都出现在里面。今天是 3 个代码文件 5 到 7 处。
2. 应用代码里以 provider 名为键的表从 13 张降到 2 张：PROVIDERS（唯一的事实来源）和 POPULAR_PROVIDERS（6 家的有序列表，是界面决定）。6 家不能在线列模型的服务商的短推荐列表放在各自记录的 models 字段里。脚本的一张映射是否并入见待决问题 5。
3. 按请求推导"用谁的 key、去哪个 URL"的代码从 getAIModel 的五个分支加 usesServerCredentials 的镜像，变为一个函数 resolveEndpoint（它读参数和 process.env，没有异常、网络请求和日志这三种副作用）；环境变量名的拼法只在 envVarsOf 一处；"服务器配齐了没有"的判断只在 serverCredentialError 一处。usesServerCredentials 的"Mirrors…"注释随之删除。
4. createModel 按 SDK 种类分支，default 不再列 provider 名；getAIModel 的第二个 switch 消失，只剩一个按 `sdk === "bedrock"` 把 Bedrock 交给 bedrockModel 的判断（见 3.2）。
5. 界面组件、连接测试和两个路由里的 provider 名分支改读记录字段：getAIModel 顶部的 guard 和 usesServerEndpoint 读 credential 与 sdk，EdgeOne 的站点端点和 cookie 透传用 `credential === "none"` 表达。按名字写的只剩管理面板 deriveEnvUpdates 和 derivedEnvKeys 里 bedrock、vertexai、ollama 三家写固定变量名的分支（所有者要求保留，共 6 处比较）。理由见 3.4。
6. 行数：lib/ai-providers.ts 从 1240 降到约 1140；lib/types/model-config.ts 从 648 降到约 190；lib/provider-setup.ts 从 138 降到约 70；新增 lib/providers.ts 约 470 行（含 6 家的推荐列表和 9 条四语文案：8 条从字典搬来，加 Azure 新的地址提示）。整层总行数从 2594 降到约 2430。这个数字要如实说明：本方案的收益在"每个事实只写一处"和"加 provider 的改动面"，而在行数上收益很小。
7. 现有 723 个单元测试（63 个文件）和四个 e2e 文件（settings-providers、settings-bedrock、provider-models、model-test）的 56 个用例全程保持通过，断言不改，例外有三处并且都在各自的步骤里单独 commit：第 5 步 Azure 去掉占位地址后 tests/e2e/settings-providers.spec.ts:552 那个用例的种子数据和提示文案；第 7 步推荐列表改为在线拉取后三处引用推荐模型的 e2e 断言；第 8 步 custom 记录把选择器计数断言从 24 改为 25。新增一份行为快照测试，证明每一步前后 getAIModel 送给 SDK 工厂的参数、usesServerCredentials、usesServerEndpoint、globalBaseUrl 和 chatRequestUrl 的答案逐一相同。

## 2. 非目标与必须保持不变的行为

### 2.1 非目标

- 换掉 Vercel AI SDK，或自己实现协议转换。magpie（参考的第三方 Go 网关）的协议翻译、路由分组和账号管理与本项目无关，AI SDK 已经做了协议处理。
- 改动管理面板把凭据写进 `ADMIN_<PROVIDER>_API_KEY[_n]` / `ADMIN_<PROVIDER>_BASE_URL[_n]` 的机制（lib/admin/providers.ts:84 credEnvNames，:232 deriveEnvUpdates，:282 derivedEnvKeys）。它能用、有 33 个测试、所有者要求保留。本方案只让 credEnvNames 从统一记录读前缀和"固定凭据"标记，deriveEnvUpdates 和 derivedEnvKeys 里 bedrock、vertexai、ollama 三家写固定变量名的分支原样保留。
- 在管理面板加"拉取模型"按钮。面板里的 key 是打码存储的（{isSet} 标记），拉取要在服务器端解出真实 key，列为第 7 步之后的可选后续工作。
- 改 lib/ssrf-protection.ts。
- 改 electron/ 目录（主进程用 esbuild 单独打包，见 package.json 的 electron:compile；#986 之后它已经不含 provider 知识）。
- 改 buildProviderOptions 读取的环境变量名、默认值和正则（第 3.7 节解释为什么维持现状）。
- 在界面上增删 provider，或改变 provider 选择器的分组。
- 合并七个 URL 帮助函数（normalizeBaseUrl、ollamaApiUrl、chatRequestUrl、normalizeMiniMaxBaseURL、isAihubmixStandardBaseURL、bedrockRuntimeUrl、edgeOneEndpoint）。每个函数负责一件事且有测试，合并只会产生一个更难读的函数。chatRequestUrl 内部的 ownPaths 列表改读记录字段，函数本身保留。

### 2.2 必须保持的规则

每条写明今天实现它的位置，以及方案如何保住它。"快照"指第 4 节第 0 步建立的行为快照测试。表末三行是本方案有意改变的行为，单独列出。

| 规则 | 今天的实现 | 方案如何保住 |
|---|---|---|
| 用户自己的 key 永远不发到服务器配置的 base URL；用户 key 只去用户自己的 URL 或服务商官方 URL | resolveBaseURL（lib/ai-providers.ts:132）；Vertex 分支在 :964 调用它；Ollama 分支在 :988 到 :992 单独写了一遍 | resolveBaseURL 原样保留，其 9 个单元测试不改，resolveEndpoint 内部调用它。Ollama 的规则成为 resolveEndpoint 里 `credential === "optionalKey"` 的那一支，逐字搬入。快照里每个 provider 都有"用户 key 加服务器 URL 变量"场景 |
| 客户端自定 base URL 必须带客户端自己的 key，例外：EdgeOne、没有服务器 OLLAMA_API_KEY 时的 Ollama、带 vertexApiKey 的 Vertex、trustedBaseUrl | getAIModel 顶部的 guard（lib/ai-providers.ts:760 到 :772） | 条件结构不变，三个例外改为读记录：`credential === "none"`、`credential === "optionalKey"` 且服务器没有该家的 key 变量（变量名来自 envVarsOf）、`credential === "vertexKey"` 且带 vertexApiKey。guard 在 provider 名校验之前运行，所以用 `PROVIDERS[overrides.provider]?.credential`，未知名字得到 undefined，走到与今天相同的抛错。快照里有"仅 URL 无 key"场景，所有 provider 都应抛同一条错误 |
| 发往客户端选择的 URL 的请求用 redirectGuardedFetch；chat 路由和连接测试拒绝私网地址，除非 ALLOW_PRIVATE_URLS 允许；管理面板自己的服务器 URL 受信任（trustedBaseUrl） | lib/ai-providers.ts:855 到 :858 guardedFetch；app/api/chat/route.ts:187；lib/test-model-connection.ts:83 到 :92；app/api/admin/test-model/route.ts:56 到 :69 用 globalBaseUrl 的结果作为 trustedBaseUrl（`!resolved.baseUrl && !!serverUrl`） | guardedFetch 的构造条件搬进 resolveEndpoint 的 guarded 字段，条件逐字不变（有客户端 URL 且非 trusted）。路由和连接测试的私网检查不动。快照记录每个场景工厂是否收到守卫 fetch。注意 redirectGuardedFetch() 在 ALLOW_PRIVATE_URLS 未关闭且没有 DYNAMODB_QUOTA_TABLE 时返回 undefined（lib/ssrf-protection.ts:149 到 :151），所以快照测试把它 mock 成一个固定的哨兵函数，记录的是"构造条件是否成立"，与环境开关无关。现状里 AIHubMix 官方地址走 createAihubmix（:712 到 :718）不传 fetch，这是现有例外，快照会原样记录 |
| Bedrock：客户端 region 必须匹配 `/^[a-z]{2,4}(-[a-z]+)+-\d{1,2}$/`；四个 createAmazonBedrock 分支各自冻结：客户端 API key 分支传客户端 key、显式 baseURL 和一个抛错的 credentialProvider（key 为空时 SDK 不得回落到服务器 AWS 凭据）；客户端 access key 对分支传 apiKey:"" 和显式 baseURL（SDK 不读服务器的 AWS_BEARER_TOKEN_BEDROCK 和 endpoint 变量）；管理面板分支传 ADMIN_AWS_* 和 apiKey:""；无凭据时 fromNodeProviderChain | lib/ai-providers.ts:864 到 :943（:864 到 :933 是凭据选择和工厂调用，:935 到 :943 是 beta 选项合并），bedrockRuntimeUrl :581 | 凭据选择和四个 createAmazonBedrock 调用的 70 行逐字搬进函数 bedrockModel(modelId, overrides)，参数一个字不变，由 getAIModel 按 `sdk === "bedrock"` 直接调用。resolveEndpoint 对 Bedrock 只回答 keySource。tests/unit/ai-providers-credentials.test.ts 的 6 个 Bedrock 用例是门禁；客户端 API key 分支的 credentialProvider 闭包必须抛错、绝不回退到服务器 AWS 凭据这一点，由 tests/unit/bedrock-api-key.test.ts 用真实 SDK 加空白 key 验证（快照里函数值进不了 JSON，验证不了这一点） |
| usesServerCredentials 和 usesServerEndpoint 决定配额计数与服务器模型白名单，对每个输入的答案必须不变 | lib/ai-providers.ts:1152 和 :1132；调用方 app/api/chat/route.ts:245、:271，lib/test-model-connection.ts:128、:150 | usesServerCredentials 保留签名，函数体改为读 resolveEndpoint 的 keySource。usesServerEndpoint 的三个名字判断改为 `credential === "none"`、`credential === "optionalKey"` 和 `sdk !== "bedrock"`（provider 为 null 时读到 undefined，与今天 `null !== "bedrock"` 的结果相同）。第 0 步把两个函数的现有函数体原文复制进测试文件，按第 5.1 节的等价类全部枚举，逐项断言新旧相等。这份差分测试守到第 4c 步两个函数改读字段为止，之后删除 legacy 副本，由第 0 步快照里记录的两个函数返回值长期守住答案 |
| 服务器凭据只在客户端没带自己的凭据时校验。apiKeyEnv 为数组时，至少一个变量有值即通过，并且不再做任何后续检查（Azure 的数组配置今天不要求地址）。apiKeyEnv 为单个字符串时以这一个变量为准，为空就报错，此时默认变量被忽略；只有没给 apiKeyEnv 时 Anthropic 才接受 ANTHROPIC_AUTH_TOKEN 代替 ANTHROPIC_API_KEY。apiKeyEnv 为非数组时，Azure 另需 AZURE_BASE_URL、AZURE_RESOURCE_NAME 或服务器模型自己的 baseUrlEnv 之一。四段错误文案（数组、Either、单变量、Azure 地址）和抛出顺序（先 key 再地址）不变 | isClientOverride（:775）；validateProviderCredentials（:525）；detectProvider（:483） | 两个函数改为共用 serverCredentialError(provider, apiKeyEnv?, baseUrlEnv?)，它返回 null 或四段错误文案之一，内部顺序与今天 :531 到 :577 相同（数组提前返回、Anthropic 仅在无自定义变量时看 altKeyEnv、单变量不回退、最后 Azure 地址）；detectProvider 判断它是否为 null，validateProviderCredentials 直接抛出它返回的文案。它读记录上的 keyEnv、altKeyEnv、resourceNameEnv 字段。快照包含"无客户端 key 且服务器缺变量"场景以及 Azure 数组形式无地址场景的错误文本或无错误 |
| 服务器模型的 apiKeyEnv 可以是数组，随机选一个有值的 | resolveApiKey（:156 到 :189） | 随机抽取逐字搬入 resolveEndpoint 内部，但 `[API Key Routing] Selected…` 日志（:176）从 resolveApiKey 移到 getAIModel（Endpoint 新增 selectedKeyEnv 字段记录选中的变量名）。原因：chat 路由（app/api/chat/route.ts:240、:245）先调 getAIModel 再调 usesServerCredentials，后者改读 resolveEndpoint 后会对数组 apiKeyEnv 再抽一次；抽取结果不影响 keySource，日志移走后这次多余抽取没有任何可见效果。快照测试里把 Math.random 固定为 0 |
| OpenAI 官方 URL 走 Responses API，任何配置过的 base URL 走 Chat Completions | createModel openai 分支（:656 到 :664）读 configuredBaseURL | resolveEndpoint 返回 configuredBaseURL，含义不变（URL 来自客户端或服务器变量时为真）。快照记录 openai 走的是 chat 还是 responses |
| 带用户 key 的 OpenAI 显式传官方 URL（避开服务器 OPENAI_BASE_URL）；带用户 key 的 Azure 必须有 URL（避开服务器 AZURE_RESOURCE_NAME）；SGLang 的 127.0.0.1 默认值仅作为表单的预填值，服务器从来没有调用过它 | getAIModel default 分支 :1015 到 :1072（这三条在 :1030 到 :1055） | 规则逐字进入 resolveEndpoint，判别改为字段：OpenAI 那条用 `sdk === "openai"`，Azure 那条用 `resourceNameEnv`（SDK 会从服务器资源名拼地址的 provider，带客户端 key 时必须自带 URL），sdkKnowsEndpoint 成为记录字段。现有用例"sends a user's OpenAI key to the official endpoint""needs a base URL with a user's Azure key""needs a base URL for SGLang instead of using 127.0.0.1"不改 |
| SINGLE_SYSTEM_PROVIDERS 的 provider 和带自定 URL 的 openai 合并 system 消息 | lib/ai-providers.ts:43；app/api/chat/route.ts:423 到 :431 | 成为记录字段 singleSystem；SINGLE_SYSTEM_PROVIDERS 保留为派生常量，chat 路由这段的 `resolvedProvider === "openai"` 改为 `PROVIDERS[resolvedProvider].sdk === "openai"`，其余不改 |
| 管理面板：Bedrock、Vertex、Ollama 只能各有一条，凭据写固定环境变量；gateway 的前缀是 AI_GATEWAY | FIXED_CRED_PROVIDERS（lib/types/model-config.ts:90）；lib/admin/providers.ts:88、:92、:173、:246 到 :262、:288 到 :302 | 成为记录字段 fixedCredentials 和 envPrefix；FIXED_CRED_PROVIDERS 在第 2 步成为派生常量，第 5 步它的两个读者（app/[lang]/admin/models-section.tsx:535 和 lib/admin/providers.ts:173）改读记录字段后，第 6 步删除。新增测试断言 24 家的 credEnvNames 输出与改动前逐字相同 |
| 部署目标都要能用：Vercel、Cloudflare（open-next）、EdgeOne Pages（edgeone 用站点自己的 /api/edgeai 函数和 cookie）、Docker、Electron（NEXT_AI_DRAWIO_DESKTOP=1 时所有 key 都是用户的） | edgeOneEndpoint（:1083）；chat 路由 :176 到 :183 和 :219 到 :224；lib/test-model-connection.ts:80 和 :184；getAIModel 的 edgeone 分支 :1003 到 :1013；两个 uses* 函数开头的 desktop 判断 | 新文件 lib/providers.ts 是纯数据，没有任何运行时 import，可被客户端组件、Edge runtime 和 Node runtime 同时引用。路由和连接测试仍调用 edgeOneEndpoint(req) 把请求 origin 变成站点地址并透传 cookie，判断条件从 provider 名改为 `credential === "none"`。desktop 判断留在两个函数开头并进快照。各目标的验证见 5.5 和 5.5a |
| 列模型时只用客户端的 key；没有用户 URL 时去官方 URL，Ollama 无 key 时去服务器的 Ollama；SGLang 的本地默认值不作为列表地址 | lib/provider-models.ts:138 listFallbackUrl 及 :132 到 :137 的注释 | 函数保留，`startsWith("https://")` 的判断改为调用新的 publicDefaultUrl(provider) 帮助函数（getAIModel 共用），Ollama 那条改为 `credential === "optionalKey" && !apiKey`。tests/unit/provider-models.test.ts 的 19 个用例不改 |
| env.example、三语文档、四份 i18n 字典里的通用文案 | 文件本身 | env.example 继续手写，第 6 步加测试保证每条记录的变量名都在里面。字典里服务商专属的 8 个 key（minimaxBaseUrlHint、mimoBaseUrlHint、noteBedrock、noteVertex、noteAzure、noteEdgeone、noteOllama、noteSglang）搬进记录，见 3.1；通用界面文案留在字典。tests/unit/provider-setup.test.ts 的"have their notes in every language"由类型保证代替（记录里的文案对象要求四种语言齐全） |
| 选择器各组内的 provider 顺序 | PROVIDER_GROUPS（lib/provider-setup.ts:13） | 第 2 步 PROVIDERS 按选择器顺序书写，fixture 测试对 PROVIDER_GROUPS 逐项断言顺序；管理面板下拉框和错误文案里 provider 的排列顺序不在保持范围内，见待决问题 2 |
| 连接测试对畸形 provider 名的回应（有意变化） | 今天 lib/test-model-connection.ts 对未知名字不校验：无 key 时 :119 返回 400 "API key is required"，有 key 时到 getAIModel 才被拒，返回 200 加 "Invalid provider"。管理面板路由的 AdminProviderSchema 已经用 ProviderNameSchema 拒绝未知名字，不受影响 | 连接测试在 :71 到 :76 的非空检查里加 `Object.hasOwn(PROVIDERS, provider)`，未知名字统一返回 400 "Invalid provider: <name>. Allowed providers: …"（见 3.4 表和第 5 步的三个用例） |
| Azure 的占位地址（有意变化） | PROVIDER_INFO.azure.defaultBaseUrl 是 "https://your-resource.openai.azure.com/openai"（lib/types/model-config.ts:162），createProviderConfig 把它写进新条目，hasCredentials（lib/provider-setup.ts:108）和对话框的 testBlocker（components/model-config-dialog.tsx:929）按名字识别"还没改过" | Azure 记录不带 defaultBaseUrl，由通用规则"credential 为 apiKey 且记录没有默认地址的服务商必须填地址"覆盖；新条目的地址为空。已经把占位地址存进 localStorage 的旧条目从此被当作填好了地址，Test 会去连 your-resource 这个主机并得到连接错误，这是本变化唯一的用户可见影响，第 5 步说明 |
| 推荐模型列表（有意变化） | SUGGESTED_MODELS 给 19 家各一份手写列表，添加 provider 时自动加入第一个（components/model-config-dialog.tsx:414） | 能在线列模型的 18 家删除手写列表，填好凭据后对话框自动拉取一次；不能在线列模型的 6 家把列表放进记录的 models 字段并保留自动加入第一个的行为。见 3.7 和第 7 步 |

## 3. 目标设计

### 3.1 数据模型：一条 provider 记录

新文件 lib/providers.ts，只含类型和数据，没有任何运行时 import。ModelListStyle 类型从 lib/types/model-config.ts 搬过来。

```ts
// lib/providers.ts: pure data, no runtime imports, safe for client components and every runtime

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

/** One sentence in every UI language; the keys are lib/i18n/config.ts's locales */
export type Copy = Record<"en" | "zh" | "ja" | "zh-Hant", string>

export interface ProviderDef {
    label: string
    sdk: Sdk
    credential: Credential
    /** The picker's group; the order of keys in PROVIDERS is the order inside a group */
    group: ProviderGroup
    /**
     * The server reads <PREFIX>_API_KEY and <PREFIX>_BASE_URL. This is only the
     * spelling of the names: whether the key is required (auto-detection,
     * validation) follows `credential`, and whether the admin panel writes
     * ADMIN_<PREFIX>_API_KEY[_n] follows `fixedCredentials`.
     * null: no key variables (Bedrock, EdgeOne)
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
     * (SGLang's 127.0.0.1) only fills the form: the server never calls it.
     * Missing for a credential "apiKey" provider: the user must enter one
     */
    defaultBaseUrl?: string
    /** The SDK has the official endpoint built in: pass no baseURL unless one is configured */
    sdkKnowsEndpoint?: true
    /** Where users create a key */
    apiKeyUrl?: string
    /** How to list models; missing when a key alone cannot (Bedrock, Vertex, Azure, EdgeOne, Doubao, MiniMax) */
    modelList?: ModelListStyle
    /** The list is public or local: no key needed to list (Ollama, OpenRouter, AIHubMix) */
    listNeedsNoKey?: true
    /** A short hand-written list for providers without modelList; the first one is added with the provider */
    models?: string[]
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
    /** The note shown under the name in the picker (Bedrock: "AWS credentials") */
    note?: Copy
    /** A hint under the base URL field (MiniMax: which path selects which protocol) */
    baseUrlHint?: Copy
    /** The folded options start open: the base URL usually needs changing */
    optionsOpen?: true
}

const defs = {
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
        note: { en: "AWS credentials", zh: "AWS 凭证", ja: "AWS 認証情報", "zh-Hant": "AWS 憑證" },
        models: ["global.anthropic.claude-opus-5-5", /* ... the 22 ids of today's list */],
    },
    // ... the other 21, written in the order the picker shows them
} satisfies Record<string, ProviderDef>

/** The names come from the record's keys; the values are read through the widened ProviderDef type so optional fields can be accessed on any provider */
export type ProviderName = keyof typeof defs
export const PROVIDERS: Record<ProviderName, ProviderDef> = defs
export const PROVIDER_NAMES = Object.keys(PROVIDERS) as ProviderName[]

/** The https default a server may call on its own; a local default only fills the form */
export function publicDefaultUrl(provider: ProviderName): string | undefined
```

为什么要分成 defs 和 PROVIDERS 两步：直接对 satisfies 的结果做 `PROVIDERS[p].note` 这类访问会报 TS2339，因为 satisfies 保留每条记录的字面量类型，联合类型上只有所有记录共有的字段；加宽成 `Record<ProviderName, ProviderDef>` 后字段统一，`switch (PROVIDERS[p].sdk)` 的判别仍是 Sdk 联合，不受影响。

字段语义说明：

- `sdk` 回答"createModel 调哪个工厂"，取代按 provider 名的 switch。其中 "doubao"、"minimax"、"aihubmix" 三个值是服务商专属的，因为这三家各有一段无法用布尔字段表达的规则（Doubao 按模型名选 createDeepSeek，MiniMax 按 URL 路径选协议，AIHubMix 在官方地址用专用 SDK 并附 appCode）。三个专属 case 比一套通用的"按 URL 或模型名选协议"抽象更短、更好懂。kimi 和 mimo 直接写 `sdk: "deepseek"`。
- `credential` 回答"表单收什么、连接测试查什么"，取代 lib/provider-setup.ts:97 hasCredentials、lib/test-model-connection.ts:96 到 :124、components/provider-credentials-fields.tsx 和 components/model-config-dialog.tsx:925 里按名字的分支。
- `envPrefix` 加 `keyEnv` 覆盖今天三处拼变量名的全部情况：21 家按 `<PREFIX>_API_KEY` / `<PREFIX>_BASE_URL`；gateway 的前缀是 AI_GATEWAY；vertexai 的前缀是 GOOGLE_VERTEX（正好对应 GOOGLE_VERTEX_API_KEY 和 GOOGLE_VERTEX_BASE_URL）；google 的 URL 变量是 GOOGLE_BASE_URL 但 key 变量是 GOOGLE_GENERATIVE_AI_API_KEY，所以需要 keyEnv；bedrock 和 edgeone 为 null。ollama 今天在 PROVIDER_ENV_VARS 里是 null，含义是"自动检测和校验时不要求它"，实际它有 OLLAMA_API_KEY。新模型里它的 envPrefix 是 "OLLAMA"，credential 是 "optionalKey"。自动检测和服务器凭据校验按 credential 为 apiKey 或 vertexKey 过滤；aws、optionalKey、none（bedrock、ollama、edgeone）不参与，这个集合与今天 PROVIDER_ENV_VARS 的非 null 条目逐项相同。派生 PROVIDER_ENV_VARS 时，credential 为 aws、optionalKey、none 的 provider 保持 null，所以 ollama 虽有 envPrefix "OLLAMA"，在这张表里仍是 null，两段 'No AI provider configured' 和 'Multiple AI providers configured' 的文案不变。envPrefix 只决定变量名的拼法，是否参与自动检测和校验由 credential 决定，是否进管理面板由 fixedCredentials 决定。因此第 2 步派生 PROVIDER_ENV_VARS 时只对 credential 为 apiKey 或 vertexKey 的 provider 给出变量名，其余为 null（第 2 步的 fixture 测试守住这一点）；第 3 步的 serverCredentialError 对 credential 为 aws、optionalKey、none 的 provider 在没有 apiKeyEnv 时返回 null，对应今天 :555 的 requiredVar 为 null 时不抛错。
- `fixedCredentials` 显式标在 bedrock、vertexai、ollama 三家上。从 credential 推导（非 apiKey 非 none 即固定）看似可行，但将来若加一个本地服务商也用 optionalKey，推导会把它误判为固定凭据，显式标注更安全。
- `sdkKnowsEndpoint` 逐字对应今天的 SDK_KNOWS_ENDPOINT 集合（openai、google、azure、openrouter、gateway、deepseek）。注意 kimi 和 mimo 虽然走 createDeepSeek 但不在集合里，它们的 defaultBaseUrl 要显式传给工厂，所以这是 provider 级别的字段，与 sdk 无关。
- `defaultBaseUrl` 对 Azure 不填。今天的占位值 "https://your-resource.openai.azure.com/openai" 让 hasCredentials、createProviderConfig 和对话框各写一条"还没改过占位值"的 Azure 特判；去掉后 Azure 和 custom 一样落进通用规则"credential 为 apiKey 且没有默认地址，必须填地址"。地址形状改由 Azure 记录的 baseUrlHint 说明（四种语言各一句，内容是 https://<资源名>.openai.azure.com/openai）。
- `ownRequestPath` 逐字对应 chatRequestUrl 的 ownPaths（google、vertexai、azure、bedrock、gateway、minimax、edgeone）。EdgeOne 虽然是 openai-compatible 却在列表里（它的 URL 是站点自己的，显示请求地址没有意义），所以这个字段按 provider 逐条标注，与 sdk 字段无关。
- `logo` 只在 models.dev 的名字与 provider 键不同时填写（今天 PROVIDER_LOGO_MAP 的 19 条里有 11 条与键相同，可以省略，派生出的 PROVIDER_LOGO_MAP 只剩 8 条）。它唯一的读者 components/provider-logo.tsx:24 写 `PROVIDER_LOGO_MAP[provider] || provider`，所以省略同名条目后渲染结果不变；components/model-selector.tsx 已经通过 ProviderLogo 组件渲染 logo（:254、:333），不读这张表。测试按每家的 `logo ?? key` 比较，见第 2 步。sglang（logo: "openai", icon: "server"）、doubao（logo: "bytedance", icon: "sparkles"）与 bedrock 一样同时填两个字段，第 2 步的 fixture 测试会要求 PROVIDER_LOGO_MAP 的派生值与旧表相同。`icon` 取代 components/provider-logo.tsx:14 到 :22 的三个 if。
- `models` 字段仅在没有 modelList 的 6 家上出现（bedrock 22 个、azure 10 个、doubao 9 个、vertexai 7 个、minimax 4 个、edgeone 1 个，共 53 个 id，约 70 行）。能在线列模型的 18 家没有这个字段，对话框在凭据填好后自动拉取，见 3.7 和第 7 步。
- `group`、`note`、`optionsOpen`、`baseUrlHint` 取代 lib/provider-setup.ts 的 PROVIDER_GROUPS、PROVIDER_NOTE_KEYS、OPTIONS_OPEN，以及 provider-credentials-fields.tsx:251 到 :259 的 minimax、mimo 提示分支。note 和 baseUrlHint 是四种语言齐全的文案对象，内容从今天四份字典的 8 个 key 逐字搬来（lib/i18n/dictionaries/zh.json:301、:302、:345 到 :350，其余三份字典同名 key），这 8 个 key 随后从字典删除。组件用 components/canvas/locale-context.tsx 的 useLocale() 取当前语言后读 `note[locale]`。将来再加一家需要地址提示的服务商（MiMo 那种情况），代码改动只有记录里一个字段。
- 记录键的书写顺序就是选择器各组内的显示顺序。核对发现今天 PROVIDER_GROUPS 的组内顺序与 PROVIDER_INFO 的键顺序并不一致：vendors 组是 openai、anthropic、google、deepseek、qwen、doubao、glm、kimi、minimax、mimo，而 PROVIDER_INFO 的键顺序会得到 deepseek、doubao、glm、qwen；aggregators 和 cloud 两组也不同。方案是把记录按选择器顺序书写一次。管理面板"添加 provider"下拉框（app/[lang]/admin/models-section.tsx:529）用 `Object.keys(PROVIDER_INFO)`，顺序会跟着变成与选择器一致，列入待决问题 2。

**保留为独立表的一张及理由。** POPULAR_PROVIDERS 是一个有顺序的 6 元素列表（openai、anthropic、google、deepseek、openrouter、qwen），顺序与记录键顺序不同（openrouter 在 qwen 前），保留为手写列表。推荐模型列表不再是独立表：18 家能在线列模型的服务商改为自动拉取，6 家不能列的把短列表放进记录的 models 字段，理由见 3.7。

**兼容性与过渡。** lib/types/model-config.ts 先 `import { PROVIDERS, type ProviderName } from "@/lib/providers"` 供文件内 ModelConfig、ProviderConfig、createProviderConfig 等处使用，再 `export { PROVIDERS as PROVIDER_INFO, type ProviderName }` 转发给其余 11 个文件；转发导出本身在模块内部不建立绑定，所以两句都要写。PROVIDER_INFO 今天被 12 个文件引用，它们读的 label、defaultBaseUrl、apiKeyUrl、modelList 四个字段都在 ProviderDef 上，而 PROVIDERS 的值类型就是 ProviderDef，所以引用处不用改。其余的表里，十张（ProviderName 联合类型改为 keyof typeof PROVIDERS，FIXED_CRED_PROVIDERS、PROVIDER_LOGO_MAP、ownPaths、SINGLE_SYSTEM_PROVIDERS、PROVIDER_ENV_VARS、SDK_KNOWS_ENDPOINT、PROVIDER_GROUPS、OPTIONS_OPEN、NO_KEY_NEEDED）在第 2 步变成从 PROVIDERS 派生的常量，放在原文件以原名导出；PROVIDER_NOTE_KEYS 是文案 key 的表，记录里存的是文案本身，派生不出来，它和 SUGGESTED_MODELS 在第 2 步原样保留，分别在第 5 步和第 7 步随读者一起改掉：

```ts
// lib/provider-setup.ts, transitional
export const PROVIDER_GROUPS = (["vendors", "aggregators", "cloud", "selfHosted"] as const).map(
    (id) => ({
        id,
        providers: PROVIDER_NAMES.filter((p) => PROVIDERS[p].group === id),
    }),
)
export const OPTIONS_OPEN = PROVIDER_NAMES.filter((p) => PROVIDERS[p].optionsOpen)

// lib/ai-providers.ts, transitional
export const SINGLE_SYSTEM_PROVIDERS = new Set(PROVIDER_NAMES.filter((p) => PROVIDERS[p].singleSystem))
```

这样数据层的改动和界面的改动分在不同步骤，第 5 步的界面改动可以单独回滚而不影响数据层；回滚第 2 步需要先回滚第 5、6 步。读者在第 5 步后直接读字段的派生常量，在第 6 步删除。

### 3.2 从记录选 AI SDK 工厂

createModel（lib/ai-providers.ts:645）的签名不变（Bedrock 除外，见下），switch 的判别式从 provider 名换成 `PROVIDERS[provider].sdk`，每个 case 的内容照搬：

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
        // "bedrock" never reaches createModel: getAIModel calls bedrockModel(modelId, overrides) first, see below
        case "vertex":                 // today's createVertex call at :969
            return createVertex({ apiKey: e.apiKey, ...(e.baseURL && { baseURL: e.baseURL }), ...(e.fetch && { fetch: e.fetch }) })(modelId)
        case "ollama":                 // today's createOllama call at :993
            return createOllama({ ...(e.baseURL && { baseURL: ollamaApiUrl(e.baseURL) }), ...(e.apiKey && { headers: { Authorization: `Bearer ${e.apiKey}` } }), ...(e.fetch && { fetch: e.fetch }) })(modelId)
    }
}
```

Bedrock 在 getAIModel 里先于 createModel 处理：`if (PROVIDERS[provider].sdk === "bedrock") { model = bedrockModel(modelId, overrides) } else { model = createModel(provider, modelId, {...}) }`。bedrockModel 需要 overrides 里的 apiKey、awsAccessKeyId、awsSecretAccessKey、awsSessionToken、awsRegion 五个字段，这些不进 Endpoint，所以它没有成为 createModel 的 case。getAIModel 里的第二个 switch（:863 到 :1073）随之消失。Bedrock 分支里凭据选择和 createAmazonBedrock 调用的 70 行（:864 到 :933）搬进 bedrockModel(modelId, overrides)，内容不动（region 正则、apiKey:"" 和 bedrockRuntimeUrl、ADMIN_AWS_* 优先于 fromNodeProviderChain）；:935 到 :943 的 anthropic.claude beta 选项合并留在 getAIModel 里，按模型 id 判断。Vertex、Ollama 的 key 和 URL 规则进入 resolveEndpoint，工厂调用成为 createModel 的 case。EdgeOne 成为 openai-compatible 加 `credential: "none"` 的普通情况。加一个 OpenAI 兼容服务商时这个函数一字不改。

### 3.3 一个决定 key 和 URL 的函数

lib/ai-providers.ts:609 到 :618 今天已经有一个模块私有的 Endpoint 接口（apiKey、baseURL、headers、fetch、authToken、resourceName、可选的 configuredBaseURL），createModel 和 compatibleModel 读它。方案把它导出并补三个字段：

```ts
// lib/ai-providers.ts

export type KeySource = "client" | "server" | "none"

/** Where and how to call a provider, once credentials are resolved */
export interface Endpoint {
    apiKey?: string
    authToken?: string          // Anthropic Bearer auth (ANTHROPIC_AUTH_TOKEN), server only
    resourceName?: string       // Azure, server resource only
    baseURL?: string            // undefined: the SDK's built-in endpoint
    configuredBaseURL: boolean  // the URL came from the client or a server env var (today optional, becomes required)
    guarded: boolean            // a client-chosen, untrusted URL: wrap fetch in redirectGuardedFetch
    keySource: KeySource        // "server" is what usesServerCredentials answers true for
    selectedKeyEnv?: string     // which apiKeyEnv entry was drawn (array case); getAIModel logs it
    headers?: Record<string, string>
    fetch?: typeof fetch        // set by getAIModel from guarded; resolveEndpoint never fills it
}

/**
 * Whose key the call uses and where it goes. Reads its arguments and
 * process.env, and draws one key with Math.random when apiKeyEnv is an
 * array; never throws, never fetches, never logs. getAIModel decides what to do
 * when a key or URL is missing; usesServerCredentials reads keySource.
 * Callers pass a validated ProviderName: getAIModel after its guard, the chat
 * route via getAIModel's resolvedProvider, testModelConnection after its own
 * Object.hasOwn check. An unknown name is a programming error here.
 */
export function resolveEndpoint(provider: ProviderName, overrides?: ClientOverrides): Endpoint

/**
 * The env var names of a provider's key and base URL, from PROVIDERS. Always the
 * record-derived names (ollama gets OLLAMA_API_KEY, which resolveEndpoint needs);
 * whether the server must have the key is serverCredentialError's question
 */
export function envVarsOf(provider: ProviderName): { apiKey?: string; baseUrl?: string }

/**
 * Why the server lacks this provider's credentials, or null when it has them; same
 * checks and order as today's validateProviderCredentials (detectProvider tests for
 * null, validateProviderCredentials throws the string). With no apiKeyEnv given,
 * aws, optionalKey and none return null at once, like today's unchecked requiredVar === null
 */
function serverCredentialError(provider: ProviderName, apiKeyEnv?: string | string[], baseUrlEnv?: string): string | null
```

resolveEndpoint 的规则按 credential 种类分五支，每支都是今天 getAIModel 里已有的逐行逻辑搬了位置，不新增判断：

1. 客户端 URL：resolveEndpoint 假定 `overrides.baseUrl` 已经由调用方用 normalizeBaseUrl 清理过，函数内部只做 `const clientUrl = overrides?.baseUrl || undefined`，空串视为没有，自己不再调用 normalizeBaseUrl。原因是 normalizeBaseUrl 每次只去掉一个结尾端点路径（".../v1/chat/completions/messages" 第一次得到 ".../v1/chat/completions"，第二次得到 ".../v1"），归一化两次会让 getAIModel 和 usesServerCredentials 看到不同的地址。今天 getAIModel :746 到 :751 和 usesServerCredentials :1159 各归一化一次，重构后仍然各一次，位置不变。
2. `aws`（bedrock）：客户端带 apiKey，或同时带 awsAccessKeyId 和 awsSecretAccessKey，则 keySource 为 "client"，否则为 "server"（包括 ADMIN_AWS_* 和 IAM 角色两种情况，今天在 usesServerCredentials 里都算服务器付费）。apiKey 和 baseURL 不填，Bedrock 的 SDK 参数在 bedrockModel() 里按今天的写法构造。
3. `vertexKey`（vertexai）：有客户端 URL 时 apiKey 只取 overrides.vertexApiKey（:951 到 :953 的规则）；否则 vertexApiKey 优先，其次 GOOGLE_VERTEX_API_KEY。baseURL 调用 resolveBaseURL(vertexApiKey, 客户端 URL, GOOGLE_VERTEX_BASE_URL)。keySource 为有 vertexApiKey 时 "client"，否则 "server"。
4. `none`（edgeone）：apiKey 固定为 "edgeone"（:1008 传的值），baseURL 为 `overrides.baseUrl || "/api/edgeai"`（:1009），headers 透传，keySource "none"。路由和连接测试在调用之前已经用 edgeOneEndpoint(req) 把站点地址放进 overrides.baseUrl，并且只在 `credential === "none"` 时这样做。
5. `optionalKey`（ollama）：有客户端 URL 时 key 只取 overrides.apiKey（:981 到 :983）；否则按 resolveApiKey 的三级优先取 OLLAMA_API_KEY。baseURL 为客户端 URL，否则客户端有 key 时为 Ollama Cloud 的 defaultBaseUrl，否则为服务器变量（:988 到 :992）。keySource 在这一支单独写出，是用到 resolveApiKey 的分支里唯一没有从它的 source 取 keySource 的地方：有客户端 URL 时按 key 是否存在给 "client" 或 "none"；无客户端 URL 时，有客户端 key 为 "client"，否则 `overrides.apiKeyEnv || process.env.OLLAMA_API_KEY` 为真时 "server"，否则 "none"（无 key 的本地 Ollama 不计费）。条件照抄 usesServerCredentials :1174 到 :1178，并在代码里注明为什么这里不能直接用 source：resolveApiKey 在变量为空时也会给 "server"，而 Ollama 今天把"没有任何 key"算作不计费。apiKeyEnv 变量名给了但值为空的边角见待决问题 3。
6. `apiKey`（其余 20 家）：default 分支 :1015 到 :1072 的逻辑原样搬入，四处按名字的判断改为读字段。apiKey 和 keySource 来自同一次 resolveApiKey 调用：它改为返回 `{ value, source }`，source 在返回 overrides.apiKey 时为 "client"，在读 apiKeyEnv 或默认变量时为 "server"（变量为空也算 "server"，与今天 usesServerCredentials 的 `!overrides?.apiKey` 相同）；默认变量名来自 envVarsOf。configuredBaseURL 为 resolveBaseURL(客户端 key, 客户端 URL, 服务器 URL 变量)；baseURL 为 configuredBaseURL，否则 sdkKnowsEndpoint 且不是"`sdk === "openai"` 带客户端 key"时留空，否则 publicDefaultUrl（:1039 到 :1044）。authToken 在记录有 altKeyEnv 且无 apiKey 时取该变量的值（:1062 到 :1064 的 Anthropic 规则）；resourceName 在记录有 resourceNameEnv 且无客户端 key 时取该变量的值（:1067 到 :1069 的 Azure 规则）。keySource 直接取 source，不另写判断。
7. `guarded` 等于 `!!clientUrl && !overrides.trustedBaseUrl`，对所有 provider 相同（:855 到 :858）。

这个函数对合法 provider 名不抛异常的原因：连接测试在请求之前就要问 usesServerCredentials（lib/test-model-connection.ts:128），那时凭据可能不全，必须得到一个布尔值。provider 名本身由调用方先校验（见 3.4 表连接测试一行），chat 路由传的是 getAIModel 返回的 resolvedProvider（app/api/chat/route.ts:239、:245 到 :247），不受影响。所以缺 key、缺 URL 的三条抛错留在 getAIModel 里，表达在结果上，并且各自只对今天抛出它的那个分支对应的凭据类别生效：Vertex 缺 key 抛 :955 到 :960 的原话（credential === "vertexKey"）；"needs a base URL" 的条件保留 :1047 到 :1055 的原话，但只对 credential === "apiKey" 的 provider 检查，条件写成 `!baseURL && (!sdkKnowsEndpoint || (resourceNameEnv && 客户端 key))`，即今天 default 分支覆盖的 20 家加 custom。Bedrock、Vertex、Ollama、EdgeOne 的 baseURL 可以合法为空（Bedrock 不读 URL，Vertex 和 Ollama 用 SDK 内置默认），它们不经过这条检查；Azure 带客户端 key 却没有 URL 由 resourceNameEnv 那一半条件命中，仍在 apiKey 类别内。错误文案不变、位置不变。

调用方的变化：

- getAIModel：模型 id 选择、provider 选择、`if (!isClientOverride) validateProviderCredentials(...)` 三段不变。getAIModel :746 到 :751 把 clientOverrides.baseUrl 归一化成 overrides 的那段也保留，guard 读它，resolveEndpoint 收到的就是这个归一化后的 overrides。顶部 guard（:760 到 :772）的结构不变，三个例外改为读 `PROVIDERS[overrides.provider]?.credential`（见 2.2 第二行）。之后先判断 `PROVIDERS[provider].sdk === "bedrock"`，是则调用 bedrockModel(modelId, overrides)；否则 `const e = resolveEndpoint(provider, overrides)`，按 PROVIDERS[provider].credential 检查上面三条抛错，然后 `createModel(provider, modelId, { ...e, fetch: e.guarded ? redirectGuardedFetch() : undefined })`。resolveEndpoint 的返回值不含 fetch，getAIModel 按 guarded 填入后再传给 createModel；两者共用 Endpoint 类型。数组 apiKeyEnv 的 `[API Key Routing] Selected…` 日志在这里按 e.selectedKeyEnv 打印。Bedrock 的 anthropic.claude beta 合并留在这里。
- usesServerCredentials 变成四行：desktop 判断，`const baseUrl = normalizeBaseUrl(overrides?.baseUrl ?? "")`（今天 :1159 的那一行保留），然后 `return resolveEndpoint(provider, { ...overrides, baseUrl }).keySource === "server"`。"Mirrors…"注释删除。
- usesServerEndpoint（:1132 到 :1145）的三个名字判断改为 `credential === "none"`、`credential === "optionalKey" && !clientBaseUrl && !apiKey` 和 `sdk !== "bedrock"`，其余不动；第 5.1 节的 288 个组合证明答案相同。
- detectProvider 和 validateProviderCredentials：共用 serverCredentialError，它读 keyEnv、altKeyEnv、resourceNameEnv，Anthropic 和 Azure 的 if 只写一次，四段检查的顺序照搬今天 :531 到 :577：数组有值即返回 null（不检查 Azure 地址）；无自定义变量时 Anthropic 看 keyEnv 或 altKeyEnv；单个自定义变量为空直接返回单变量文案，不回退默认变量；最后才是 Azure 地址。文案从记录字段拼出：数组形式用 apiKeyEnv.join(", ")，altKeyEnv 存在且无 apiKeyEnv 时用 `Either ${keyEnv} or ${altKeyEnv} ...`，通用用 `${requiredVar} environment variable is required for ${provider} provider ...`，resourceNameEnv 存在且 key 有值但地址缺失时用 `Azure requires either ${envVarsOf(provider).baseUrl} or ${resourceNameEnv} ...`，四段逐字与 lib/ai-providers.ts:535 到 :574 相同。validateProviderCredentials 抛出返回的文案，detectProvider 只看是否为 null。detectProvider 遍历 credential 为 apiKey 或 vertexKey 的 provider；新增测试断言这个集合等于改动前 PROVIDER_ENV_VARS 非 null 的键集合（21 家），Anthropic 和 Azure 的特例保留。
- globalBaseUrl（:1097 到 :1118）：函数体保留（它对 ollama 和 vertexai 用 getEnvFallback 读设置文件回退、对 bedrock 和 edgeone 返回空、对 azure 按资源名拼地址、对其余用 process.env 的差异是管理面板需要的，必须原样保留），只把 :1113 到 :1116 的变量名拼法换成 envVarsOf(provider).baseUrl。它是 lib/ai-providers.ts 里唯一仍按名字分支的函数。
- lib/admin/providers.ts:92 credEnvNames 的前缀换成 `PROVIDERS[provider].envPrefix`，:88 的判断换成 `fixedCredentials || envPrefix === null`。
- listFallbackUrl：`startsWith("https://")` 换成 publicDefaultUrl(provider)，Ollama 那条改为 `credential === "optionalKey"`。
- resolveApiKey 和 resolveBaseUrlEnv 成为 resolveEndpoint 的私有帮助函数，不再被别处调用。resolveApiKey 的返回值从 `string | undefined` 改为 `{ value?: string; source: "client" | "server"; selectedKeyEnv?: string }`，让 apiKey、authToken（Anthropic）和 keySource 出自同一个决定；第 4a 步的差分测试同时断言 source 与 legacy usesServerCredentials 一致。

### 3.4 界面和路由读能力字段

| 今天的分支 | 改为 |
|---|---|
| lib/provider-setup.ts:97 hasCredentials 按名字 switch（bedrock、vertexai、azure、edgeone、ollama） | 按 `credential` 种类 switch：aws 看 key 或 access key 对加 region；vertexKey 看 vertexApiKey；none 和 optionalKey 为真；apiKey 要求 `!!p.apiKey && (!!defaultBaseUrl || !!p.baseUrl)`。今天 apiKey 类里只有 Azure 没有可用的默认地址，去掉占位值后它和 custom 一样由这条通用规则覆盖，Azure 那个 case 消失。providerStatus 和 :925 的 testBlocker 在用户只填 key 时显示"未填完"，与点 Test 后 getAIModel 报 "needs a base URL" 一致 |
| lib/test-model-connection.ts:96 到 :124 按 bedrock、vertexai、ollama、edgeone 检查凭据 | 先在 :71 到 :76 的非空检查里加 `!Object.hasOwn(PROVIDERS, provider)`，命中时返回 400，文案沿用 getAIModel :803 的 "Invalid provider: <name>. Allowed providers: …"；之后才 `switch (PROVIDERS[provider].credential)`，五种凭据各一句，错误文案不变。请求体的 TestModelRequest 只是类型断言，今天未知名字要到 getAIModel 才被拒，而改读记录后 :80、凭据 switch 和 usesServerCredentials 都会在那之前读 PROVIDERS[provider]，没有这一步会抛 TypeError 并被 catch 转成 200。这是本方案对畸形请求的有意行为变化（今天无 key 返回 400 "API key is required"，有 key 返回 200 加 "Invalid provider"，之后统一为 400 "Invalid provider"），已记入 2.2 节表末。管理面板路由在调用之前已经用 ProviderNameSchema 校验，不受影响 |
| 同文件 :80 `provider === "edgeone" ? edgeOneEndpoint(req) : body.baseUrl` 和 :184 的 EdgeOne cookie、x-access-code 头 | `PROVIDERS[provider].credential === "none"`，两处共用一个局部变量 |
| app/api/chat/route.ts:176 到 :178 isEdgeOne 及其在 :183、:203、:219 的三处使用 | `const onSiteFunction = PROVIDERS[name]?.credential === "none"`，name 是 serverModelConfig.provider、x-ai-provider 头、getServerProvider() 三者的第一个有值者（与今天 :177 相同）；:203 回填的 provider 名改为这个 name。tests/unit/chat-route-edgeone.test.ts 的 4 个用例不改 |
| 同文件 :423 `resolvedProvider === "openai"` | `PROVIDERS[resolvedProvider].sdk === "openai"`，见 2.2 的 SINGLE_SYSTEM_PROVIDERS 一行 |
| app/api/provider-models/route.ts:20 NO_KEY_NEEDED | `PROVIDERS[provider].listNeedsNoKey` |
| components/provider-credentials-fields.tsx:202 ollama 的"可选"标签 | `credential === "optionalKey"` |
| 同文件 :251、:256 minimax、mimo 的地址提示 | `baseUrlHint && baseUrlHint[locale]` |
| 同文件 :265 edgeone 不渲染凭据 | `credential === "none"` |
| 同文件 :108 OPTIONS_OPEN.includes | `optionsOpen` |
| 同文件 :270、:396、:426 到 :433、:448、:482 bedrock 与 vertexai 的两套表单 | `credential === "aws"` 与 `"vertexKey"`。这些仍是分支，但依据是凭据种类；再加一家 AWS 风格的服务商不用改表单 |
| components/settings/provider-picker.tsx:96 PROVIDER_NOTE_KEYS[provider] 加字典查找 | `PROVIDERS[provider].note?.[locale]` |
| components/provider-logo.tsx:14 到 :24 三个 if 加 PROVIDER_LOGO_MAP | 读 `icon`，有则渲染对应 Lucide 图标；否则 `logo ?? provider`。components/model-selector.tsx 已经通过 ProviderLogo 渲染（:21 import，:254、:333 使用），不用改 |
| components/model-config-dialog.tsx:925 到 :932 testBlocker、:300 到 :306 errorHints | errorHints 按 `credential === "aws"`；testBlocker 按 `credential === "aws"` 给 needAws，`credential === "apiKey" && !defaultBaseUrl` 给新的通用文案 needUrl（"先填 API key 和地址"，四种语言），其余 needKey。needAzure 这个 key 删除，Azure 和 custom 共用 needUrl |
| 同文件 :535 EdgeOne 的 origin 拼接、:987 EdgeOne 不渲染凭据表单 | `credential === "none"` |
| 同文件 :376、:403、:414 读 SUGGESTED_MODELS | 第 7 步改读 `PROVIDERS[p].models ?? []`，见该步 |
| lib/types/model-config.ts:634 到 :646 chatRequestUrl 的 anthropic、ollama 特殊路径和 ownPaths | `sdk === "anthropic"` 给 `/messages`，`sdk === "ollama"` 给 ollamaApiUrl 加 `/chat`，其余按 `ownRequestPath`。tests/unit/base-url.test.ts 不改 |
| lib/admin/providers.ts:88、:92 credEnvNames | 读 fixedCredentials 和 envPrefix |
| app/[lang]/admin/models-section.tsx:535 envBlocked 用 FIXED_CRED_PROVIDERS.includes(p) | `PROVIDERS[p].fixedCredentials && envProviders.some(...)` |
| 同文件 :76 读 SUGGESTED_MODELS | 第 7 步改读 `PROVIDERS[p].models`，没有时不渲染"推荐"下拉框 |
| lib/admin/providers.ts:173 validateAdminProviders 遍历 FIXED_CRED_PROVIDERS | 遍历 PROVIDER_NAMES 里 fixedCredentials 为真的 provider，两条错误文案不变；tests/unit 里 33 个管理面板测试不改 |
| lib/server-model-config.ts:9 ProviderNameSchema 和 :84 | `Object.hasOwn(PROVIDERS, val)`（今天的 `val in PROVIDER_INFO` 会放行 "toString" 这类原型链上的名字；顺手改，一个词） |
| lib/provider-models.ts:139 listFallbackUrl 的 ollama、:166 的 aihubmix | `credential === "optionalKey"`、`sdk === "aihubmix"` |

**保留按名字写的地方及理由。** 层外只剩 lib/admin/providers.ts:246 到 :262 和 :288 到 :302 里 bedrock、vertexai、ollama 三家写固定变量名的分支（两个函数各一份，共 6 处比较），它们属于非目标，所有者要求原样保留。层内保留两处：globalBaseUrl 的函数体（管理面板依赖它对各家的差异，见 3.3）和 bedrockModel（本身就是 Bedrock 专用函数，由 `sdk === "bedrock"` 进入）。getAIModel 顶部的 guard、usesServerEndpoint、EdgeOne 的站点端点判断原本打算按名字保留以便审计，所有者决定改读字段，审计依据改为第 0 步快照里"仅 URL 无 key"和 EdgeOne 的全部场景以及 5.1 节的 288 个 usesServerEndpoint 组合。

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
    note: { en: "Any OpenAI-compatible URL and key", zh: "任何 OpenAI 兼容地址和 key", ja: "OpenAI 互換の URL とキー", "zh-Hant": "任何 OpenAI 相容位址和 key" },
    optionsOpen: true,
    singleSystem: true,          // open-source chat templates reject several system messages
},
```

没有 defaultBaseUrl，所以 hasCredentials 在用户只填 key 时返回 false，状态显示"未填完"、Test 按钮给出 needUrl 提示（见 3.4）；绕过界面直接请求时 getAIModel 用现有文案报 "needs a base URL"，列模型报 "needs a base URL to list its models"；chatRequestUrl 在地址下方显示 `…/chat/completions`，用户能看到请求去向。credential 填 apiKey，因为 getAIModel 顶部的 guard 要求自定义地址必须带 key；LM Studio 这类不校验 key 的服务填任意占位字符串即可，这也是 SGLang 用户今天的做法。服务器端对应 CUSTOM_API_KEY 和 CUSTOM_BASE_URL，管理面板自动得到 ADMIN_CUSTOM_API_KEY[_n]。需要同时加的内容：env.example 两行、三语文档一段；选择器提示文案在记录里。它和现有两个选项的差别：选 openai 再填自定义地址走的是 @ai-sdk/openai 的 chat 路径，没有 compatibleModel 的 `<think>` 提取中间件（lib/ai-providers.ts:640），开源模型的推理内容会混进正文；选 sglang 走 compatibleModel 但不在 SINGLE_SYSTEM_PROVIDERS 里（lib/ai-providers.ts:43），多条 system 消息不会合并。custom 同时具备这两点。

协议选择留在预设之外。Anthropic 协议的网关（magpie、New API 的 Anthropic 端点）今天选 Anthropic 再填地址就能用，resolveBaseURL 会把用户 key 发到用户地址；Gemini 协议的网关同理选 Google。为 custom 加协议下拉框要改表单、createModel、chatRequestUrl 三处和客户端存储格式，收益只是少选一次服务商。这里和 magpie 的取舍不同：magpie 的 Provider 为每种协议各存一个 URL（internal/provider/provider.go 的 Speaks()），并按模型名前缀（claude*、gpt-*）决定走哪个协议（Native()）。那是网关需要的，本项目有 AI SDK 按 provider 选协议，一条记录一个 sdk 字段就够。

magpie 值得借的一点：internal/provider/detect.go:43 DetectBase 按协议清理粘贴的 URL（去掉 /chat/completions、/responses、/messages，Anthropic 去 /v1，裸主机加 /v1，Gemini 加 /v1beta）。本项目的 normalizeBaseUrl（lib/types/model-config.ts:611）已经做了去端点路径的部分。"裸主机加 /v1"会改变其他 provider 的行为，列入待决问题 7。

### 3.6 Bedrock、Vertex、Azure、Ollama、EdgeOne 各自变成什么

- **Bedrock**：记录 `sdk: "bedrock", credential: "aws", envPrefix: null, fixedCredentials, ownRequestPath, icon: "cloud", note（"AWS 凭证"四语）, models（今天的 22 个 id）`。getAIModel :864 到 :933 的凭据选择和 createAmazonBedrock 调用成为 bedrockModel(modelId, overrides)，内容不动；:935 到 :943 的 anthropic.claude beta 选项合并留在 getAIModel。bedrockModel 由 getAIModel 直接调用，不经 createModel。resolveEndpoint 对它只回答 keySource。管理面板的 ADMIN_AWS_* 分支原样。
- **Vertex**：记录 `sdk: "vertex", credential: "vertexKey", envPrefix: "GOOGLE_VERTEX", fixedCredentials, ownRequestPath, logo: "google", note（"Express 模式 Key"四语）, models（今天的 7 个 id）`。:951 到 :968 的 key 和 URL 规则进入 resolveEndpoint 第 3 条，缺 key 的抛错留在 getAIModel，createVertex 调用成为 createModel 的 case。buildProviderOptions 的 vertexai 分支不动。
- **Azure**：记录 `sdk: "azure", credential: "apiKey", envPrefix: "AZURE", resourceNameEnv: "AZURE_RESOURCE_NAME", sdkKnowsEndpoint, ownRequestPath, optionsOpen, note（"Key 和资源地址"四语）, baseUrlHint（地址形状四语）, models（今天的 10 个 id）`，没有 defaultBaseUrl。"服务器可用资源名"进 serverCredentialError 和 resolveEndpoint 的 resourceName；"带客户端 key 必须有 URL"的抛错留在 getAIModel，条件由 resourceNameEnv 表达；globalBaseUrl :1106 到 :1112 按资源名拼 URL 的分支原样。hasCredentials 的 Azure case、字典的 needAzure 和对话框 :929 的特判随占位地址一起消失。
- **Ollama**：记录 `sdk: "ollama", credential: "optionalKey", envPrefix: "OLLAMA", fixedCredentials, defaultBaseUrl: "https://ollama.com/api", apiKeyUrl, modelList: "ollama", listNeedsNoKey, optionsOpen, note（"Key 可不填"四语）`。:977 到 :1001 的 key 和 URL 规则进入 resolveEndpoint 第 5 条，ollamaApiUrl 和 Bearer 头的拼装进 createModel 的 case。guard 里"没配 OLLAMA_API_KEY 时允许无 key 自定义地址"的例外改为 `credential === "optionalKey"` 加 envVarsOf 给出的变量名。
- **EdgeOne**：记录 `sdk: "openai-compatible", credential: "none", envPrefix: null, ownRequestPath, logo: "tencent-cloud", note（"不用 Key"四语）, models（今天的 1 个 id）`。:1003 到 :1013 的分支消失，由 resolveEndpoint 第 4 条给出 apiKey "edgeone" 和 baseURL，再走 compatibleModel。edgeOneEndpoint(req) 和路由、连接测试里的 cookie 透传不动，触发条件改为 `credential === "none"`。

### 3.7 models.dev 数据怎么用

所有者的倾向是让 buildProviderOptions 先查 getModelInfo().reasoning 再退回正则，并从目录生成推荐模型。用当前的 lib/model-catalog.json 核对后，本文的建议有两点不同。

**reasoning 判定：维持正则，不读目录。** 用目录里每个 provider 的全部模型对比今天的正则（openai 用 :313 的 `/^(o\d|gpt-([5-9]|[1-9]\d))/`，google 和 vertexai 共用 geminiThinkingOptions 的 `/gemini-?[23]/`）：

| provider | 目录模型数 | 与正则不一致 | 不一致的内容 |
|---|---|---|---|
| openai | 40 | 3 | gpt-daybreak-blue-latest、gpt-daybreak-red-latest、gpt-realtime-2.1：目录说会推理，正则说不会 |
| google | 31 | 7 | deep-research 两个、gemini-flash-latest、gemini-flash-lite-latest、gemma-4 两个：目录说会，正则说不会；gemini-3.5-live-translate-preview 反之 |
| vertexai | 38 | 21 | 13 个 Claude 模型：目录说会推理，但 vertexai 分支设置的是 Google 的 thinkingConfig，对 Claude 无效；另 8 个：gemini-2.5-flash-image 目录说不推理而正则命中，gemini-flash-latest、gemini-flash-lite-latest、openai/gpt-oss-120b-maas、xai/grok-4.20-reasoning、xai/grok-4.3、xai/grok-4.6、zai-org/glm-5.2-maas 目录说会推理而正则不命中（其中两个 gemini-flash 别名接受 thinkingConfig） |
| bedrock | 184 | 77 | Nova 微型模型目录说不推理但正则命中；DeepSeek 等第三方模型目录说推理，但 Bedrock 的 reasoningConfig 只接受 Claude 与 Nova 的格式；该分支只在设置 BEDROCK_REASONING_BUDGET_TOKENS 或 BEDROCK_REASONING_EFFORT 时才加 reasoningConfig |
| azure | 75 | 30 | azure 分支今天不看 modelId，只在设置 AZURE_REASONING_EFFORT 或 AZURE_REASONING_SUMMARY 时对所有模型加同样的选项；此处的 30 是拿 openai 的正则比出来的：15 个 Claude 模型，另 15 个是 DeepSeek、Grok、Kimi、Phi-4-reasoning、Cohere、gpt-chat-latest |

结论是两者回答的问题不同：目录的 reasoning 标记回答"这个模型会不会推理"，现有正则回答"该给 SDK 哪种格式的选项"（例如 Bedrock 的判断区分的是模型厂商家族，决定 reasoningConfig 用 budgetTokens 还是 maxReasoningEffort）。这一结论对 Claude 行成立；vertexai 的 gemini-flash-latest、gemini-flash-lite-latest 等非 Claude 行正是目录能补上正则遗漏的情况，属于待决问题 4 第二个选项的实际收益范围。"先查目录再退回正则"会在 Bedrock 和 Vertex 上发错选项格式，在 openai 和 google 上改变 10 个模型的请求参数（gemma 是否接受 thinkingConfig 没有验证过）。此外目录覆盖不全：sglang、edgeone、atlascloud 没有条目；google 下没有 gemini-2.0-flash（models.dev 已标弃用），而正则仍会为它开 includeThoughts；目录是发布前手动刷新的文件，新模型上线到目录收录之间有空窗，按命名规律写的正则对新模型即时有效。因此本方案不改 buildProviderOptions。可选的后续方向有两个，对应待决问题 4 的第二个和第三个选项。第二个选项是"正则说有就有；正则说没有时，目录明确说有也算有"，这条规则只会增加开启思维链的模型，对 openai 和 google 的 9 个目录条目是行为变化；因为 getModelInfo 忽略大小写并做前缀匹配（lib/model-catalog.ts:25 到 :45），实际受影响的是这 9 个 id 以及以它们开头、后接连字符、冒号或点号的所有变体。第三个选项是在模型设置里让用户显式勾选"推理模型"，根本不用猜。

**推荐模型：能在线列的不再手写，不能列的放进记录。** 今天 SUGGESTED_MODELS 给 19 家各一份手写列表，共 179 个 id、259 行，另 5 家（ollama、glm、qwen、qiniu、kimi）没有条目。它不能从目录生成：目录里 bedrock 有 184 个、openrouter 390 个、gateway 316 个、novita 107 个模型，而推荐列表每家 1 到 24 个、按新旧排序，是人工挑选的结果；lib/model-catalog.json 没有保留 release_date，没有热门度字段；azure 的模型 id 是用户自己的部署名。所有者的决定是按能否在线列模型分两类处理：

- 有 modelList 的 18 家（openai、anthropic、google、ollama、openrouter、aihubmix、deepseek、siliconflow、sglang、gateway、modelscope、glm、qwen、qiniu、kimi、novita、mimo、atlascloud）删除手写列表（其中 13 家今天有列表，共 126 个 id）。用户填好凭据后，设置对话框复用 components/model-config-dialog.tsx:309 handleFetchModels 的拉取逻辑自动拉取一次，用户从结果里挑；添加这些 provider 时不再自动加入第一个模型。服务商的真实列表永远比手写的新，手写列表下线模型的问题随之消失。
- 没有 modelList 的 6 家（bedrock 22 个、azure 10 个、doubao 9 个、vertexai 7 个、minimax 4 个、edgeone 1 个，共 53 个 id）保留短列表，存在记录的 models 字段上（约 70 行），添加时仍自动加入第一个。管理面板的"推荐"下拉框只对这 6 家显示，其余由管理员手输 id；面板的拉取按钮列为可选后续工作（面板里的 key 打码存储，拉取要在服务器端解出真实 key）。

这是有意的界面行为变化，单独成第 7 步，带自己的 e2e 更新。

**models.dev 映射。** scripts/update-model-catalog.mjs 是直接用 node 运行的 .mjs，import TypeScript 记录需要 `node --experimental-strip-types`（本机 Node 24 支持）或 tsx。建议脚本保留自己的映射（:9，21 项），另加一个测试断言它的键集合是 ProviderName 的子集。是否把映射并入记录见待决问题 5。

## 4. 分步迁移

每一步一个 commit 或 PR。后一步依赖前一步（第 2 步依赖第 1 步的记录，第 5、6、7 步依赖第 2 步的字段），所以回滚的单位是"已合入的前缀"：出问题时从最新一步开始按逆序 `git revert`，回到最近一个通过了基线门禁的提交。每步结束时运行"基线门禁"：

```
npx vitest run
npx tsc --noEmit
npm run check
```

本文修订时全部单元测试为 63 个文件 723 个用例，约 13 秒跑完，与 .github/workflows/test.yml:33、:36、:39 的 CI 命令一致（CI 里的测试命令是 `npm run test -- --run`，等价于 `npx vitest run`）。核对时 tests/unit/canvas-import-boundary.test.ts 有一个用例在本机因 esbuild 打包环境失败，与 provider 层无关。

### 第 0 步：先把现状录下来（只加测试）

- 文件：新增 tests/unit/provider-matrix.test.ts 和它生成的 tests/unit/__snapshots__/provider-matrix.json；新增 tests/unit/provider-legacy.test.ts。约 300 行测试代码，快照约 3900 条记录（主体 24 × 15 × 9 = 3240 条，加下文的额外行约 650 条）。
- 内容：
  1. 行为快照。矩阵主体是 24 个 provider × 15 种客户端 override 形状 × 9 种服务器环境。15 种形状是：无；仅 key；仅 URL；key 加 URL；URL 为 "/"；URL 带叠加端点后缀 "https://u.example/v1/chat/completions/messages"（normalizeBaseUrl 归一化一次和两次结果不同，用来证明只归一化了一次）；apiKeyEnv 指向有值的单个变量；apiKeyEnv 指向空变量；apiKeyEnv 为数组且一项有值一项缺失；apiKeyEnv 为数组且全部缺失；apiKeyEnv 加 baseUrlEnv；AWS 成对 key；AWS 只给 awsAccessKeyId；vertexApiKey 加 URL；trustedBaseUrl 加 URL。9 种环境是：空；`<P>_API_KEY`；key 加 `<P>_BASE_URL`；OLLAMA_API_KEY；AZURE_RESOURCE_NAME；ANTHROPIC_AUTH_TOKEN；ADMIN_AWS_*；NEXT_AI_DRAWIO_DESKTOP=1；ALLOW_PRIVATE_URLS=false（这一种走真实的 redirectGuardedFetch 路径作为对照）。Azure 数组形式且无 AZURE_RESOURCE_NAME 的组合由"空"和"`<P>_API_KEY`"两种环境自然覆盖。用 vitest 把全部 SDK 工厂 mock 掉（tests/unit/ai-providers-credentials.test.ts:17 到 :57 已这样做了 google-vertex、openai、azure、amazon-bedrock、ollama、openrouter 六个，再补 anthropic、google、deepseek、openai-compatible、aihubmix、gateway 和 ai 包的 wrapLanguageModel）。对每个组合记录：哪个工厂被调用、传入的选项、openai 走的是 chat 还是 responses、providerOptions、抛出的错误文本，以及 usesServerCredentials、usesServerEndpoint（isPrivateUrl 按主机名 mock）、globalBaseUrl、chatRequestUrl 的返回值。函数值记为标签：对 @/lib/ssrf-protection 做部分 mock，redirectGuardedFetch 固定返回一个带标记的哨兵函数，工厂收到该哨兵即把 fetch 记为 "guarded"，否则记 "none"（若不这样 mock，前 8 种环境里 redirectGuardedFetch 恒返回 undefined，守卫参数的遗漏不会改变快照）；Bedrock 的 credentialProvider 记为 "client-key-throw"；fromNodeProviderChain 已被 mock 成字符串 "node-chain"，原样记录。矩阵主体每个 provider 用的模型 id 写在测试文件自己的常量 MATRIX_MODEL_IDS 里（从今天 SUGGESTED_MODELS 的第一个 id 抄来，没有推荐列表的 provider 用 "test-model"），所以第 7 步删除 SUGGESTED_MODELS 时快照不受影响。Math.random 固定为 0；另加两个定向用例：数组 apiKeyEnv 全部有值时，Math.random 返回 0 和 0.999 分别选到首项和末项；数组全部缺失时回退到默认变量。整体用 toMatchFileSnapshot 存成一个 JSON。
  2. 额外行，约 650 条。（a）无 provider 的行：overrides 不带 provider、AI_PROVIDER 未设，环境分别为 21 家各只设自己的 key 变量（含只设 GOOGLE_VERTEX_API_KEY）、Vertex 与 OpenAI 同时设、OLLAMA_API_KEY 单独设、一个 key 都没有，共 24 行，记录 getServerProvider() 的返回值和 getAIModel 抛出的完整错误文本（包含 'No AI provider configured' 的变量列表和 'Multiple AI providers configured' 的括号内容）；另加 AI_PROVIDER=<p> 且 overrides 无 provider、环境为空的 24 行，记录成功或错误文本（守住 ollama、bedrock、edgeone 无 key 不报错）。（b）模型 id 探针：openai 用 gpt-5 和 gpt-4o 各把它那 135 个组合再跑一遍，记录 chat 与 responses 的选择（270 行）；doubao 用 deepseek-v3 和 doubao-seed 各再跑一遍（270 行）；minimax 把带客户端 URL 的 4 种形状用含 /anthropic 的地址再跑一遍（36 行）。（c）providerOptions 探针：对 openai 和 google 各取"无 override、`<P>_API_KEY` 已设"这一个场景，分别对下列模型 id 各记一行 providerOptions：3.7 节表中的 9 个目录 id（openai 3 个、google 6 个），每家一个正则命中的 id（gpt-5、gemini-2.5-flash），一个目录没有的 id（gpt-unknown、gemini-unknown），以及一个大小写或后缀别名（GPT-Realtime-2.1、gemini-flash-latest-001）。共 24 行，列表写进测试文件的常量 REASONING_PROBE_IDS。
  3. 差分测试骨架：把 usesServerCredentials 和 usesServerEndpoint 的当前函数体原文复制到测试文件作为 legacy 版本，按第 5.1 节的等价类全部枚举逐一比对。此时新旧是同一份代码，测试必然通过；它的价值在第 1 到 4c 步。
  4. 表的一致性测试：13 张表里 `Record<ProviderName, …>` 类型的键必须齐全，列表类型的元素必须都在 ProviderName 内（tests/unit/provider-setup.test.ts:26 已检查 PROVIDER_GROUPS，复用）。
- 测试门：基线门禁通过；新测试通过；快照文件进入版本库。
- 行为检查：无生产代码改动，`git diff --stat -- lib app components` 为空。

### 第 1 步：样例，只迁移 Atlas Cloud、Novita、Qiniu

- 文件：新增 lib/providers.ts（Sdk、Credential、Copy、ProviderDef 类型，PROVIDERS 记录只含三条，约 120 行）；新增 tests/unit/providers.test.ts 约 40 行。lib/types/model-config.ts、lib/ai-providers.ts、lib/provider-setup.ts 里的旧表一字不动。差异约 +160 / 0。
- 做法：这一步 ProviderName 联合类型仍然手写，没有任何生产代码读取 PROVIDERS。测试 import 旧表，对三家逐项比对：PROVIDER_INFO 条目只比较 label、defaultBaseUrl、apiKeyUrl、modelList 四个字段（toMatchObject）；logo 比较 `PROVIDERS[p].logo ?? p` 与旧 `PROVIDER_LOGO_MAP[p] || p`；PROVIDER_ENV_VARS、SINGLE_SYSTEM_PROVIDERS、PROVIDER_GROUPS 的条目与旧表深相等。难例的记录写法见 3.1（bedrock 完整字面值）、3.5（custom）和 3.6（Vertex、Azure、Ollama、EdgeOne），所有者在此处决策时一并对照。

- 给所有者看的对比，以 Qiniu 为例。改动前它出现在 5 处（Qiniu 没有 SUGGESTED_MODELS 条目，该表是 Partial 的，glm、qwen、kimi、ollama 也没有）：

```
lib/types/model-config.ts:22      | "qiniu"
lib/types/model-config.ts:231     qiniu: { label: "Qiniu", defaultBaseUrl: "https://api.qnaigc.com/v1", apiKeyUrl: "https://www.qiniu.com/ai/models", modelList: "openai" }
lib/ai-providers.ts:48            "qiniu",            (SINGLE_SYSTEM_PROVIDERS)
lib/ai-providers.ts:471           qiniu: "QINIU_API_KEY",
lib/provider-setup.ts:41          "qiniu",            (PROVIDER_GROUPS aggregators)
```

  改动后它出现在 2 处：ProviderName 联合类型里的成员 "qiniu"（本步仍手写在 lib/types/model-config.ts:22，第 2 步起由记录键推出），以及新记录：

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

  Novita 同理（logo 与键相同，按 3.1 的规则不写 logo 字段），Atlas Cloud 同理（`logo: "openai"`，无 singleSystem）。随 PR 附一张表，列出三家在每张旧表里的旧值和新记录派生出的值，逐项相同。本步的目的只是证明三家的记录能派生出与旧表相同的值；此时 ProviderName 仍是手写联合类型，旧表也还在，新增 provider 仍要改旧表和联合类型。"新增一家只改一条记录加 env.example（第 3 行的 Options 列表和该家的两行配置）"要到第 2 步把 ProviderName 改为 `keyof typeof PROVIDERS`、十张表派生之后才成立，见第 6 步的新增 provider 文档。

- 测试门：第 0 步快照逐字节不变（本步没有任何生产代码读取 PROVIDERS，所以快照按构造不变，`git diff --stat -- app components` 为空）；基线门禁全绿；tests/unit/ai-providers.test.ts 的 "Atlas Cloud provider" 3 个用例不改；新增 tests/unit/providers.test.ts 的比对通过。
- 行为检查：`npx playwright test tests/e2e/settings-providers.spec.ts tests/e2e/settings-bedrock.spec.ts tests/e2e/provider-models.spec.ts tests/e2e/model-test.spec.ts` 通过；在设置里添加 Novita，拉模型列表，测一个模型。

所有者在此处决定是否继续。

### 第 2 步：其余 21 家进记录，十张表变成派生常量

- 文件：lib/providers.ts 补齐到 24 条并按选择器顺序书写，6 家带 models 列表，8 家带 note 或 baseUrlHint 文案对象（约 +350 行）；lib/types/model-config.ts 删除 ProviderName 联合、PROVIDER_INFO、FIXED_CRED_PROVIDERS、PROVIDER_LOGO_MAP、ModelListStyle 的字面值，改为转发导出和派生常量，SUGGESTED_MODELS 原样留在原处（约 −200 / +30）；lib/ai-providers.ts 的 SINGLE_SYSTEM_PROVIDERS、PROVIDER_ENV_VARS、SDK_KNOWS_ENDPOINT 改派生（约 −50 / +15）；lib/provider-setup.ts 的 PROVIDER_GROUPS、OPTIONS_OPEN 改派生，POPULAR_PROVIDERS 和 PROVIDER_NOTE_KEYS 不动（约 −45 / +15）；app/api/provider-models/route.ts 的 NO_KEY_NEEDED 改派生（−5 / +2）。ProviderName 改为 `keyof typeof PROVIDERS`。差异约 +410 / −300（第 1 步没有删任何旧表项，三家样例的旧表项也在本步删除）。
- 新增测试：tests/unit/providers.test.ts 扩展，把第 2 步之前 13 张表的字面值冻结成一份 fixture（从第 1 步的代码直接复制）。FIXED_CRED_PROVIDERS、SINGLE_SYSTEM_PROVIDERS、PROVIDER_ENV_VARS、SDK_KNOWS_ENDPOINT、OPTIONS_OPEN、NO_KEY_NEEDED、ownPaths 断言派生常量与 fixture 深相等。PROVIDER_INFO 是 PROVIDERS 本身，多出 sdk、credential 等字段，只比较 label、defaultBaseUrl、apiKeyUrl、modelList 四个字段的投影（Azure 的 defaultBaseUrl 例外：fixture 里有占位值，记录里没有，这一处差异在测试里显式列为预期）。PROVIDER_LOGO_MAP 的派生值只有 8 条（logo 与键相异的那些），对 24 家逐个断言 `PROVIDERS[p].logo ?? p` 等于 fixture 的 `PROVIDER_LOGO_MAP[p] || p`。文案对象逐字核对：对 PROVIDER_NOTE_KEYS 里的 6 家，`PROVIDERS[p].note[lang]` 等于该语言字典 modelConfig 下对应 key 的值，四种语言都比；minimax、mimo 的 baseUrlHint 同样比 minimaxBaseUrlHint、mimoBaseUrlHint。models 字段逐字等于 SUGGESTED_MODELS 里那 6 家的数组。键顺序只在可观察的地方断言：PROVIDER_GROUPS 每组的 providers 数组与 fixture 逐项相等（toEqual 对数组比较顺序），POPULAR_PROVIDERS 不变；其余表的键序随 PROVIDERS 的书写顺序变化，见待决问题 2。另加两个长期保留的断言：credential 为 apiKey 或 vertexKey 的 provider 集合等于改动前 PROVIDER_ENV_VARS 非 null 的键集合（21 家）；Copy 类型的键集合等于 lib/i18n/config.ts 的 i18n.locales。这份 fixture 在第 6 步删除旧表时一并删除，两个长期断言保留。
- 测试门：快照不变；fixture 相等测试通过；tests/unit/provider-setup.test.ts 的 "hold every provider exactly once" 自然通过；`npx tsc --noEmit` 无错，特别关注 `keyof typeof PROVIDERS` 推导后所有 `Record<ProviderName, …>` 与 `Partial<Record<…>>` 的使用点；tsc 门禁覆盖 lib/types/model-config.ts 内部对 ProviderName、PROVIDER_INFO 的引用，以及 12 个读取点对 defaultBaseUrl、modelList 等可选字段的访问。
- 行为检查：设置页打开 provider 选择器，分组和顺序与改动前的截图一致。管理面板"添加 provider"下拉框，以及 getAIModel 的四段错误文案（lib/ai-providers.ts:803 'Allowed providers'、:839 'Supported providers'、:817 到 :829 'No AI provider configured' 的变量清单、:832 'Multiple AI providers configured' 的列表）中 provider 的排列顺序会变为选择器顺序，这是本步明确接受的可见变化，见待决问题 2；为这四段文本新增 tests/unit/ai-providers-messages.test.ts（或在 provider-matrix 中增加一个非法 provider 名的场景），期望文本在本步 PR 内一并更新。

### 第 3 步：环境变量名与服务器凭据判断合一

- 文件：lib/ai-providers.ts（新增 envVarsOf 和 serverCredentialError；detectProvider、validateProviderCredentials、globalBaseUrl、default 分支 :1022 到 :1025 改为调用它们）；lib/admin/providers.ts（credEnvNames 读 envPrefix 和 fixedCredentials，并加 export，它今天在 :84 未导出，测试要用）。差异约 +40 / −60。
- 新增测试：credEnvNames 对 24 家的输出表（tests/unit/admin-providers.test.ts 已覆盖 openai、openrouter、bedrock、vertexai、ollama、gateway，补齐其余，期望值在改动前先生成）。serverCredentialError 八个用例，在改动前先对今天的 validateProviderCredentials 写好并通过：Anthropic 只有 ANTHROPIC_AUTH_TOKEN 返回 null；Anthropic 给了自定义 apiKeyEnv 且该变量为空时返回单变量文案，即使 ANTHROPIC_API_KEY 已设置；任一 provider 的单个自定义变量为空时不回退默认变量；Azure 只有 key 没有地址返回 Azure 地址文案；Azure 由服务器模型自己的 baseUrlEnv 提供地址返回 null；Azure 数组形式 apiKeyEnv 有一个有值且没有任何地址变量时返回 null（今天 :539 的提前返回）；数组全部为空返回数组文案；Azure 的 key 和地址都缺时返回单变量文案（先检查 key，再检查地址的顺序）。若所有者希望收紧 Azure 数组配置也要求地址，作为独立 commit 的有意行为变更处理，并在快照里标注。自动检测补三个用例：只设 GOOGLE_VERTEX_API_KEY 时 getServerProvider() 返回 "vertexai"；Vertex 与 OpenAI 同时配置时 getAIModel 报 "Multiple AI providers configured (openai, vertexai)"；AI_PROVIDER=ollama 且无任何 key 时 validateProviderCredentials 不抛错。
- 测试门：快照不变（快照包含错误文本，四段凭据错误文案（数组、Either、单变量、Azure 地址）逐字不变）；基线门禁；credEnvNames 表。
- 行为检查：管理面板添加一个 Qiniu 条目和一个 Gateway 条目并保存，检查 settings.json 旁写出的变量名仍是 ADMIN_QINIU_API_KEY 和 ADMIN_AI_GATEWAY_API_KEY。

### 第 4 步：resolveEndpoint 上线，getAIModel 的第二个 switch 消失

拆成三个小 PR，每个都有同样的门禁。

- 4a. 在 lib/ai-providers.ts 新增 resolveEndpoint（约 90 行），暂无调用方；resolveApiKey 按 3.3 改为返回 `{ value, source, selectedKeyEnv }`，它今天的两个调用方（:983、:1018）在同一 commit 里改读 .value。新增 tests/unit/resolve-endpoint.test.ts，差分测试只断言三件事：（1）对第 5.1 节按等价类枚举的全部 30720 个组合，`!isDesktop && resolveEndpoint(...).keySource === "server"` 与 legacy usesServerCredentials 相等（桌面判断留在包装函数里，4c 之前包装函数尚未改写，所以在这里显式补上），resolveApiKey 返回的 source 同时与 legacy 一致；（2）对快照矩阵里的每个场景，`guarded` 与快照记录的工厂是否收到哨兵 fetch 相等（AIHubMix 官方地址一例按现状例外）；（3）openai 的 `configuredBaseURL` 与快照记录的 chat/responses 选择相等。apiKey、baseURL、authToken、resourceName 的正确性由 4b 的"快照不变"门禁证明：快照比较的是 createModel 之后送到 SDK 工厂的最终参数，而 Ollama 的 ollamaApiUrl 与 Authorization 头、MiniMax 的 normalizeMiniMaxBaseURL、AIHubMix 官方地址时省略 baseURL、Azure 有 URL 时省略 resourceName 这些变换都发生在 createModel 内，resolveEndpoint 的返回值不应也无法与工厂参数逐字段相等。矩阵的客户端 URL 列包含一个叠加端点后缀的值，4b 据此断言 SDK 工厂收到的 baseURL 与今天 getAIModel 的结果逐字相同。Bedrock 场景只参与第（1）项。门禁：差分测试通过。若发现任何不一致，以旧行为为准修改 resolveEndpoint，或列入待决问题。差异约 +90 / +120（测试）。
- 4b. getAIModel 的 bedrock、vertexai、ollama、edgeone、default 五个分支换成一个 Bedrock 判断加一次 resolveEndpoint 调用加 createModel；createModel 的 switch 改为按 sdk，vertex、ollama 两个 case 加入，bedrockModel() 在 getAIModel 里按 sdk === "bedrock" 调用；三条抛错按 3.3 节保留；顶部 guard 的三个例外改读 credential（2.2 第二行）。差异约 +130 / −250（Bedrock 的 70 行是搬动）。门禁：快照不变（含"仅 URL 无 key"的全部 216 行）；tests/unit/ai-providers-credentials.test.ts 的 26 个用例和 tests/unit/ai-providers.test.ts 的 "Ollama API key security" 7 个用例不改。
- 4c. usesServerCredentials 改为读 keySource；usesServerEndpoint 改读 credential 和 sdk；listFallbackUrl 改用 publicDefaultUrl 和 credential；resolveApiKey、resolveBaseUrlEnv（今天在 lib/ai-providers.ts :156、:192，本来就没有导出，文件外无调用）此后只被 resolveEndpoint 调用，getAIModel 和 usesServerCredentials 里对它们的直接调用删除。差异约 +20 / −50。门禁：快照不变；差分测试通过后，本步最后一个 commit 删除 tests/unit/provider-legacy.test.ts 里的 legacy 副本和差分用例（usesServerEndpoint 的 288 组合改为对照快照里记录的返回值，保留在 provider-matrix 里）；tests/unit/provider-models.test.ts 19 个用例不改。
- 行为检查：对照 2.2 节的表逐条勾选；用一个真实 key 跑 chat 路由，确认服务器日志里 `[AI Provider] Initializing` 之后的请求 URL 与改前一致。

### 第 5 步：界面、连接测试与路由读能力字段

- 文件：lib/provider-setup.ts（hasCredentials）、lib/test-model-connection.ts（凭据检查、EdgeOne 判断和 Object.hasOwn 校验）、app/api/chat/route.ts（onSiteFunction 和 `sdk === "openai"`）、components/provider-credentials-fields.tsx、components/settings/provider-picker.tsx、components/provider-logo.tsx、components/model-config-dialog.tsx（:925、:300 到 :306、:535、:987）、app/[lang]/admin/models-section.tsx（:535 envBlocked）、lib/admin/providers.ts（:173 validateAdminProviders）、lib/types/model-config.ts（chatRequestUrl）、lib/provider-models.ts（:166）、lib/server-model-config.ts（:9、:84）、lib/i18n/dictionaries/{en,ja,zh,zh-Hant}.json（删除 8 个服务商专属 key 和 needAzure，加 needUrl）。按 3.4 节的表执行，一个文件一个 commit；picker 改读记录文案、删除 PROVIDER_NOTE_KEYS 和 8 个字典 key 在同一个 commit。差异约 +90 / −130。
- 新增测试：hasCredentials 对 24 个 provider 的结果表（tests/unit/provider-setup.test.ts:57 已有 10 组输入，扩成全表，期望值改动前生成；Azure 两行按新规则写：只有 key 为 false，key 加任意地址为 true；第 8 步加入 custom 两行）。chatRequestUrl 已在第 0 步快照里，不另写表。tests/unit/validate-model-route.test.ts 加三个不可信输入用例：provider 为 "nope" 带 key、"nope" 不带 key、"toString" 带 key，都期望 400 且文案以 "Invalid provider" 开头；这三个用例在改连接测试的 commit 里一起加（它们记录的是该 commit 引入的新答案）。tests/unit/provider-setup.test.ts 的 "have their notes in every language" 删除，由 Copy 类型和第 2 步的键集合断言代替。
- 有意变化：Azure 占位地址消失（2.2 表倒数第二行）。tests/e2e/settings-providers.spec.ts:552 "Azure needs its resource URL before it counts as connected" 今天把占位地址存进种子配置并断言 :579 的 needAzure 文案；改为种子不带地址、断言新的 needUrl 文案，与 hasCredentials 的 commit 同时提交，是本方案第一处有意修改的现有 e2e 断言。已存占位地址的旧条目从此被当作填好了地址，在该 commit 的说明里写明。
- 测试门：快照不变（chatRequestUrl 在快照里）；基线门禁；四个 e2e 文件（见 5.3）的 56 个用例通过（settings-providers.spec.ts 点击 `pick-provider-<name>` 按钮并检查凭据表单，provider-models.spec.ts 走完拉模型、加入模型、测试流程，含 :449 "Bedrock can be tested and used with an API key alone"；tests/unit/chat-route-edgeone.test.ts 4 个和 tests/unit/validate-model-route.test.ts 里 "testing EdgeOne" 的 2 个用例证明 EdgeOne 的站点端点和 cookie 透传不变）。
- 行为检查：设置页逐个打开 bedrock、vertexai、azure、ollama、edgeone、minimax、mimo 的凭据表单，与改动前截图对比字段、提示和图标；切换四种界面语言，选择器里 6 家的提示和 minimax、mimo 的地址提示与改前逐字相同。

### 第 6 步：删除过渡代码，写"如何新增 provider"

- 文件：lib/types/model-config.ts 删除已无读者的派生常量 FIXED_CRED_PROVIDERS 和 PROVIDER_LOGO_MAP（PROVIDER_INFO 的转发导出保留，见待决问题 1；SUGGESTED_MODELS 留到第 7 步）；lib/provider-setup.ts 删除 OPTIONS_OPEN 派生常量（PROVIDER_GROUPS 保留，filterProviderGroups 用它）；app/api/provider-models/route.ts 删除 NO_KEY_NEEDED；删除第 2 步的 fixture 测试，保留"参与自动检测的集合等于 21 家"和 Copy 键集合两个断言作为长期守卫；docs/{cn,en,ja}/ai-providers.md 末尾加一节"如何新增 provider"（三语各约 15 行：lib/providers.ts 加一条记录，需要提示文案时在记录里写四种语言，env.example 加两行，本文档加一段）；新增一个测试断言每条记录的 envPrefix 或 keyEnv 推出的变量名都出现在 env.example 里（bedrock 和 edgeone 除外），env.example 本身继续手写。约 −110 行。
- 测试门：快照不变；全部单元测试与 e2e 通过；`npx tsc --noEmit`、`npm run check` 无错。

### 第 7 步（有意的界面行为变化）：推荐模型列表改为在线拉取

- 文件：lib/providers.ts（ProviderDef 的 models 字段在第 2 步已经存在，本步没有改动）；lib/types/model-config.ts 删除 SUGGESTED_MODELS（−260 行）；components/model-config-dialog.tsx（:376、:403、:414 三处改读 `PROVIDERS[p].models ?? []`；新增一个 effect：当前 provider 有 modelList、hasCredentials 为真、且没有用当前凭据拉过列表时，调用一次 handleFetchModels；handleAddProvider 只在记录有 models 时自动加入第一个）；app/[lang]/admin/models-section.tsx:76 改读 `PROVIDERS[p].models`，没有时不渲染"推荐"下拉框。差异约 +40 / −280。
- 用户看到的变化：添加 OpenAI 这类服务商后，第二步"模型"为空，填好 key 的瞬间列表自动拉取并打开选择器；拉取失败时显示现有的错误提示，手输模型 id 的输入框（:478 handleAddModel）照旧可用。添加 Bedrock 这类服务商与今天相同，第一个推荐模型自动加入。管理面板里 OpenAI 这类服务商的"推荐"下拉框消失，管理员手输 id。
- 新增测试：tests/unit/model-config-dialog.test.tsx 三个用例：添加有 modelList 的 provider 不自动加模型、填好凭据后恰好发出一次 /api/provider-models 请求（凭据不变时切回该 provider 不重复拉）、添加 bedrock 自动加入记录 models 的第一个。e2e 三处改动与本步同一个 commit：tests/e2e/settings-providers.spec.ts:60 "The first suggested model is added"（DeepSeek 添加后改为 mock /api/provider-models、填 key 后从选择器挑 deepseek-v4-pro），:656 "OpenAI has suggested models: they come back once the key changes"（改为换 key 后自动拉取一次并显示新列表），tests/e2e/settings-tabs-sync.spec.ts:78 "GLM has no suggested models"（改为另一标签页换 key 后自动重新拉取）。这是本方案第二处有意修改的现有 e2e 断言。
- 测试门：快照不变（矩阵用的是测试自己的 MATRIX_MODEL_IDS；自动拉取发生在浏览器里，对服务器端没有影响）；基线门禁；56 个 e2e 用例加 tests/e2e/settings-tabs-sync.spec.ts 的 8 个用例通过（含上面三处更新后的版本）。
- 行为检查：设置页添加 OpenAI，填入 key，确认列表自动拉取并能挑选；添加 Bedrock，确认第一个推荐模型已加入且下拉里是记录里的 22 个；管理面板添加 OpenAI 条目，确认没有"推荐"下拉框但能手输 id；添加 Bedrock 条目，确认"推荐"下拉框仍在。

### 第 8 步（可选，待所有者按待决问题 6 决定）：custom 预设

- 文件：lib/providers.ts（+14 行，含四语 note）；env.example（+3 行）；docs/{cn,en,ja}/ai-providers.md 各一段。差异约 +40 行，全是数据和文档。
- 测试门：第 6 步的 env.example 覆盖测试和 Copy 类型自动覆盖它；快照新增 custom 的 135 行，其余行不变；一个安全用例确认 custom 带 URL 不带 key 被 guard 拒绝；hasCredentials 表加两行（只有 key 为 false，key 加 URL 为 true）；e2e 新增一个用例：选 custom、填本地地址和占位 key、看到请求地址提示。tests/e2e/settings-providers.spec.ts:116 到 :117 的 `toHaveCount(24)` 改为 25，与 custom 记录在同一个 commit 里，是本方案第三处有意修改的现有 e2e 断言。
- 行为检查：用本机的 LM Studio 或一个 vLLM 容器填 URL 和 key，拉模型、测试、对话。

### 第 9 步（可选，行为变更，需所有者单独批准）：目录辅助 reasoning 判定

- 只在所有者选择待决问题 4 的第二个选项（目录只能增加开启思维链的模型）时做。文件：lib/ai-providers.ts buildProviderOptions 的 openai 正则（:313）和 geminiThinkingOptions 的 google 调用抽成 isReasoningModel(provider, modelId)，规则为"正则说有就有；正则说没有时，目录明确说有也算有"（约 +15 / −6）；本步的范围是 openai 和 google 两个分支，vertexai 的 gemini-flash-latest、gemini-flash-lite-latest 若要纳入，另提；tests/unit/model-catalog.test.ts 新增一个用例打印目录与正则的全部不一致模型 id，让每次目录刷新时的差异可见。
- 测试门：矩阵主体逐字节不变；REASONING_PROBE_IDS 那 24 行里，providerOptions 发生变化的必须恰好是 9 个目录 id 加 2 个别名行（别名经 getModelInfo 的大小写和前缀匹配落到目录条目上），正则命中行和目录没有的行不变。另加 tests/unit/model-catalog.test.ts 的参数化用例：isReasoningModel 对 9 个目录 id 返回 true，对两个正则命中 id 返回 true，对两个未知 id 返回 false，对两个别名返回 true。
- 行为检查：对受影响的模型用真实 key 各试一个（至少 gemini-flash-latest 和一个 gemma），确认 thinkingConfig 和 reasoningSummary 不被拒绝。

## 5. 测试与验证

### 5.1 两个配额函数的同一性证明

- usesServerCredentials 的输入按等价类枚举：provider 24 个；overrides 里 apiKey 有或无、baseUrl 取无、"/"、"https://u.example"、"https://u.example/v1/chat/completions/messages"（归一化一次和两次结果不同，用来证明只归一化了一次）四种、awsAccessKeyId 与 awsSecretAccessKey 各自有或无（四种组合）、vertexApiKey 有或无、apiKeyEnv 取无、有值的单个变量、无值的单个变量、数组一项有值一项缺失、数组全部缺失五种（Math.random 固定为 0）；环境里 OLLAMA_API_KEY 有或无、NEXT_AI_DRAWIO_DESKTOP 为 "1" 或无。共 24 × 2 × 4 × 4 × 2 × 5 × 2 × 2 = 30720 个组合，按上述等价类全部枚举，新旧实现逐一比对，运行时间毫秒级。第 3.3 节第 5 条提到的 Ollama 边角在这里会被原样守住。这个域只含 24 个合法名字，所以它证明不了未知名字的行为；未知名字由连接测试的 Object.hasOwn 检查和第 5 步的三个用例覆盖，差分测试不扩域。
- usesServerEndpoint 的输入域：provider 24 个、clientBaseUrl 取空、公网地址、私网地址三种（isPrivateUrl 按主机名 mock）、apiKey 有或无、桌面标记有或无，共 288 个组合。第 4c 步把它的三个名字判断改为读字段，这份测试证明每个输入的答案相同；第 4c 步起这 288 个组合改为对照第 0 步快照里记录的返回值，保留在 provider-matrix 里。
- resolveBaseURL 本身不改，现有 9 个用例保留。
- 以上测试在第 0 步写好，第 4c 步之前每一步运行。4c 之后 legacy 副本删除：若保留，以后任何有意的配额规则调整都要同时改生产函数和测试里的副本，这正是本方案要消除的"手工镜像"（第 7 节）；两个函数对每个场景的答案已记录在第 0 步快照里，有意改规则时更新快照即可。

### 5.2 单元测试

每一步运行基线门禁。现有 723 个用例的断言不修改；若某个用例因为 import 了被删除的常量而编译失败，改成 import 派生常量，断言不变。其中 tests/unit/validate-model-route.test.ts（12 个，同时导入 validate-model 和 admin/test-model 两个路由）、admin-test-model.test.ts（5 个）、chat-route-quota.test.ts（13 个）、chat-route-edgeone.test.ts（4 个）、validate-model-bedrock.test.ts（3 个）、bedrock-api-key.test.ts（2 个）直接导入真实的 chat 路由、两个连接测试路由或 getAIModel，是第 4c 和第 5 步路由改动的直接证据。新增文件：provider-matrix（快照）、provider-legacy（差分，第 4c 步删除）、providers（记录派生值与 fixture，第 6 步删除 fixture 部分）、resolve-endpoint（只含 keySource、source、guarded 和 openai 的 configuredBaseURL 的差分，字段正确性见 4b 快照）、model-config-dialog（第 7 步的自动拉取），加 admin-providers 和 provider-setup 里的两张 24 行表、env.example 覆盖测试。预计重构完成后净增约 45 个用例。

### 5.3 e2e

`npx playwright test tests/e2e/settings-providers.spec.ts tests/e2e/settings-bedrock.spec.ts tests/e2e/provider-models.spec.ts tests/e2e/model-test.spec.ts`，56 个用例（26、8、20、2），在第 1、2、5、6、7、8 步之后各跑一次。settings-providers.spec.ts 点 `pick-provider-*` 按钮、检查选择器搜索和已添加标记、"更多选项"自动展开、Azure 地址、拉取模型列表的错误处理；settings-bedrock.spec.ts 检查 Bedrock 两种登录方式和多条 Bedrock；provider-models.spec.ts 覆盖预置 provider 的拉模型、测试按钮、切换时迟到响应不串台、多语言文案（它用 page.route 替换 validate-model 响应，不验证路由层）；model-test.spec.ts 检查 Test 按钮一次测完所有模型并逐个显示结果，以及 key 链接和地址清理。CI 已经分 6 片跑 e2e（.github/workflows/test.yml:142 到 :147），不需要改。

### 5.4 管理面板（手动，第 3、4c、6、7 步之后）

添加一个 OpenAI 条目和一个 Qiniu 条目，点 Test，保存；检查 settings.json 旁写出的变量名仍是 ADMIN_OPENAI_API_KEY、ADMIN_QINIU_API_KEY、ADMIN_QINIU_BASE_URL；添加第二个 Qiniu 条目，检查后缀 _2；添加 Bedrock 条目，检查 ADMIN_AWS_*；添加 Ollama 和 Vertex 各一条，检查 OLLAMA_API_KEY、GOOGLE_VERTEX_API_KEY；设为默认，检查 AI_PROVIDER / AI_MODEL 被写入；一个无 URL 的条目点 Test，确认 globalBaseUrl 返回的服务器 URL 被当作可信 URL（app/api/admin/test-model/route.ts:56 到 :69）；删除条目后检查环境变量被清理；在聊天页用服务器模型发一条消息。

### 5.5 Electron 桌面版（第 2 和第 6 步之后）

`npm run electron:build` 通过（主进程用 esbuild 单独打包，与 lib/ 没有导入关系，这一步主要确认 `next build` 在类型改动后仍通过，且 lib/providers.ts 没有引入 Node 专有模块导致浏览器端构建失败）。设置 NEXT_AI_DRAWIO_DESKTOP=1 启动，确认 usesServerCredentials 与 usesServerEndpoint 对任意输入都返回 false（快照里的桌面环境列已覆盖），并用 Ollama 和一个 OpenAI 条目各发一条消息。

### 5.5a Docker 与 Cloudflare（第 6 步之后）

Docker：.github/workflows/docker-build.yml 在每个 PR 上已经构建 standalone 镜像（Dockerfile:45 的 `npm run build`，next.config.ts:6 的 `output: "standalone"`），不新增步骤；第 6 步 PR 的该 workflow 必须通过。Cloudflare：项目没有 open-next 的 CI 检查，第 6 步合并前在本机跑一次 `npx opennextjs-cloudflare build`，确认打包不报错；重构没有新增运行时 import（lib/providers.ts 无运行时 import，lib/ai-providers.ts 的依赖不变），所以这一步只是确认。没有 Cloudflare 账号时不做部署，在待决问题里标注"Cloudflare 部署未实测"。

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
| resolveEndpoint 在某个少见组合上与旧分支不一致，导致服务器 key 发往客户端 URL，或配额漏计多计（最可能在 Ollama 的 apiKeyEnv 边角、Azure 四种组合、openai 带用户 key 的 URL） | 第 0 步快照和 5.1 的差分测试在 PR 内就会失败，差异行指出 provider 和场景 | 第 4 步分成 4a、4b、4c 三个 PR，按逆序回滚：4c 之前只需 revert 4b（4a 的 resolveEndpoint 无调用方可留着，旧的 resolveApiKey、resolveBaseUrlEnv 还在）；4c 之后先 revert 4c 再 revert 4b。单独 revert 4a 或 4b 之外的中间提交会让 tsc 失败，不要这样做 |
| guard 或 usesServerEndpoint 改读字段后某个 provider 的答案变化（例如把一家 optionalKey 以外的服务商也放行了无 key 的自定义地址） | 快照里"仅 URL 无 key"的 216 行和 5.1 的 288 个组合在 PR 内失败 | revert 4b 或 4c |
| envPrefix 填错一个字母，某家在服务器部署里读不到 key，报 "environment variable is required" | 第 2 步的 fixture 测试立即失败（PROVIDER_ENV_VARS 派生值与字面值不同）；部署后日志出现该错误 | 回滚第 2 步；没有数据迁移 |
| 管理面板 credEnvNames 的前缀派生错误，已存在的 ADMIN_<P>_API_KEY 读不到，用户的服务器模型全部失效 | 第 3 步的 24 项 credEnvNames 期望表；5.4 的手工验证 | 回滚第 3 步；settings.json 和环境变量未被改动，数据无损 |
| ProviderName 改为 `keyof typeof PROVIDERS` 后类型推导变化，某些 `Partial<Record<ProviderName,…>>` 或 zod refine 编译失败 | `npx tsc --noEmit` 在第 2 步 PR 内失败 | PROVIDERS 已按 3.1 加宽为 `Record<ProviderName, ProviderDef>`，可选字段访问与 `Record<ProviderName, …>` 用法都能编译；若仍有个别 zod refine 或 `process.env.AI_PROVIDER` 的字符串需要收窄，原地补 `as ProviderName`；否则回滚第 2 步到第 0 步的基线（第 1 步只加了无读者的记录文件和测试，运行时与基线相同） |
| 派生表的键顺序与旧表不同，选择器里 provider 顺序变化 | 第 2 步 fixture 测试断言 PROVIDER_GROUPS 每组内的顺序；截图对比 | 选择器顺序由 PROVIDERS 的书写顺序决定，若与截图不符，调整书写顺序；PROVIDER_INFO 与 PROVIDER_ENV_VARS 的键序按设计变化，见待决问题 2 |
| lib/providers.ts 被客户端组件 import，若误加 Node import 会让浏览器端构建失败 | `npm run build` 和 e2e | 把 import 挪回 lib/ai-providers.ts |
| e2e 对话框测试因表单分支改为按 credential 种类而失败 | 第 5 步 e2e | 第 5 步按文件逐个 commit，回滚对应 commit |
| 文案对象某种语言漏填或搬错一句 | Copy 类型要求四种语言齐全，漏填不编译；第 2 步 fixture 对 8 条文案与字典逐字比对 | 补字段或回滚第 5 步删除字典 key 的 commit |
| 已存 Azure 占位地址的旧条目被当作填好了地址，Test 连到 your-resource 这个主机 | 第 5 步 commit 说明里写明；用户看到连接错误而非"先填地址"提示 | 这是有意变化；若所有者不接受，保留 hasCredentials 里一行"地址等于旧占位值视为未填"的判断，作为独立 commit |
| 自动拉取模型列表在用户 key 错误或网络不通时失败，用户面对空列表 | 第 7 步的 e2e 和手动检查；对话框显示现有的拉取错误提示 | 手输模型 id 的入口保留；若所有者认为体验变差，revert 第 7 步，记录和 SUGGESTED_MODELS 的读者回到第 6 步的状态 |
| 快照文件体积大（约 3900 条、1 MB 左右），PR review 噪音 | 快照只在第 2 步（非法 provider 场景的文本，若放进快照）和第 8、9 步允许变化，其余步骤 diff 为零；评审只需看"快照无变化" | 若觉得过大，可按 provider 拆成 24 个文件 |
| 第 9 步启用目录判定后，某模型被加上它不接受的 reasoning 参数，请求 400 | 第 9 步的真实 key 检查；用户报错 | 第 9 步是独立 commit，revert 即可 |
| 文档与 env.example 没有和记录同步 | 第 6 步新增的 env.example 覆盖测试 | 随时可补 |

所有步骤都只在 lib、app、components、tests、docs 内移动代码，不改 settings.json、localStorage 格式、ai-models.json 格式或任何环境变量名，因此每一步回滚都是纯代码回滚，无需迁移数据。

## 7. 预期效果

| 指标 | 改动前 | 改动后 |
|---|---|---|
| 新增 OpenAI 兼容服务商要改的代码文件 / 位置 | 3 个文件、5 到 7 处 | 1 个文件、1 处（能在线列模型，没有推荐列表要写） |
| 新增服务商要改的文档 | env.example 加 3 份文档（手写） | 不变，env.example 由第 6 步的测试保证与记录同步 |
| 新增带地址提示的服务商（MiMo 那种） | 12 个文件（记录相关 3 个代码文件、4 份字典、component 1 个、env.example、3 份文档） | 1 个代码文件（记录里一个四语字段）加 env.example 和 3 份文档，共 5 个 |
| 应用代码里以 provider 名为键的表 | 13 张加 1 个联合类型，4 个文件 | 2 张（PROVIDERS、POPULAR_PROVIDERS），2 个文件 |
| 仓库里以 provider 名为键的表（含脚本） | 14（应用 13 张、脚本 1 处，不含 ProviderName 联合类型） | 3（应用 2 张，脚本 1 处不变），或处理待决问题 5 后为 2 |
| 按请求推导"用谁的 key、去哪个 URL"的位置 | getAIModel 五个分支加 usesServerCredentials 镜像 | resolveEndpoint 一处 |
| 环境变量名拼法出现的位置 | 3 处 | 1 处（envVarsOf） |
| Anthropic 与 Azure 的服务器凭据特例 | 2 处 | 1 处（serverCredentialError） |
| createModel 的分支依据 | 12 个 provider 名 case，default 列 9 个名字，加 getAIModel 里 4 个分支 | 13 个 sdk 种类 case 加 getAIModel 里一个 Bedrock 判断，无名字列表 |
| lib/ai-providers.ts 之外的 provider 名判断 | 44 处（9 个文件） | 6 处（管理面板 deriveEnvUpdates 和 derivedEnvKeys 里 bedrock、vertexai、ollama 三家各两处） |
| 服务商专属文案的位置 | 4 份字典各 8 个 key | 记录里 9 个四语字段（8 个从字典搬来，加 Azure 的地址提示） |
| 推荐模型 id | 179 个，19 家手写 | 53 个，6 家手写在记录里；其余 18 家在线拉取 |
| lib/ai-providers.ts | 1240 行 | 约 1140 行（buildProviderOptions 的 155 行不动） |
| lib/types/model-config.ts | 648 行 | 约 190 行 |
| lib/provider-setup.ts | 138 行 | 约 70 行 |
| lib/provider-models.ts、lib/admin/providers.ts | 259 行、309 行 | 约 259 行、约 305 行 |
| 新增文件 | 无 | lib/providers.ts 约 470 行 |
| 整层总行数 | 2594 | 约 2430（1140 + 190 + 70 + 259 + 305 + 470 = 2434），大致持平 |
| 单元测试 | 723 个（63 个文件） | 约 770 个，加一份约 3900 条记录的快照（30720 个组合的差分测试只在第 0 到 4c 步存在） |

总行数大致持平，收益体现在四处：加 provider 的改动面、key 与 URL 决策的单点化、不再有"必须手工镜像"的注释、服务商专属文案和短列表随记录走。

## 8. 待决问题

1. **记录的导出名。** 新文件里叫 PROVIDERS，lib/types/model-config.ts 以 PROVIDER_INFO 转发导出，12 个 import 处不用改。要统一成一个名字，需要改 12 个文件约 25 行。本方案的建议：先保留 PROVIDER_INFO 别名，重构完成后再决定。评审者建议：五位评审者中四位建议先保留 PROVIDER_INFO 别名（前提是按 3.1 把类型拆成 defs 加显式 Record 注解并补上本地 import），重构全部完成后再考虑一次机械替换，因为中途改名会让每一步的 diff 混入无关改动；一位建议整个代码库只用 PROVIDER_INFO 一个名字，省去读者核对两个名字是否同一个对象。
2. **选择器与管理面板的顺序。** 记录按选择器顺序书写后，管理面板"添加 provider"下拉框（用 `Object.keys(PROVIDER_INFO)`）的顺序会从今天的联合类型顺序变成与选择器一致。接受这一点，还是在记录上加一个 order 数字字段？本方案的建议：接受这个顺序变化，不加 order 字段。除管理面板下拉框外，getAIModel 的四段错误文案里 provider 的列举顺序也会随 PROVIDER_INFO 和 PROVIDER_ENV_VARS 的键序改变；若希望这些文案保持稳定，可在拼接前对键排序，那是一个独立的小改动，建议随第 2 步一并决定。评审者建议：五位中三位建议接受管理面板下拉框跟随选择器顺序，不加 order 字段，并在 2.2 节写明几段报错文本的顺序也会跟着变（本修订已写入）；两位 Codex 评审者要求保留选择器各组的旧顺序（第 2 步按选择器顺序书写记录已满足），并把管理面板重排记录为明确批准的有意行为变更。
3. **Ollama 的 apiKeyEnv 边角。** 今天 usesServerCredentials 在服务器模型配置了 apiKeyEnv 但该变量为空时返回 true（计配额、走白名单）；同一输入下 getAIModel 会在 validateProviderCredentials（:555 到 :561）抛出 "<变量名> environment variable is required for ollama provider"，请求不会发出。两者是两件独立的事：前者是配额与白名单用的布尔值，后者是校验失败。chat 路由（app/api/chat/route.ts:240）先调 getAIModel，所以用户看到的是校验错误，不会被计配额。这个输入在管理面板里产生不出来（credEnvNames 对 ollama 返回空，面板不会给它 apiKeyEnv），只有手写 ai-models.json 才会碰到。本方案的建议：逐字保留旧答案。所有者可以决定改为"有 key 值才算 server"，那是一个有意的行为变化，应单独 commit 并更新快照里受影响的 ollama 行。评审者建议：五位评审者一致建议逐字保留旧答案；这个输入只有手写 ai-models.json 才能产生，旧答案偏保守只会多计配额，改它会影响配额和模型白名单判断，应另行安全评审。
4. **buildProviderOptions 要不要读目录。** 三个选项：维持现状；按第 9 步做"目录只能增加开启思维链的模型"，改变 openai 3 个和 google 6 个目录条目（含大小写和前缀变体）的请求参数；或者走产品方向，在模型设置里让用户勾选"推理模型"。本方案的建议：维持现状，保留正则，第 9 步不做。评审者建议：五位评审者一致建议维持现状，第 9 步不做；目录缺 sglang、edgeone、atlascloud，核对下来只能在 openai 和 google 的 9 个条目上多开推理，gemma 是否接受 thinkingConfig 未验证。一位补充，若将来用户反馈 gemini-flash-latest、grok、deepseek 这类模型没开思维链，优先考虑第三个选项（设置里勾选"推理模型"）；另一位认为该选项属于新功能，应另提。
5. **scripts/update-model-catalog.mjs 的映射。** 让脚本用 `node --experimental-strip-types` 读 lib/providers.ts 的 catalogId 字段，还是保留脚本自己的表并加一个键集合测试。前者少一张表，后者零风险。本方案的建议：保留脚本自己的映射，加一个"键集合是 ProviderName 子集"的测试。评审者建议：五位评审者一致建议保留脚本自己的映射并加一个键集合子集测试；脚本一年跑几次，引入 --experimental-strip-types 会增加运行方式的复杂度。一位补充，这个测试不要 import 脚本本身，因为它的顶层代码会抓取数据并写目录。
6. **custom 预设是否做，以及是否支持 Anthropic 协议。** 只支持 OpenAI 兼容协议时改动极小。它比 sglang 多 singleSystem，比 openai 加自定义地址多 `<think>` 提取（见 3.5）。另一个选择是把 sglang 条目改成通用条目：改标签和它的 note 文案、给它加 singleSystem，并接受 SGLANG_API_KEY、SGLANG_BASE_URL 变量名和 127.0.0.1:8000 默认地址继续保留；加 singleSystem 对现有 SGLang 用户是行为变化。支持 Anthropic 协议需要加协议字段和新请求头，属于新功能。本方案的建议：做 custom 预设，只支持 OpenAI 兼容协议，作为全量迁移验证完成后单独批准的可选步骤（第 8 步）。评审者建议：五位中四位建议做 custom 预设，只支持 OpenAI 兼容协议，SGLang 条目和标签保持不动，其中两位 Codex 评审者要求把它作为全量迁移验证完成后单独批准的独立功能提交；一位建议不做 custom，改把 sglang 的标签改成更通用的名字，因为 openai 带自定义 URL 和 sglang 已覆盖这个用法。
7. **是否借鉴 magpie 的 DetectBase，给只有主机名的 OpenAI 兼容地址自动补 /v1。** 这是行为变更；若要做，应在第 8 步之后单独提，并限定在 custom 记录上。本方案的建议：不做自动补 /v1。评审者建议：五位评审者一致建议不做自动补 /v1；本项目的服务商地址里 Novita 是 /openai、Qwen 是 /compatible-mode/v1、GLM 是 /api/paas/v4，猜错的概率不低，而且它会改变用户明确填写的地址，超出行为保持型重构的范围。
8. **sdkKnowsEndpoint 能否去掉。** 若对所有 provider 都显式传 defaultBaseUrl，这个字段和 resolveEndpoint 里 `sdk === "openai"` 的特例都可以删，少两条规则。代价是传给工厂的参数从 undefined 变为显式 URL，快照会显示差异，需要确认每家 SDK 的内置默认值与记录一致。本方案的建议：保留 sdkKnowsEndpoint，第 4 步逐字移植，确认快照稳定后再考虑作为独立 commit 尝试。评审者建议：五位中四位建议保留 sdkKnowsEndpoint；Azure 没有可用的默认地址，显式传地址会覆盖按资源名构建的地址，Gateway 不带 URL 时走 OIDC 的行为也可能改变，验证成本高于省下的两条规则。一位建议先逐字移植保留它，快照稳定后再作为独立 commit 尝试删除。
9. **真实 key 的手动检查。** 5.6 节的 11 行里，所有者手头有哪些 key，哪些需要跳过或由他人代测。本方案的建议：至少用真实 key 亲测 openai、anthropic、bedrock 和一家 OpenAI 兼容服务商这四条线，它们覆盖 Responses、Messages、Converse 和 Chat Completions 四种协议，其余按清单标注状态。评审者建议：三种意见。两位建议至少亲测这四条线；一位建议亲测 openai（官方和带地址两种）、anthropic、google、bedrock、本地 Ollama 和一家 OpenAI 兼容服务商六条线；两位 Codex 评审者建议由所有者执行一份验收清单，按线路标注已验证、缺少 key、待代测三种状态，并补充真实 SDK 加桩 fetch 的测试，因为当前的 Initializing 日志不记录请求 URL。

## 评审记录

三份草稿从不同角度写成，终稿的取舍如下：

- **数据模型优先**：终稿采用了它的数据模型主干，包括独立的纯数据文件 lib/providers.ts、带 Sdk 和 Credential 两个枚举的 ProviderDef、createModel 按 sdk 分支并把 Bedrock 分支逐字搬进 bedrockModel()、EdgeOne 表和当时 Electron 表的遗漏发现、"目录只增加开启思维链的模型"这一可选规则，以及 2.2 节逐条对应实现位置的写法。
- **迁移安全优先**：终稿采用了它的第 0 步行为快照加差分测试的设计、第 4 步拆成三个小 PR 的顺序、fixture 冻结旧表字面值并断言键序的做法，以及它用五个 provider 的完整目录数据证明"目录 reasoning 标记与正则回答的是两个不同问题"的分析；它关于 PROVIDER_GROUPS 顺序与 PROVIDER_INFO 键顺序一致的说法经核对不成立，终稿采用了相反的结论。
- **最小改动优先**：终稿采用了它对"十一个函数"的职责区分（按请求推导的合并，其余只改读数据）、envVarsOf 与 serverCredentialError 两个小帮助函数、POPULAR_PROVIDERS 保留为独立表、Ollama apiKeyEnv 边角的发现，以及维持 buildProviderOptions 现状的建议；它主张不加 sdk 字段、保留按 provider 名的 switch，终稿没有采用，因为加字段后 getAIModel 的第二个 switch 可以整体消失，而三个服务商专属的 sdk 值已经把它担心的"同一事实写两遍"限制在三处。它让 getAIModel 顶部 guard 和 usesServerEndpoint 按名字保留以便审计的理由曾被终稿采用，后由所有者决定改读字段。

上一版修订经过一轮多模型评审：五位评审者在五个模型上审阅了本方案，34 条合并后的发现逐条对照代码核实，其中 15 条确认、17 条部分确认、2 条推翻。该修订应用了确认和部分确认的发现，待决问题下的"评审者建议"句子来自同一轮评审。

本次修订把方案核对到 main 的提交 99ced88：死代码清理（#986）删除了 Electron 的 provider 表和界面配置的旧格式迁移，把连接测试搬进 lib/test-model-connection.ts，并重写了模型选择器；AI SDK 用法修正（#987）改写了 chat 路由。文中每个行号、每个计数都按这两次改动之后的文件重新核对。同时写入了所有者的五项决定：推荐模型列表按能否在线列模型分两类处理（18 家在线拉取，6 家的短列表进记录）；层外的 provider 名判断改读 credential 和 sdk 字段，只保留管理面板的三家固定变量分支；Azure 去掉占位默认地址，落入通用的"无默认地址必须填地址"规则；服务商专属的 8 条文案以四语对象进记录，字典只留通用文案；env.example 继续手写并由测试保证同步。待决问题去掉了 Electron 和推荐列表位置两条，其余重新编号并各补一句本方案的建议。

## 实施记录（2026-10-12）

分支 provider-refactor 在本文档的三次提交之上实施了第 0 步到第 8 步，共 10 个提交，每步一个（第 4 步拆成 4a 加 4b、快照扩充、4c 三个）。第 9 步按待决问题 4 的建议维持现状，没有做。所有者在实施前决定：推荐列表按 B 处理，层外的名字判断改读字段，Azure 去掉占位地址，服务商文案进记录，env.example 继续手写，custom 预设一并做。

与上文方案的差别，按步骤：

1. 第 1 步没有单独提交。所有者已决定全部推广，三家样例和其余 21 家在同一个提交（第 2 步）里进入记录。
2. 第 2 步的 Azure 记录暂时保留了占位地址，第 5 步连同 hasCredentials、对话框文案和 e2e 一起去掉，这样第 2 步的行为完全不变。方案原本写在第 2 步的 fixture 里列为例外。
3. 第 0 步的 9 种环境里，第 9 种"ALLOW_PRIVATE_URLS=false"换成"全部服务器变量同时设置"：守卫 fetch 已经 mock 成哨兵，前者没有可观察效果。第 4c 步之前给矩阵补了第 16 种形状（带 key 的私网地址），记录 usesServerEndpoint 对服务器网络的回答，新增 252 行，旧行不变。快照最终 4277 行。
4. 第 4a 步的差分测试只比对 keySource（30720 个组合），guarded 和 configuredBaseURL 的正确性由第 4b 步"快照不变"证明，没有另写断言；第 4c 步后差分文件 tests/unit/provider-legacy.test.ts 删除。
5. 第 5 步连带把 isClientOverride 里的 vertexai 名字判断改读 credential；方案的清单漏了这一处。字典里 8 个服务商专属 key 删除后，记录文案与旧字典逐字相同的核对在第 5 步的 providers.test.ts 里用冻结的旧文案完成，第 6 步随 fixture 一起删除。
6. 第 7 步自动拉取的触发条件比方案窄：只在服务商页面打开期间填入凭据、且该服务商还没有模型时拉取一次（输入停顿 600 毫秒后），结果到达时打开选择器；打开页面时已有的凭据不触发，有模型的服务商由"获取全部模型"按钮拉取。原因是无条件拉取会让多条现有 e2e 用例多出一次请求并改变它们的断言。方案列出的 tests/unit/model-config-dialog.test.tsx 没有写，三种行为由 e2e 覆盖（首个服务商流程、空列表再拉取、custom 预设）。
7. `[API Key Routing]` 日志移到 getAIModel 后只记录选中的变量名，不再记录候选数量。
8. 行数：lib/ai-providers.ts 1305、lib/types/model-config.ts 180、lib/provider-setup.ts 85、lib/provider-models.ts 251、lib/admin/providers.ts 306、lib/providers.ts 559，合计 2686 行，改动前 2594 行。方案估计约 2430。多出的部分是记录字段的注释（ProviderDef 的 20 个字段各有说明）、resolveEndpoint 里保留的安全规则说明、custom 记录和 Azure 的地址提示。本方案的收益在改动面和单点决策，行数上没有收益，这一点与第 7 节的说明一致。

核对结果：单元测试 66 个文件 749 个用例全部通过（含 tests/unit/canvas-import-boundary.test.ts，它在 worktree 里安装 node_modules 后才能通过）；`tsc --noEmit` 无错；`biome ci` 无错误，37 条警告全部在未改动的文件里；e2e 五个文件 65 个用例通过（settings-providers 27、settings-bedrock 8、provider-models 20、model-test 2、settings-tabs-sync 8），其中"the provider list shows what needs attention"在并行运行时超时一次，单独运行通过。层外按 provider 名的判断剩 6 处，全部在 lib/admin/providers.ts 的 deriveEnvUpdates 和 derivedEnvKeys 里。真实 key 的检查（第 5.6 节）没有做：这台机器上只有 Bedrock 的 AWS 凭据，重构前已用它跑通过 GPT-6 Luna 和 Claude Haiku 4.5 两次连接测试，重构后待所有者按清单验收。
