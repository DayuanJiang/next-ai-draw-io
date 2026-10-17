# Other MCP clients

The MCP server works with any client that runs local MCP servers over stdio: Codex CLI, VS Code, Cursor, Claude Desktop, Cline and more. You need Node.js 18 or later. For Claude Code, see [Use it from Claude Code](./claude-code.md).

## Let your agent install it

Paste this into Codex, Cursor, VS Code, Cline or any agent that can edit files and run commands:

```text
Install the drawio MCP server for the client you are running in, following
https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/packages/mcp-server/README.md
Install it for all my projects (user scope, for Claude Code "--scope user"),
name the server "drawio" and keep the servers that are already configured.
Then tell me how to reload so its tools show up.
```

## Codex CLI

```bash
codex mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

Codex asks before each drawio tool that changes the diagram, and `codex exec` without full access fails with "MCP tool call requires approval". To let the drawio tools run without asking, add one line to the server's section in `~/.codex/config.toml`:

```toml
[mcp_servers.drawio]
command = "npx"
args = ["@next-ai-drawio/mcp-server@latest"]
default_tools_approval_mode = "approve"
```

To approve only some tools, use `[mcp_servers.drawio.tools.<tool name>]` with `approval_mode = "approve"` instead.

## VS Code

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "drawio": { "type": "stdio", "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

## Cursor, Claude Desktop, Cline and others

Most clients use the same format, in `~/.cursor/mcp.json`, `claude_desktop_config.json`, `cline_mcp_settings.json` or their own MCP settings:

```json
{
  "mcpServers": {
    "drawio": { "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

Settings go in the server's `env`, for example `"env": { "DRAWIO_LANG": "ja" }`. The variables are listed in [Use it from Claude Code](./claude-code.md#settings).

## After installing

Restart the client, then ask, for example, "Read this repo and draw its architecture". The preview opens in your browser and the diagram appears as it is drawn.

<!-- demo: mcp -->

The preview refuses to be embedded in other pages, so VS Code's Simple Browser and Cursor's browser show it blank. Open its URL in a regular browser.
