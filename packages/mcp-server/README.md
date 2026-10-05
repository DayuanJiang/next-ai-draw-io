# Next AI Draw.io MCP Server

MCP (Model Context Protocol) server that enables AI agents like Claude Desktop and Cursor to generate and edit draw.io diagrams with **real-time browser preview**.

**Self-contained** - includes an embedded HTTP server, no external dependencies required.

## Quick Start

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

## Installation

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

### VS Code

Add to your VS Code settings (`.vscode/mcp.json` in workspace or user settings):

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

### Cursor

Add to Cursor MCP config (`~/.cursor/mcp.json`):

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

### Cline (VS Code Extension)

1. Click the **MCP Servers** icon in Cline's top menu bar
2. Select the **Configure** tab
3. Click **Configure MCP Servers** to edit `cline_mcp_settings.json`
4. Add the drawio server:

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

### Other MCP Clients

Use the standard MCP configuration with:
- **Command**: `npx`
- **Args**: `["@next-ai-drawio/mcp-server@latest"]`

## Usage

1. Restart your MCP client after updating config
2. Ask the AI to create a diagram:
   > "Create a flowchart showing user authentication with login, MFA, and session management"
3. The diagram appears in your browser in real-time!

## Features

- **Real-time Preview**: Diagrams appear and update in your browser as the AI creates them
- **Drawing Rules**: The AI gets the same layout, edge and style rules as the web app, plus the shape library docs (AWS, Azure, GCP, Kubernetes, Cisco and more), so it uses real icon names instead of guessing
- **Self-check**: The AI can take a screenshot of the rendered diagram and fix overlapping shapes or edges that cross shapes
- **Edit Support**: Modify existing diagrams with natural language instructions. If any change in an edit fails, nothing is written and the AI gets the reason and the current page XML
- **Your Edits Are Kept**: Changes you make in the browser are read before the AI edits again. If the AI overwrites a change you were still making, your version is saved in History
- **Version History**: Click **History** at the top right of the preview page to restore one of the last 20 versions, shown as thumbnails
- **Download and Export**: Save as `.drawio`, `.png`, `.svg`, or `.drawio.svg` (an SVG with the diagram embedded, which draw.io can open and edit again), from the **Download** button or through `export_diagram`
- **Multi-page**: List, add, rename, and delete pages, and edit any page
- **Auto-save**: Each session's diagram is saved to `~/.next-ai-drawio/<session-id>.drawio`, so it survives a restart of the MCP client
- **Themes and Dark Mode**: Pick a draw.io theme under **Extras > Theme**; the page follows the system dark mode
- **Self-contained**: Embedded server, works offline (except draw.io UI which loads from `embed.diagrams.net` by default, configurable via `DRAWIO_BASE_URL`)

## Available Tools

| Tool | Description |
|------|-------------|
| `start_session` | Opens browser with real-time diagram preview; the result includes the drawing rules |
| `get_drawing_guide` | Return the drawing rules again, for example after a long conversation was compacted |
| `get_shape_library` | Return the shapes and icon styles of a library such as `aws4`, `azure2`, or `kubernetes` |
| `create_new_diagram` | Create a new diagram from XML; a plain list of `mxCell` elements is enough |
| `load_diagram` | Load a `.drawio` file from disk into the session (handles compressed files) |
| `edit_diagram` | Edit diagram by ID-based operations (update/add/delete cells); all or nothing |
| `get_diagram` | Get the current diagram XML, including your edits in the browser |
| `screenshot_diagram` | Return a PNG of a page so the AI can check the rendered diagram |
| `export_diagram` | Save diagram to a `.drawio`, `.png`, `.svg`, or `.drawio.svg` file |
| `list_pages` | List every page (tab) with id, name, index, and cell count |
| `add_page` | Append a new page without touching existing ones |
| `rename_page` | Rename a page |
| `delete_page` | Delete a page (refuses to delete the last one) |

## Continue a Diagram Later

After every change, the diagram is saved as a normal `.drawio` file in `~/.next-ai-drawio/`, and `start_session` tells the AI the file path. When you resume a conversation after restarting your MCP client (for example `claude --resume`), the AI calls `start_session` and then `load_diagram` with that path. You can also open the file in draw.io yourself.

The newest 50 files are kept. Set `DRAWIO_DATA_DIR` to use another folder, or to `off` to turn auto-save off.

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

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `6002` | Port for the embedded HTTP server |
| `DRAWIO_BASE_URL` | `https://embed.diagrams.net` | Base URL for the draw.io embed. Set this to use a self-hosted draw.io instance for private deployments. |
| `DRAWIO_DATA_DIR` | `~/.next-ai-drawio` | Folder for the auto-saved `.drawio` files. Set to `off` to turn auto-save off. |
| `DEBUG` | unset | Set to `true` to log debug messages to stderr. |

### Private Deployment (Self-hosted draw.io)

For security-sensitive environments that require private deployment of draw.io:

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["@next-ai-drawio/mcp-server@latest"],
      "env": { 
        "DRAWIO_BASE_URL": "https://drawio.your-company.com"
      }
    }
  }
}
```

You can deploy your own draw.io instance using the official Docker image:

```bash
docker run -d -p 8080:8080 jgraph/drawio
```

Then set `DRAWIO_BASE_URL=http://localhost:8080` (or your server's URL). The preview page loads nothing else from the internet, so with a local draw.io it works offline. One exception: shapes from the Material Design library show icons from `fonts.gstatic.com`.

## Troubleshooting

### Port already in use

If port 6002 is in use, the server will automatically try the next available port (up to 6020).

Or set a custom port:
```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["@next-ai-drawio/mcp-server@latest"],
      "env": { "PORT": "6003" }
    }
  }
}
```

### "No active session"

Call `start_session` first to open the browser window.

### Browser not updating

Check that the browser URL has the `?mcp=` query parameter. The MCP session ID connects the browser to the server.

### Screenshot or PNG/SVG export times out

PNG and SVG files are rendered by draw.io in the preview tab. Browsers slow down tabs that stay in the background, so the tab may not answer in time. Bring the preview tab to the front and try again.

## License

Apache-2.0
