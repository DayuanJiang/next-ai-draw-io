# 在 Claude Code 里使用

MCP 服务器让 Claude Code 根据您项目里的文件绘制 draw.io 图表。图表显示在您浏览器里的一块实时画布上，这块画布和网页版的一样：您可以手动编辑，Claude 再次修改图表之前会先读取您的改动。

## 安装

需要 Node.js 18 或更高版本。在终端里运行：

```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

`--scope user` 让所有项目都能用这些工具。不加的话，只有在运行命令的那个文件夹里才能用。

也可以从 Claude Code 社区插件市场把它作为插件安装（需要 Claude Code 2.1.275 或更高版本）：

```text
/plugin install next-ai-drawio --marketplace anthropics/claude-plugins-community
```

新开一个 Claude Code 会话。连接成功后，`/mcp` 会列出 `drawio`。

Codex、VS Code、Cursor 和其他客户端的用法，见 [MCP 服务器 README](../../packages/mcp-server/README.md)。

## 画第一张图

请 Claude 把它能读到的内容画成图：

```text
读一下这个仓库，画出它的架构
```

Claude 会用自己的工具读取代码，在您的浏览器里打开预览，并在那里画图。较大的图表会分几次画完，您可以看到它逐步成形。

其他效果不错的请求：

- “把结账 API 的请求流程画成时序图”
- “把 docs/architecture.md 转成带 AWS 图标的图表”
- “打开 diagrams/system.drawio，加上新的队列服务”

<!-- demo: mcp -->

## 一起修改图表

- **手动编辑。** 预览就是完整的 draw.io 编辑器。您可以移动图形、修改标签或更改样式；Claude 再次编辑前会读取图表，包括您的改动。
- **选中图形。** 在预览里选中图形，然后说“把这些改成蓝色”或“把这个拆成两个服务”。Claude 会读取您选中的内容。
- **查看改动。** Claude 的修改会被框出几秒钟。在预览里按 Ctrl+Z，可以撤回它的上一次修改。
- **回到更早的版本。** 最近 20 个版本以卡片形式显示在画布旁边，您可以对比或恢复其中一个。也可以让 Claude 撤销。

## 保存和导出

每次修改都会保存到 `~/.next-ai-drawio/<session-id>.drawio`，连同最近 20 个版本；最新的 50 张图表会被保留。想在之后的对话里继续画某张图，告诉 Claude 您要哪张图即可：它会找到保存的图表并重新打开。

需要文件时，请让 Claude 导出：`.drawio`、`.png`、`.svg` 或 `.drawio.svg`。`.drawio.svg` 文件是一张图片，draw.io 也能打开和编辑它，适合放在 README 文件里。

## 自己的画图规则

把规则写在 `~/.next-ai-drawio/instructions.md` 里，例如“始终使用简约风格”。每次调用时，这些规则都会加到绘图指南里，所以修改规则后无需重启就会生效。只读取前 5000 个字符。

## 设置

环境变量可以改变服务器的工作方式。添加服务器时用 `-e` 传入：

```bash
claude mcp add --scope user drawio -e DRAWIO_LANG=ja -- npx @next-ai-drawio/mcp-server@latest
```

| 变量 | 默认值 | 作用 |
|---|---|---|
| `PORT` | `6002` | 预览端口；被占用时，会使用下一个空闲端口，最高到 6020 |
| `DRAWIO_DATA_DIR` | `~/.next-ai-drawio` | 保存图表和 `instructions.md` 的文件夹；设为 `off` 则不保存 |
| `DRAWIO_AUTO_SCREENSHOT` | 未设置 | 设为 `true` 时，每次创建和编辑的结果都会附带一张截图（每次调用 2 到 10 秒） |
| `DRAWIO_LANG` | 未设置 | 固定编辑器和预览的语言：`en`、`zh`、`zh-tw`、`ja`、`de` 等 |
| `DRAWIO_DARK` | `auto` | `1` 以深色启动，`0` 以浅色启动，`auto` 跟随系统 |
| `BROWSER` | 未设置 | 设为 `none` 时不会自动打开预览 |

所有变量，以及如何使用自建的 draw.io，见 [MCP 服务器 README](../../packages/mcp-server/README.md#configuration)。

## 问题排查

- **预览没有打开。** 向 Claude 要预览的 URL，然后自己打开；URL 里的 `?mcp=` 部分会把页面连接到这个会话。
- **在 VS Code 的 Simple Browser 或 Cursor 的浏览器里，预览一片空白。** 这个页面不允许被嵌入到其他页面中。请在普通浏览器里打开这个 URL。
- **截图或 PNG/SVG 导出超时。** 它们由预览标签页渲染，而浏览器会降低后台标签页的运行速度。请把这个标签页切到前台，再试一次。
- **“No active session”。** Claude 需要先启动会话；请让它重新启动 drawio 会话。
