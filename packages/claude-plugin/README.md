# Next AI Draw.io - Claude Code Plugin

AI-powered Draw.io diagram generation with real-time browser preview for Claude Code.

## Installation

### From the Claude Code community marketplace

```
/plugin install next-ai-drawio --marketplace anthropics/claude-plugins-community
```

This needs Claude Code 2.1.275 or later. On an older version, run `/plugin marketplace add anthropics/claude-plugins-community` first, then `/plugin install next-ai-drawio@claude-community`.

### Manual Installation

```bash
claude --plugin-dir /path/to/packages/claude-plugin
```

Or add the MCP server directly, for every project (`--scope user`):
```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

## Features

- **Real-time Preview**: Diagrams appear and update in your browser as Claude creates them. The preview is the web app's canvas: a change Claude makes to the page on screen is outlined, and one Ctrl+Z takes it back
- **Selection**: Select shapes in the preview and say "move these"; Claude reads what you selected with `get_selection`
- **Drawing Rules and Shape Libraries**: Claude gets the web app's layout and style rules and the icon docs for AWS, Azure, GCP, Kubernetes and more
- **Self-check**: Claude can take a screenshot of the rendered diagram and fix what looks wrong
- **Draw from Your Files**: ask Claude to draw from a document, image or web page; it reads the source with its own tools and draws. Existing .drawio files open with load_diagram
- **Version History**: The last 20 versions appear as cards next to the canvas, with thumbnails; restore one, undo the latest, or compare a version with the canvas
- **Natural Language**: Describe diagrams in plain text - flowcharts, architecture diagrams, etc.
- **Edit Support**: Modify existing diagrams with natural language instructions, including your own edits in the browser
- **Export**: Save diagrams as `.drawio`, `.png`, `.svg`, or `.drawio.svg` files
- **Auto-save**: Each diagram is saved to `~/.next-ai-drawio/`, so `claude --resume` can pick it up again
- **Custom Instructions**: keep your own drawing rules in `~/.next-ai-drawio/instructions.md` (for example "Always draw in minimal style"); they are appended to the drawing guide on every call
- **Self-contained**: Embedded server and the draw.io editor in one package; the preview works offline after install

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

### 6. Draw From a Document

```
Read docs/architecture.md and draw the system as a diagram
```

### 7. Recreate a Sketch

```
Recreate the whiteboard photo at ~/Desktop/sketch.jpg as a clean draw.io diagram
```

## Available Tools

| Tool | Description |
|------|-------------|
| `start_session` | Opens browser with real-time diagram preview; the result includes the drawing rules. Pass `session_id` to continue a saved diagram |
| `list_saved_diagrams` | List the auto-saved diagrams of earlier sessions, newest first, with their pages |
| `get_drawing_guide` | Return the drawing rules again |
| `get_shape_library` | Return the shapes and icon styles of a library such as `aws4` |
| `create_new_diagram` | Create a new diagram from XML |
| `load_diagram` | Load a `.drawio` or `.drawio.svg` file from disk |
| `edit_diagram` | Edit diagram by ID-based operations; all or nothing |
| `get_diagram` | Get the current diagram XML |
| `get_selection` | Return the shapes and edges you selected in the preview, so Claude can act on "these" |
| `screenshot_diagram` | Return a PNG of a page so Claude can check the result |
| `export_diagram` | Save diagram to a `.drawio`, `.png`, `.svg`, or `.drawio.svg` file |
| `list_pages`, `add_page`, `rename_page`, `delete_page` | Work with multi-page diagrams |
| `restore_version` | Undo: go back to an earlier version from History (redo is possible too) |

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
| `DRAWIO_BASE_URL` | unset (the bundled draw.io) | An external draw.io, such as a self-hosted instance. With it Claude's changes are not outlined on the canvas, Ctrl+Z does not take them back and `get_selection` cannot read the selection |
| `DRAWIO_DATA_DIR` | `~/.next-ai-drawio` | Folder for auto-saved diagrams and your `instructions.md`; `off` turns auto-save off (`instructions.md` is then read from the default folder) |
| `DRAWIO_LANG` | unset | Language of the draw.io editor, such as `en`, `zh`, `zh-tw`, `ja` or `de`. Unset, draw.io chooses (the browser language on `embed.diagrams.net`, English on a self-hosted draw.io) and the user can change it under **Extras > Language** |
| `DRAWIO_UI` | unset | draw.io theme: `kennedy`, `atlas`, `dark`, `min`, `sketch` or `simple`. Unset, the user picks one under **Extras > Theme** |
| `DRAWIO_DARK` | `auto` | Dark mode of the preview and the editor until the user switches it with the button at the top right: `auto` follows the system, `1` starts dark, `0` starts light |
| `DRAWIO_PREVIEW_UI` | `shell` | The preview page; `classic` opens the previous preview page for one more release |
| `DRAWIO_AUTO_SCREENSHOT` | unset | Set to `true` to attach a screenshot to every `create_new_diagram` and `edit_diagram` result (costs 2 to 10 s per call) |
| `DEBUG` | unset | Set to `true` to log debug messages |

## Links

- [Homepage](https://next-ai-drawio.jiang.jp)
- [MCP server page](https://next-ai-drawio.jiang.jp/en/mcp): every client's setup and how it compares with other draw.io MCP servers
- [Use it from Claude Code](https://next-ai-drawio.jiang.jp/en/docs/claude-code): the docs page for this plugin
- [Gallery](https://next-ai-drawio.jiang.jp/en/gallery): diagrams Claude drew with this server, with their prompts
- [GitHub Repository](https://github.com/DayuanJiang/next-ai-draw-io)
- [MCP Server Documentation](https://github.com/DayuanJiang/next-ai-draw-io/tree/main/packages/mcp-server)

## License

Apache-2.0
