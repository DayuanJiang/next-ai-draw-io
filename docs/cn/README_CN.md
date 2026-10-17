<div align="center">

# Next AI Draw.io

**和 AI 对话，画出并修改 draw.io 图表。**

[English](../../README.md) | 中文 | [日本語](../ja/README_JA.md)

[![TrendShift](https://trendshift.io/api/badge/repositories/15449)](https://next-ai-drawio.jiang.jp/)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ea4aaa)](https://github.com/sponsors/DayuanJiang)

[**在线体验**](https://next-ai-drawio.jiang.jp/) · [**文档**](https://next-ai-drawio.jiang.jp/zh/docs) · [**图库**](https://next-ai-drawio.jiang.jp/zh/gallery) · [**桌面应用**](https://github.com/DayuanJiang/next-ai-draw-io/releases) · [**MCP 服务器**](https://next-ai-drawio.jiang.jp/zh/mcp)

</div>

https://github.com/user-attachments/assets/66b9f12f-219f-4d62-acc0-0725e6850eec

用一句话描述想要的图，AI 就在真正的 draw.io 画布上把它画出来。你可以像编辑任何 draw.io 文件一样手动修改，也可以选中几个图形、告诉 AI 要改什么。AI 的每次修改都是一个版本，可以对比、恢复或撤销；结果可以导出为 `.drawio`、`.png` 或 `.svg`。

提供网页版、Windows / macOS / Linux 桌面版，以及供 Claude Code、Cursor、VS Code 等 AI 代理调用的 MCP 服务器。

## 亮点

**画**

-   一句话生成架构图、流程图、时序图等，内置 AWS、Azure、GCP、Kubernetes 等图标库
-   连接线可以带流动动画
-   上传截图或手绘图，让 AI 照着画；上传 PDF、Markdown、代码等文本文件，从内容生成图

**改**

-   用对话修改：改动流式呈现，刚改过的图形在画布上高亮
-   选中图形提问：在画布上选中几个图形，AI 只改这几个
-   版本与撤销：每次 AI 修改都是一张带缩略图的版本卡片，可以和画布对比、恢复、撤销；画布上按 Ctrl+Z 也能一步撤回 AI 的修改
-   它就是普通的 draw.io：双击改名、拖动、调样式、多页，随时导出 `.drawio`、`.png`、`.svg`、`.drawio.svg`

**用**

-   支持 24 家模型服务商，可以在浏览器里填自己的 API Key，Key 只保存在本地
-   支持推理的模型会显示思考过程
-   深色模式；界面有英文、简体中文、繁体中文、日文

## 示例

<div align="center">
<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <strong>AWS 上的高可用 Web 应用</strong><br />
      <p><strong>提示词：</strong> Draw an AWS architecture for a highly available web app across two Availability Zones with AWS icons: Route 53, CloudFront with AWS WAF, an Application Load Balancer, ECS Fargate services in private subnets, Aurora PostgreSQL with a writer and a reader, ElastiCache for Redis, S3 for static assets, NAT gateways, and CloudWatch for monitoring.</p>
      <p><strong>模型：</strong> Claude Opus 5.5，在 Claude Code 里通过 MCP 服务器</p>
      <img src="../../public/gallery/aws-ha.svg" alt="AWS 上的高可用 Web 应用" width="400" />
    </td>
    <td width="50%" valign="top">
      <strong>网店的 Kubernetes 部署</strong><br />
      <p><strong>提示词：</strong> Draw a Kubernetes deployment for a web shop: an ingress, web and API deployments with their services and pods, a Redis StatefulSet with a persistent volume, a ConfigMap, a Secret, and an autoscaler on the API.</p>
      <p><strong>模型：</strong> Claude Opus 5.5，在 Claude Code 里通过 MCP 服务器</p>
      <img src="../../public/gallery/kubernetes.svg" alt="网店的 Kubernetes 部署" width="400" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>网店的 ER 图</strong><br />
      <p><strong>提示词：</strong> Draw an ER diagram for an online shop: customers, addresses, orders, order items, products, categories and payments, with primary and foreign keys and the cardinality of each relationship.</p>
      <p><strong>模型：</strong> Claude Opus 5.5，在 Claude Code 里通过 MCP 服务器</p>
      <img src="../../public/gallery/er-shop.svg" alt="网店的 ER 图" width="400" />
    </td>
    <td width="50%" valign="top">
      <strong>BPMN 报销流程</strong><br />
      <p><strong>提示词：</strong> Draw a BPMN process for an expense claim: an employee submits it, the manager approves or rejects it, finance checks the receipts and pays, and the claim goes back to the employee when receipts are missing.</p>
      <p><strong>模型：</strong> Claude Opus 5.5，在 Claude Code 里通过 MCP 服务器</p>
      <img src="../../public/gallery/bpmn-expense.svg" alt="BPMN 报销流程" width="400" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>带动画连线的 Transformer 架构</strong><br />
      <p><strong>提示词：</strong> Give me an animated connector diagram of transformer's architecture.</p>
      <p><strong>模型：</strong> Claude Opus 5.5，在 Claude Code 里通过 MCP 服务器</p>
      <img src="../../public/gallery/transformer.svg" alt="带动画连线的 Transformer 架构" width="400" />
    </td>
    <td width="50%" valign="top">
      <strong>手机银行的用户旅程地图</strong><br />
      <p><strong>提示词：</strong> Draw a customer journey map for a mobile banking app across five stages (discover, sign up, first payment, everyday use, get help), with the customer's actions, touchpoints, feelings and pain points in each stage, and an opportunity for each pain point.</p>
      <p><strong>模型：</strong> Claude Opus 5.5，在 Claude Code 里通过 MCP 服务器</p>
      <img src="../../public/gallery/journey-map.svg" alt="手机银行的用户旅程地图" width="400" />
    </td>
  </tr>
</table>
</div>

更多示例，以及每张图的提示词和模型，见 **[图库](https://next-ai-drawio.jiang.jp/zh/gallery)**。

## 使用方式

### 在线体验

打开 [next-ai-drawio.jiang.jp](https://next-ai-drawio.jiang.jp/) 即可使用，无需安装。演示站有用量限制；点击聊天面板里的设置图标，填入自己的服务商和 API Key 就不受限制。Key 只保存在浏览器本地，不会上传到服务器。

### 桌面应用

在 [Releases 页面](https://github.com/DayuanJiang/next-ai-draw-io/releases) 下载 Windows、macOS 或 Linux 安装包。

### 在 AI 代理里使用（MCP）

https://github.com/user-attachments/assets/6f53a67b-ab21-4113-9fee-7fb32f9de678

通过 MCP（Model Context Protocol，让 AI 代理调用外部工具的协议），Claude Desktop、Cursor、VS Code 等都能直接画 draw.io 图。在客户端的 MCP 配置里加上：

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["@next-ai-drawio/mcp-server@latest"]
    }
  }
}
```

VS Code 和 Cursor 点一下就能装好：[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522drawio%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540next-ai-drawio%252Fmcp-server%2540latest%2522%255D%257D) [![Add to Cursor](https://img.shields.io/badge/Cursor-Add_Server-000000?style=flat-square)](https://cursor.com/en/install-mcp?name=drawio&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAbmV4dC1haS1kcmF3aW8vbWNwLXNlcnZlckBsYXRlc3QiXX0%3D)

Claude Code 用一行命令（`--scope user` 让所有项目都能用）：

```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

它也是 Claude Code 社区插件市场里的一个插件（需要 Claude Code 2.1.275 或更高版本）：

```text
/plugin install next-ai-drawio --marketplace anthropics/claude-plugins-community
```

然后对 AI 说"画一个用户认证流程图，包含登录、MFA 和会话管理"，图会实时出现在浏览器里。MCP 服务器包含网页版的大部分画图能力：

-   与网页版相同的画图规则、图标库（AWS、Azure、GCP、Kubernetes 等）和画布：AI 的改动会被标出，按一次 Ctrl+Z 就能撤销，AI 还能读到你选中的图形
-   截图工具，AI 可以看一眼画好的图并自行修正
-   版本历史、多页图表，导出为 `.drawio`、`.png`、`.svg` 或 `.drawio.svg`，并自动保存到 `~/.next-ai-drawio/`；draw.io 编辑器随包安装，预览不需要联网

Codex、VS Code、Cursor 等客户端的配置、全部工具，以及和其他 draw.io MCP 服务器的对比，见 [MCP 服务器页面](https://next-ai-drawio.jiang.jp/zh/mcp)。

### 和 draw.io 自带的 AI 有什么不同

draw.io 自带 Generate 工具（Arrange > Insert > Generate）。它在 draw.io 里运行，可以用免费的托管模型，也可以填自己的 API key；把图、页面或选中的图形附加到对话里，它就能修改。Next AI Draw.io 每条消息都会带上当前画布，包括你手动做的修改；AI 的每次修改都是一个可以对比或恢复的版本；支持 25 家模型服务商，包括通过 Ollama 使用本地模型，在演示站、桌面应用和自己的服务器上都能用。

## 自己部署

### 本地运行

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
npm install
cp env.example .env.local   # 填入服务商和 API Key，见下文"模型与服务商"
npm run dev
```

打开 [http://localhost:6002](http://localhost:6002)。

### 一键部署

| 平台 | 方式 |
| --- | --- |
| 腾讯云 EdgeOne Pages | [![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io) 部署后还能获得[每日免费的 DeepSeek 模型额度](https://edgeone.cloud.tencent.com/pages/document/169925463311781888) |
| Vercel | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io) 记得在 Vercel 控制台里设置和 `.env.local` 相同的环境变量 |
| Cloudflare Workers | [Cloudflare 部署指南](./cloudflare-deploy.md) |
| Docker | [Docker 指南](./docker.md) |
| 离线或内网 | [离线部署说明](./offline-deployment.md) |

### 模型与服务商

支持 AWS Bedrock（默认）、OpenAI、Anthropic、Google AI、Google Vertex AI、Azure OpenAI、Ollama、OpenRouter、AIHubMix、DeepSeek、SiliconFlow、SGLang、Vercel AI Gateway、腾讯云 EdgeOne、字节跳动豆包、ModelScope、智谱 GLM、通义千问、七牛云、Kimi、MiniMax、Novita、小米 MiMo、Atlas Cloud，以及一个可填任意地址的 OpenAI 兼容预设（vLLM、LM Studio、网关），共 25 家。各家的环境变量和注意事项见[服务商配置指南](./ai-providers.md)。

**选哪个模型**：这项任务要生成格式严格的长文本（draw.io XML），请选能力较强的模型，小模型容易画出错误的图。

**多模型与管理面板**：在 `AI_MODEL` 里用逗号列出多个模型 ID，或用 `AI_MODELS_CONFIG` 环境变量 / `ai-models.json` 文件配置多家服务商的模型，所有用户无需自带 Key 即可使用。设置 `ADMIN_PASSWORD` 后访问 `/admin`，可以在网页里管理模型、访问码、功能开关、可观测性和配额，见[管理面板指南](./admin-panel.md)。

## 支持

-   问题和建议：提交 [GitHub Issue](https://github.com/DayuanJiang/next-ai-draw-io/issues)，或发邮件到 me[at]jiang.jp
-   常见问题：[FAQ](./FAQ.md)
-   如果这个项目对你有用，欢迎[赞助](https://github.com/sponsors/DayuanJiang)，帮助我维持演示站点的运行

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=DayuanJiang/next-ai-draw-io&type=date&legend=top-left)](https://www.star-history.com/#DayuanJiang/next-ai-draw-io&type=date&legend=top-left)

</div>
