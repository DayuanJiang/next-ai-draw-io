# Next AI Draw.io

<div align="center">

**AI驱动的图表创建工具 - 对话、绘制、可视化**

[English](../README.md) | 中文 | [日本語](./README_JA.md)

[![TrendShift](https://trendshift.io/api/badge/repositories/15449)](https://next-ai-drawio.jiang.jp/)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Next.js](https://img.shields.io/badge/Next.js-16.x-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61dafb)](https://react.dev/)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ea4aaa)](https://github.com/sponsors/DayuanJiang)

[![Live Demo](../public/live-demo-button.svg)](https://next-ai-drawio.jiang.jp/)

</div>

一个集成了AI功能的Next.js网页应用，与draw.io图表无缝结合。通过自然语言命令和AI辅助可视化来创建、修改和增强图表。

> 注：感谢 <img src="https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/public/doubao-color.png" alt="" height="20" /> [字节跳动豆包](https://console.volcengine.com/ark/region:ark+cn-beijing/overview?briefPage=0&briefType=introduce&type=new&utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project) 的赞助支持，本项目的 Demo 现已接入强大的 K2-thinking 模型！

https://github.com/user-attachments/assets/b2eef5f3-b335-4e71-a755-dc2e80931979

## 目录
- [Next AI Draw.io](#next-ai-drawio)
  - [目录](#目录)
  - [示例](#示例)
  - [功能特性](#功能特性)
  - [MCP服务器（预览）](#mcp服务器预览)
  - [快速开始](#快速开始)
    - [在线试用](#在线试用)
    - [使用Docker运行（推荐）](#使用docker运行推荐)
    - [安装](#安装)
  - [部署](#部署)
  - [多提供商支持](#多提供商支持)
  - [工作原理](#工作原理)
  - [项目结构](#项目结构)
  - [支持与联系](#支持与联系)
  - [Star历史](#star历史)

## 示例

以下是一些示例提示词及其生成的图表：

<div align="center">
<table width="100%">
  <tr>
    <td colspan="2" valign="top" align="center">
      <strong>动画Transformer连接器</strong><br />
      <p><strong>提示词：</strong> 给我一个带有**动画连接器**的Transformer架构图。</p>
      <img src="../public/animated_connectors.svg" alt="带动画连接器的Transformer架构" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>GCP架构图</strong><br />
      <p><strong>提示词：</strong> 使用**GCP图标**生成一个GCP架构图。在这个图中，用户连接到托管在实例上的前端。</p>
      <img src="../public/gcp_demo.svg" alt="GCP架构图" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>AWS架构图</strong><br />
      <p><strong>提示词：</strong> 使用**AWS图标**生成一个AWS架构图。在这个图中，用户连接到托管在实例上的前端。</p>
      <img src="../public/aws_demo.svg" alt="AWS架构图" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Azure架构图</strong><br />
      <p><strong>提示词：</strong> 使用**Azure图标**生成一个Azure架构图。在这个图中，用户连接到托管在实例上的前端。</p>
      <img src="../public/azure_demo.svg" alt="Azure架构图" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>猫咪素描</strong><br />
      <p><strong>提示词：</strong> 给我画一只可爱的猫。</p>
      <img src="../public/cat_demo.svg" alt="猫咪绘图" width="240" />
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

## MCP服务器（预览）

> **预览功能**：此功能为实验性功能，可能会有变化。

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

详情请参阅[MCP服务器README](../packages/mcp-server/README.md)，了解VS Code、Cursor等客户端配置。

## 快速开始

### 在线试用

无需安装！直接在我们的演示站点试用：

[![Live Demo](../public/live-demo-button.svg)](https://next-ai-drawio.jiang.jp/)

> **使用自己的 API Key**：您可以使用自己的 API Key 来绕过演示站点的用量限制。点击聊天面板中的设置图标即可配置您的 Provider 和 API Key。您的 Key 仅保存在浏览器本地，不会被存储在服务器上。

### 使用Docker运行（推荐）

如果您只想在本地运行，最好的方式是使用Docker。

首先，如果您还没有安装Docker，请先安装：[获取Docker](https://docs.docker.com/get-docker/)

然后运行：

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

或者使用 env 文件：

```bash
cp env.example .env
# 编辑 .env 填写您的配置
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。

请根据您首选的AI提供商配置替换环境变量。可用选项请参阅[多提供商支持](#多提供商支持)。

> **离线部署：** 如果 `embed.diagrams.net` 被屏蔽，请参阅 [离线部署指南](./offline-deployment.md) 了解配置选项。

### 安装

1. 克隆仓库：

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
```

2. 安装依赖：

```bash
npm install
```

3. 配置您的AI提供商：

在根目录创建 `.env.local` 文件：

```bash
cp env.example .env.local
```

编辑 `.env.local` 并配置您选择的提供商：

-   将 `AI_PROVIDER` 设置为您选择的提供商（bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek, siliconflow, doubao）
-   将 `AI_MODEL` 设置为您要使用的特定模型
-   添加您的提供商所需的API密钥
-   `TEMPERATURE`：可选的温度设置（例如 `0` 表示确定性输出）。对于不支持此参数的模型（如推理模型），请不要设置。
-   `ACCESS_CODE_LIST` 访问密码，可选，可以使用逗号隔开多个密码。

> 警告：如果不填写 `ACCESS_CODE_LIST`，则任何人都可以直接使用你部署后的网站，可能会导致你的 token 被急速消耗完毕，建议填写此选项。

详细设置说明请参阅[提供商配置指南](./ai-providers.md)。

4. 运行开发服务器：

```bash
npm run dev
```

5. 在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看应用。

## 部署

部署Next.js应用最简单的方式是使用Next.js创建者提供的[Vercel平台](https://vercel.com/new)。

查看[Next.js部署文档](https://nextjs.org/docs/app/building-your-application/deploying)了解更多详情。

或者您可以通过此按钮部署：
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io)

请确保在Vercel控制台中**设置环境变量**，就像您在本地 `.env.local` 文件中所做的那样。


## 多提供商支持

-   [字节跳动豆包](https://console.volcengine.com/ark/region:ark+cn-beijing/overview?briefPage=0&briefType=introduce&type=new&utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project)
-   AWS Bedrock（默认）
-   OpenAI
-   Anthropic
-   Google AI
-   Azure OpenAI
-   Ollama
-   OpenRouter
-   DeepSeek
-   SiliconFlow

除AWS Bedrock和OpenRouter外，所有提供商都支持自定义端点。

📖 **[详细的提供商配置指南](./ai-providers.md)** - 查看各提供商的设置说明。

**模型要求**：此任务需要强大的模型能力，因为它涉及生成具有严格格式约束的长文本（draw.io XML）。推荐使用Claude Sonnet 4.5、GPT-4o、Gemini 2.0和DeepSeek V3/R1。

注意：`claude-sonnet-4-5` 已在带有AWS标志的draw.io图表上进行训练，因此如果您想创建AWS架构图，这是最佳选择。


## 工作原理

本应用使用以下技术：

-   **Next.js**：用于前端框架和路由
-   **Vercel AI SDK**（`ai` + `@ai-sdk/*`）：用于流式AI响应和多提供商支持
-   **react-drawio**：用于图表表示和操作

图表以XML格式表示，可在draw.io中渲染。AI处理您的命令并相应地生成或修改此XML。

## 项目结构

```
app/                  # Next.js App Router
  api/chat/           # 带AI工具的聊天API端点
  page.tsx            # 带DrawIO嵌入的主页面
components/           # React组件
  chat-panel.tsx      # 带图表控制的聊天界面
  chat-input.tsx      # 带文件上传的用户输入组件
  history-dialog.tsx  # 图表版本历史查看器
  ui/                 # UI组件（按钮、卡片等）
contexts/             # React上下文提供者
  diagram-context.tsx # 全局图表状态管理
lib/                  # 工具函数和辅助程序
  ai-providers.ts     # 多提供商AI配置
  utils.ts            # XML处理和转换工具
public/               # 静态资源包括示例图片
```

## 支持与联系

**特别感谢[字节跳动豆包](https://console.volcengine.com/ark/region:ark+cn-beijing/overview?briefPage=0&briefType=introduce&type=new&utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project)赞助演示站点的 API Token 使用！** 注册火山引擎 ARK 平台即可获得50万免费Token！

如果您觉得这个项目有用，请考虑[赞助](https://github.com/sponsors/DayuanJiang)来帮助我托管在线演示站点！

如需支持或咨询，请在GitHub仓库上提交issue或联系维护者：

-   邮箱：me[at]jiang.jp

## Star历史

[![Star History Chart](https://api.star-history.com/svg?repos=DayuanJiang/next-ai-draw-io&type=date&legend=top-left)](https://www.star-history.com/#DayuanJiang/next-ai-draw-io&type=date&legend=top-left)

---
