# Next AI Draw.io - Claude Code Plugin

AI-powered Draw.io diagram generation with real-time browser preview for Claude Code.

## Installation

### From Plugin Directory (Coming Soon)

Once approved, install via:
```
/plugin install next-ai-drawio
```

### Manual Installation

```bash
claude --plugin-dir /path/to/packages/claude-plugin
```

Or add the MCP server directly:
```bash
claude mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

## Features

- **Real-time Preview**: Diagrams appear and update in your browser as Claude creates them
- **Drawing Rules and Shape Libraries**: Claude gets the web app's layout and style rules and the icon docs for AWS, Azure, GCP, Kubernetes and more
- **Self-check**: Claude can take a screenshot of the rendered diagram and fix what looks wrong
- **Version History**: Restore one of the last 20 versions from the **History** button, shown as thumbnails
- **Natural Language**: Describe diagrams in plain text - flowcharts, architecture diagrams, etc.
- **Edit Support**: Modify existing diagrams with natural language instructions, including your own edits in the browser
- **Export**: Save diagrams as `.drawio`, `.png`, `.svg`, or `.drawio.svg` files
- **Auto-save**: Each diagram is saved to `~/.next-ai-drawio/`, so `claude --resume` can pick it up again
- **Self-contained**: Embedded server, no external dependencies required

## Use Case Examples

### 1. Create Architecture Diagrams

```
Generate an AWS architecture diagram with Lambda, API Gateway, DynamoDB,
and S3 for a serverless REST API
```

### 2. Flowchart Generation

```
Create a flowchart showing the CI/CD pipeline: code commit -> build ->
test -> staging deploy -> production deploy with approval gates
```

### 3. System Design Documentation

```
Design a microservices e-commerce system with user service, product catalog,
shopping cart, order processing, and payment gateway
```

### 4. Cloud Architecture (AWS/GCP/Azure)

```
Generate a GCP architecture diagram with Cloud Run, Cloud SQL, and
Cloud Storage for a web application
```

### 5. Sequence Diagrams

```
Create a sequence diagram showing OAuth 2.0 authorization code flow
between user, client app, auth server, and resource server
```

## Available Tools

| Tool | Description |
|------|-------------|
| `start_session` | Opens browser with real-time diagram preview; the result includes the drawing rules |
| `get_drawing_guide` | Return the drawing rules again |
| `get_shape_library` | Return the shapes and icon styles of a library such as `aws4` |
| `create_new_diagram` | Create a new diagram from XML |
| `load_diagram` | Load a `.drawio` file from disk |
| `edit_diagram` | Edit diagram by ID-based operations; all or nothing |
| `get_diagram` | Get the current diagram XML |
| `screenshot_diagram` | Return a PNG of a page so Claude can check the result |
| `export_diagram` | Save diagram to a `.drawio`, `.png`, `.svg`, or `.drawio.svg` file |
| `list_pages`, `add_page`, `rename_page`, `delete_page` | Work with multi-page diagrams |

## How It Works

```
Claude Code <--stdio--> MCP Server <--http--> Browser (draw.io)
```

1. Ask Claude to create a diagram
2. Claude calls `start_session` to open a browser window
3. Claude generates diagram XML and sends it to the browser
4. You see the diagram update in real-time!

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `6002` | Port for the embedded HTTP server |
| `DRAWIO_BASE_URL` | `https://embed.diagrams.net` | Base URL for draw.io (for self-hosted deployments) |
| `DRAWIO_DATA_DIR` | `~/.next-ai-drawio` | Folder for auto-saved diagrams; `off` turns auto-save off |
| `DEBUG` | unset | Set to `true` to log debug messages |

## Links

- [Homepage](https://next-ai-drawio.jiang.jp)
- [GitHub Repository](https://github.com/DayuanJiang/next-ai-draw-io)
- [MCP Server Documentation](https://github.com/DayuanJiang/next-ai-draw-io/tree/main/packages/mcp-server)

## License

Apache-2.0
