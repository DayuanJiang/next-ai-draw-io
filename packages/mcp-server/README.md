# Next AI Draw.io MCP Server

MCP (Model Context Protocol) server that enables AI agents like Claude Desktop and Cursor to generate and edit draw.io diagrams with **real-time browser preview**.

**Self-contained** - includes an embedded HTTP server, no external dependencies required.

## Features

- **Real-time Preview**: Diagrams appear and update in your browser as the AI creates them
- **Natural Language**: Describe diagrams in plain text - flowcharts, architecture diagrams, etc.
- **Edit Support**: Modify existing diagrams with natural language instructions
- **Export**: Save diagrams as `.drawio` files
- **Self-contained**: Embedded server, works offline (except draw.io UI which loads from embed.diagrams.net)

## Quick Start

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["-y", "@next-ai-drawio/mcp-server"]
    }
  }
}
```

That's it! The MCP server runs its own embedded HTTP server.

### Use with Claude

1. Restart Claude Desktop after updating config
2. Ask Claude to create a diagram:
   > "Create a flowchart showing user authentication with login, MFA, and session management"
3. The diagram appears in your browser in real-time!

## How It Works

```
┌─────────────────┐     stdio      ┌─────────────────┐
│  Claude Desktop │ <───────────> │   MCP Server    │
│    (AI Agent)   │               │  (this package) │
└─────────────────┘               └────────┬────────┘
                                           │
                                  ┌────────▼────────┐
                                  │ Embedded HTTP   │
                                  │ Server (:6002)  │
                                  └────────┬────────┘
                                           │
                                  ┌────────▼────────┐
                                  │  User's Browser │
                                  │ (draw.io embed) │
                                  └─────────────────┘
```

1. **MCP Server** receives tool calls from Claude via stdio
2. **Embedded HTTP Server** serves the draw.io UI and handles state
3. **Browser** shows real-time diagram updates via polling

## Available Tools

| Tool | Description |
|------|-------------|
| `start_session` | Opens browser with real-time diagram preview |
| `display_diagram` | Create a new diagram from XML |
| `edit_diagram` | Edit diagram by ID-based operations (update/add/delete cells) |
| `get_diagram` | Get the current diagram XML |
| `export_diagram` | Save diagram to a `.drawio` file |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `6002` | Port for the embedded HTTP server |

## Troubleshooting

### Port already in use

If port 6002 is in use, the server will automatically try the next available port.

Or set a custom port:
```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["-y", "@next-ai-drawio/mcp-server"],
      "env": { "PORT": "6003" }
    }
  }
}
```

### "No active session"

Call `start_session` first to open the browser window.

### Browser not updating

Check that the browser URL has the `?mcp=` query parameter. The MCP session ID connects the browser to the server.

## License

Apache-2.0
