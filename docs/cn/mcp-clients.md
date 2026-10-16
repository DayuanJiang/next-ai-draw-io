# 其他 MCP 客户端

MCP 服务器适用于任何能通过 stdio 运行本地 MCP 服务器的客户端：Codex CLI、VS Code、Cursor、Claude Desktop、Cline 等。需要 Node.js 18 或更高版本。Claude Code 的用法见[在 Claude Code 里使用](./claude-code.md)。

## 让代理来安装

把下面这段粘贴到 Codex、Cursor、VS Code、Cline，或任何能编辑文件和运行命令的代理里：

```text
按照 https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/packages/mcp-server/README.md
为你当前所在的客户端安装 drawio MCP 服务器。
安装到我的所有项目（用户范围，Claude Code 用 "--scope user"），
服务器名叫 "drawio"，保留已经配置好的服务器。
然后告诉我怎样重新加载，才能看到它的工具。
```

## Codex CLI

```bash
codex mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

Codex 每次调用会修改图表的 drawio 工具前，都会先询问您；没有完全权限的 `codex exec` 会报错“MCP tool call requires approval”。想让 drawio 工具不经询问直接运行，请在 `~/.codex/config.toml` 里这个服务器的配置下加一行：

```toml
[mcp_servers.drawio]
command = "npx"
args = ["@next-ai-drawio/mcp-server@latest"]
default_tools_approval_mode = "approve"
```

只想放行部分工具时，改用 `[mcp_servers.drawio.tools.<工具名>]`，并设置 `approval_mode = "approve"`。

## VS Code

写在 `.vscode/mcp.json` 里：

```json
{
  "servers": {
    "drawio": { "type": "stdio", "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

## Cursor、Claude Desktop、Cline 等

大多数客户端使用同样的格式，写在 `~/.cursor/mcp.json`、`claude_desktop_config.json`、`cline_mcp_settings.json` 或它们自己的 MCP 配置里：

```json
{
  "mcpServers": {
    "drawio": { "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

设置写在服务器的 `env` 里，例如 `"env": { "DRAWIO_LANG": "ja" }`。所有变量列在[在 Claude Code 里使用](./claude-code.md)页面中。

## 安装之后

重启客户端，然后提一个需求，比如“读一下这个仓库，画出它的架构”。浏览器里会打开预览，图表会边画边显示。

<!-- demo: mcp -->

预览页不允许被嵌入到其他页面中，所以 VS Code 的 Simple Browser 和 Cursor 的浏览器里会显示空白。请在普通浏览器里打开它的 URL。
