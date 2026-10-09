<div align="center">

# Next AI Draw.io

**和 AI 对话，画出并修改 draw.io 图表。**

[English](../../README.md) | 中文 | [日本語](../ja/README_JA.md)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ea4aaa)](https://github.com/sponsors/DayuanJiang)

[**在线体验**](https://next-ai-drawio.jiang.jp/) · [**桌面应用**](https://github.com/DayuanJiang/next-ai-draw-io/releases) · [**MCP 服务器**](#在-ai-代理里使用mcp)

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
    <td colspan="2" valign="top" align="center">
      <strong>带动画连接线的 Transformer 架构</strong><br />
      <p><strong>Prompt:</strong> Give me a <strong>animated connector</strong> diagram of transformer's architecture.</p>
      <img src="../../public/animated_connectors.svg" alt="带动画连接线的 Transformer 架构" width="440" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>RAG 架构图</strong><br />
      <p><strong>Prompt:</strong> Generate a RAG architecture diagram for <strong>chat application</strong>. Use connected diagram for data ingestion</p>
      <img src="../../public/rag_prod.svg" alt="RAG 架构图" width="400" />
    </td>
    <td width="50%" valign="top">
      <strong>React 加 AWS 的认证流程</strong><br />
      <p><strong>Prompt:</strong> Generate authentication process using React with <strong>AWS</strong>. Use Serverless architecture.</p>
      <img src="../../public/auth.svg" alt="认证架构图" width="400" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>开放式创新模型</strong><br />
      <p><strong>Prompt:</strong> Create visualization of Henry Chesbrough's Open Innovation model.</p>
      <img src="../../public/inno.svg" alt="开放式创新图" width="400" />
    </td>
    <td width="50%" valign="top">
      <strong>猫咪素描</strong><br />
      <p><strong>Prompt:</strong> Draw a cute cat for me.</p>
      <img src="../../public/cat_demo.svg" alt="猫咪绘图" width="200" />
    </td>
  </tr>
</table>
</div>

## 使用方式

### 在线体验

打开 [next-ai-drawio.jiang.jp](https://next-ai-drawio.jiang.jp/) 即可使用，无需安装。演示站有用量限制；点击聊天面板里的设置图标，填入自己的服务商和 API Key 就不受限制。Key 只保存在浏览器本地，不会上传到服务器。

### 桌面应用

在 [Releases 页面](https://github.com/DayuanJiang/next-ai-draw-io/releases) 下载 Windows、macOS 或 Linux 安装包。

### 在 AI 代理里使用（MCP）

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

Claude Code 用一行命令：

```bash
claude mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

然后对 AI 说"画一个用户认证流程图，包含登录、MFA 和会话管理"，图会实时出现在浏览器里。MCP 服务器包含网页版的大部分画图能力：

-   同一套画图规则和图标库（AWS、Azure、GCP、Kubernetes 等）
-   截图工具，AI 可以看一眼画好的图并自行修正
-   版本历史、多页图表，下载为 `.drawio`、`.png`、`.svg` 或 `.drawio.svg`
-   自动保存到 `~/.next-ai-drawio/`，重启后接着画

VS Code、Cursor 等客户端的配置见 [MCP 服务器 README](../../packages/mcp-server/README.md)。

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

支持 AWS Bedrock（默认）、OpenAI、Anthropic、Google AI、Google Vertex AI、Azure OpenAI、Ollama、OpenRouter、AIHubMix、DeepSeek、SiliconFlow、SGLang、Vercel AI Gateway、腾讯云 EdgeOne、字节跳动豆包、ModelScope、智谱 GLM、通义千问、七牛云、Kimi、MiniMax、Novita、小米 MiMo、Atlas Cloud 共 24 家。各家的环境变量和注意事项见[服务商配置指南](./ai-providers.md)。

**选哪个模型**：这项任务要生成格式严格的长文本（draw.io XML），请选能力较强的模型，小模型容易画出错误的图。

**多模型与管理面板**：在 `AI_MODEL` 里用逗号列出多个模型 ID，或用 `AI_MODELS_CONFIG` 环境变量 / `ai-models.json` 文件配置多家服务商的模型，所有用户无需自带 Key 即可使用。设置 `ADMIN_PASSWORD` 后访问 `/admin`，可以在网页里管理模型、访问码、功能开关、可观测性和配额，见[管理面板指南](./admin-panel.md)。

## 支持

-   问题和建议：提交 [GitHub Issue](https://github.com/DayuanJiang/next-ai-draw-io/issues)，或发邮件到 me[at]jiang.jp
-   常见问题：[FAQ](./FAQ.md)
-   如果这个项目对你有用，欢迎[赞助](https://github.com/sponsors/DayuanJiang)，帮助我维持演示站点的运行

<div align="center">

[![TrendShift](https://trendshift.io/api/badge/repositories/15449)](https://next-ai-drawio.jiang.jp/)

[![Star History Chart](https://api.star-history.com/svg?repos=DayuanJiang/next-ai-draw-io&type=date&legend=top-left)](https://www.star-history.com/#DayuanJiang/next-ai-draw-io&type=date&legend=top-left)

</div>
