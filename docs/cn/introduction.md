# 简介

Next AI Draw.io 让您通过和 AI 对话来绘制和修改 draw.io 图表。您描述一张图，AI 就在真正的 draw.io 画布上把它画出来；之后您可以手动继续修改，也可以让 AI 修改。AI 的每次修改都会被框出来，并保存为一个可以恢复的版本。

<!-- demo: tour -->

## 三种使用方式

| 在哪里用 | 您会得到什么 | 从这里开始 |
|---|---|---|
| 在浏览器里 | next-ai-drawio.jiang.jp 上的编辑器。无需安装；填入自己的 API Key，就不受演示站每日额度的限制 | [打开编辑器](https://next-ai-drawio.jiang.jp/) |
| 在桌面上 | 同一个应用，支持 Windows、macOS 和 Linux | [最新版本](https://github.com/DayuanJiang/next-ai-draw-io/releases/latest) |
| 在 AI 代理里 | 一个 MCP 服务器：Claude Code、Cursor、Codex 和 VS Code 根据您项目里的文件，在您浏览器里的同一块画布上画图 | [在 Claude Code 里使用](./claude-code.md) |

## 您可以做什么

- **生成**：用文字描述一张图，或者从截图、白板照片、PDF 或网页开始。
- **手动编辑**：画布就是 draw.io 编辑器。您可以像在 draw.io 里一样移动图形、更改样式和添加图形。
- **让 AI 修改**：选中几个图形，让 AI 只改这些图形；也可以让 AI 修改整张图。AI 会先读取您手动做的修改。
- **回退**：AI 的每次修改都会在聊天里生成一张版本卡片。您可以撤销最近一次修改，把某个版本和画布对比，或者恢复更早的版本。
- **导出**：保存为 `.drawio` 文件，以便在 draw.io 里继续编辑；也可以导出 PNG 或 SVG。

## 工作原理

一张图表就是一段 draw.io XML。应用会把您的请求和当前的图表发给您选择的 AI 模型，模型返回新的或修改后的 XML，画布会边接收边显示。draw.io 编辑器随应用一起打包，所以应用可以直接控制它，并读回您的修改。

应用使用以下技术构建：

- **Next.js**：页面和 API
- **Vercel AI SDK**（`ai` 和 `@ai-sdk/*`）：从多家 AI 服务商流式获取回答
- **draw.io**：编辑器

## AI 服务商

演示站有每日用量限制。您可以在“设置”里选择其他服务商，并填入自己的 Key；Key 保存在您的浏览器里，不会存到服务器上。自己部署应用时，用环境变量配置服务商，见 [AI 服务商](./ai-providers.md)。

## 下一步

- 在网页版里[绘制和编辑](./editor.md)
- [版本与撤销](./versions.md)
- [在 Claude Code 里使用](./claude-code.md)，或在[其他 MCP 客户端](./mcp-clients.md)里使用
- [AWS 架构图](./aws-architecture.md)，以及[流程图和时序图](./flowcharts.md)
- [使用 Docker 运行](./docker.md)
- [常见问题解答](./FAQ.md)
