# Next AI Draw.io

<div align="center">

**AI驱动的图表创建工具 - 对话、绘制、可视化**

[English](../../README.md) | 中文 | [日本語](../ja/README_JA.md)

[![TrendShift](https://trendshift.io/api/badge/repositories/15449)](https://next-ai-drawio.jiang.jp/)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Next.js](https://img.shields.io/badge/Next.js-16.x-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61dafb)](https://react.dev/)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ea4aaa)](https://github.com/sponsors/DayuanJiang)

[![Live Demo](../../public/live-demo-button.svg)](https://next-ai-drawio.jiang.jp/)

</div>

一个集成了AI功能的Next.js网页应用，与draw.io图表无缝结合。通过自然语言命令和AI辅助可视化来创建、修改和增强图表。

> 注：感谢 <img src="https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/public/doubao-color.png" alt="" height="20" /> [字节跳动豆包](https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=Z9Z3LDTJ&utm_campaign=drawio&utm_content=drawio&utm_medium=devrel&utm_source=OWO&utm_term=drawio) 的赞助支持，本项目的 Demo 现已接入强大的 glm-4.7 模型！

<a href="https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=Z9Z3LDTJ&utm_campaign=drawio&utm_content=drawio&utm_medium=devrel&utm_source=OWO&utm_term=drawio" target="_blank"><img src="../../public/volcengine-invite.png" alt="火山引擎方舟 Coding Plan" width="300" /></a>

https://github.com/user-attachments/assets/b2eef5f3-b335-4e71-a755-dc2e80931979

## 目录
- [Next AI Draw.io](#next-ai-drawio)
  - [目录](#目录)
  - [示例](#示例)
  - [功能特性](#功能特性)
  - [MCP服务器](#mcp服务器)
    - [Claude Code CLI](#claude-code-cli)
  - [快速开始](#快速开始)
    - [在线试用](#在线试用)
    - [桌面应用](#桌面应用)
    - [使用Docker运行](#使用docker运行)
    - [安装](#安装)
  - [部署](#部署)
    - [部署到腾讯云EdgeOne Pages](#部署到腾讯云edgeone-pages)
    - [部署到Vercel](#部署到vercel)
    - [部署到Cloudflare Workers](#部署到cloudflare-workers)
  - [多提供商支持](#多提供商支持)
  - [工作原理](#工作原理)
  - [支持与联系](#支持与联系)
  - [常见问题](#常见问题)
  - [Star历史](#star历史)

## 示例

以下是一些示例提示词及其生成的图表：

<div align="center">
<table width="100%">
  <tr>
    <td colspan="2" valign="top" align="center">
      <strong>动画Transformer连接器</strong><br />
      <p><strong>Prompt:</strong> Give me a **animated connector** diagram of transformer's architecture.</p>
      <img src="../../public/animated_connectors.svg" alt="带动画连接器的Transformer架构" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>RAG技术图</strong><br />
      <p><strong>Prompt:</strong> Generate a RAG architecture diagram for **chat application**. Use connected diagram for data ingestion</p>
      <img src="../../public/rag_prod.svg" alt="RAG架构图" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>React和AWS认证流程</strong><br />
      <p><strong>Prompt:</strong> Generate authentication process using React with **AWS**. Use Serverless architecture.</p>
      <img src="../../public/auth.svg" alt="认证架构图" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>开放式创新</strong><br />
      <p><strong>Prompt:</strong> Create visualization of Henry Chesbrough's Open Innovation model.</p>
      <img src="../../public/inno.svg" alt="开放式创新图" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>猫咪素描</strong><br />
      <p><strong>Prompt:</strong> Draw a cute cat for me.</p>
      <img src="../../public/cat_demo.svg" alt="猫咪绘图" width="240" />
    </td>
  </tr>
</table>
</div>

## 功能特性

-   **LLM驱动的图表创建**：利用大语言模型通过自然语言命令直接创建和操作draw.io图表
-   **基于图像的图表复制**：上传现有图表或图像，让AI自动复制和增强
-   **PDF和文本文件上传**：上传PDF文档和文本文件，提取内容并从现有文档生成图表
-   **AI推理过程显示**：查看支持模型的AI思考过程（OpenAI o1/o3、Gemini、Claude等）
-   **图表历史记录**：全面的版本控制，跟踪所有更改，允许您查看和恢复AI编辑前的图表版本
-   **交互式聊天界面**：与AI实时对话来完善您的图表
-   **云架构图支持**：专门支持生成云架构图（AWS、GCP、Azure）
-   **动画连接器**：在图表元素之间创建动态动画连接器，实现更好的可视化效果

## MCP服务器

通过MCP（模型上下文协议）在Claude Desktop、Cursor和VS Code等AI代理中使用Next AI Draw.io。

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

### Claude Code CLI

```bash
claude mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

然后让Claude创建图表：
> "创建一个展示用户认证流程的流程图，包含登录、MFA和会话管理"

图表会实时显示在浏览器中！

详情请参阅[MCP服务器README](../../packages/mcp-server/README.md)，了解VS Code、Cursor等客户端配置。

## 快速开始

### 在线试用

无需安装！直接在我们的演示站点试用：

[![Live Demo](../../public/live-demo-button.svg)](https://next-ai-drawio.jiang.jp/)

> **使用自己的 API Key**：您可以使用自己的 API Key 来绕过演示站点的用量限制。点击聊天面板中的设置图标即可配置您的 Provider 和 API Key。您的 Key 仅保存在浏览器本地，不会被存储在服务器上。

### 桌面应用

从 [Releases 页面](https://github.com/DayuanJiang/next-ai-draw-io/releases) 下载适用于您平台的原生桌面应用：

支持的平台：Windows、macOS、Linux。

### 使用Docker运行

[查看 Docker 指南](./docker.md)

### 安装

1. 克隆仓库：

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
npm install
cp env.example .env.local
```

详细设置说明请参阅[提供商配置指南](./ai-providers.md)。

2. 运行开发服务器：

```bash
npm run dev
```

3. 在浏览器中打开 [http://localhost:6002](http://localhost:6002) 查看应用。

## 部署

### 部署到腾讯云EdgeOne Pages

您可以通过[腾讯云EdgeOne Pages](https://pages.edgeone.ai/zh)一键部署。

直接点击此按钮一键部署：
[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io)

查看[腾讯云EdgeOne Pages文档](https://pages.edgeone.ai/zh/document/product-introduction)了解更多详情。

同时，通过腾讯云EdgeOne Pages部署，也会获得[每日免费的DeepSeek模型额度](https://edgeone.cloud.tencent.com/pages/document/169925463311781888)。

### 部署到Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io)

部署Next.js应用最简单的方式是使用Next.js创建者提供的[Vercel平台](https://vercel.com/new)。请确保在Vercel控制台中**设置环境变量**，就像您在本地 `.env.local` 文件中所做的那样。

查看[Next.js部署文档](https://nextjs.org/docs/app/building-your-application/deploying)了解更多详情。

### 部署到Cloudflare Workers

[查看 Cloudflare 部署指南](./cloudflare-deploy.md)


## 多提供商支持

-   [字节跳动豆包](https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=Z9Z3LDTJ&utm_campaign=drawio&utm_content=drawio&utm_medium=devrel&utm_source=OWO&utm_term=drawio)
-   AWS Bedrock（默认）
-   OpenAI
-   Anthropic
-   Google AI
-   Google Vertex AI
-   Azure OpenAI
-   Ollama
-   OpenRouter
-   DeepSeek
-   SiliconFlow
-   ModelScope
-   SGLang
-   Vercel AI Gateway

除AWS Bedrock和OpenRouter外，所有提供商都支持自定义端点。

📖 **[详细的提供商配置指南](./ai-providers.md)** - 查看各提供商的设置说明。

### 服务端多模型配置

管理员可以配置多个服务端模型，让所有用户无需提供个人 API Key 即可使用。通过 `AI_MODELS_CONFIG` 环境变量（JSON 字符串）或 `ai-models.json` 文件配置。

**模型要求**：此任务需要强大的模型能力，因为它涉及生成具有严格格式约束的长文本（draw.io XML）。推荐使用 Claude Sonnet 4.5、GPT-5.1、Gemini 3 Pro 和 DeepSeek V3.2/R1。

注意：`claude` 系列已在带有 AWS、Azure、GCP 等云架构 Logo 的 draw.io 图表上进行训练，因此如果您想创建云架构图，这是最佳选择。


## 工作原理

本应用使用以下技术：

-   **Next.js**：用于前端框架和路由
-   **Vercel AI SDK**（`ai` + `@ai-sdk/*`）：用于流式AI响应和多提供商支持
-   **react-drawio**：用于图表表示和操作

图表以XML格式表示，可在draw.io中渲染。AI处理您的命令并相应地生成或修改此XML。


## 支持与联系

**特别感谢[字节跳动豆包](https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=Z9Z3LDTJ&utm_campaign=drawio&utm_content=drawio&utm_medium=devrel&utm_source=OWO&utm_term=drawio)赞助演示站点的 API Token 使用！** 注册火山引擎 ARK 平台即可获得50万免费Token！

如果您觉得这个项目有用，请考虑[赞助](https://github.com/sponsors/DayuanJiang)来帮助我托管在线演示站点！

如需支持或咨询，请在GitHub仓库上提交issue或联系维护者：

-   邮箱：me[at]jiang.jp

## 常见问题

请参阅 [FAQ](./FAQ.md) 了解常见问题和解决方案。

## Star历史

[![Star History Chart](https://api.star-history.com/svg?repos=DayuanJiang/next-ai-draw-io&type=date&legend=top-left)](https://www.star-history.com/#DayuanJiang/next-ai-draw-io&type=date&legend=top-left)

---
