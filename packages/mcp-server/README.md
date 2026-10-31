# Next AI Draw.io MCP Server

An MCP server that lets Claude Code, Cursor, VS Code and other AI agents draw draw.io diagrams from your project's files, with a live preview in your browser. The preview is the canvas of the [Next AI Draw.io web app](https://next-ai-drawio.jiang.jp/): the AI's changes are outlined, Ctrl+Z takes them back, and you can edit by hand at any time.

https://github.com/user-attachments/assets/6f53a67b-ab21-4113-9fee-7fb32f9de678

## Install

In VS Code or Cursor, one click adds it: [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522drawio%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540next-ai-drawio%252Fmcp-server%2540latest%2522%255D%257D) [![Add to Cursor](https://img.shields.io/badge/Cursor-Add_Server-000000?style=flat-square)](https://cursor.com/en/install-mcp?name=drawio&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAbmV4dC1haS1kcmF3aW8vbWNwLXNlcnZlckBsYXRlc3QiXX0%3D)

### Let your AI agent install it

Paste this into Claude Code, Codex, Cursor, VS Code, Cline or any agent that can edit files and run commands:

```text
Install the drawio MCP server for the client you are running in, following
https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/packages/mcp-server/README.md
Install it for all my projects (user scope, for Claude Code "--scope user"),
name the server "drawio" and keep the servers that are already configured.
Then tell me how to reload so its tools show up.
```

### Install by hand

**Claude Code**

```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

`--scope user` makes the tools available in every project. Without it, they exist only in the folder where you ran the command.

Or install it as a plugin from the Claude Code community marketplace (Claude Code 2.1.275 or later):

```text
/plugin install next-ai-drawio --marketplace anthropics/claude-plugins-community
```

**Codex CLI**

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

**VS Code** (`.vscode/mcp.json`)

```json
{
  "servers": {
    "drawio": { "type": "stdio", "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

**DeepSeek Harness**: install the [plugin](https://github.com/DayuanJiang/next-ai-draw-io/tree/main/packages/dsh-plugin) into the profile you start DSH with (`web` for `dsh web`). The agent replies with the preview link; clicking it opens the preview in DSH's right sidebar.

```bash
dsh plugin --profile web add @next-ai-drawio/dsh
```

**Cursor, Claude Desktop, Cline and most other clients** (`~/.cursor/mcp.json`, `claude_desktop_config.json`, `cline_mcp_settings.json`)

```json
{
  "mcpServers": {
    "drawio": { "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}
```

Restart the client, then ask, for example, "Read this repo and draw its architecture". The preview opens in your browser and the diagram appears as it is drawn.

## Features

- **Draws from your project**: the agent reads your code and documents with its own tools. Existing `.drawio` and `.drawio.svg` files open with `load_diagram`.
- **The web app's canvas**: the AI's changes are outlined for a few seconds (never in exports) and one Ctrl+Z takes them back. Select shapes and say "these" (`get_selection`). Your hand edits are read before the AI edits again.
- **Real icons**: the web app's drawing rules and shape libraries (AWS, Azure, GCP, Kubernetes, Cisco and more), so the AI uses real icon names.
- **Self-check**: the AI can look at a screenshot of the rendered diagram and fix overlaps (`screenshot: true`, or `screenshot_diagram`).
- **Versions**: the last 20 versions as cards next to the canvas; restore or compare one, or ask the AI to undo (`restore_version`).
- **Pages and export**: multi-page diagrams; save as `.drawio`, `.png`, `.svg` or `.drawio.svg`. Images get a 20 px margin, and PNGs a white background (`transparent: true` for none).
- **Offline**: the draw.io editor ships inside the package.

## Choosing a draw.io MCP server

Several MCP servers draw draw.io diagrams. As of October 2026 they differ like this:

| Server | How you see and change the diagram | A good fit when |
|---|---|---|
| This server, `@next-ai-drawio/mcp-server` | A live draw.io canvas in your browser. The AI reads it back, including your hand edits and selection; its changes are outlined, Ctrl+Z takes them back, and earlier versions can be restored | You and the AI take turns on the same diagram |
| draw.io's official [`@drawio/mcp`](https://github.com/jgraph/drawio-mcp) | Opens each diagram from XML, CSV or Mermaid in the draw.io editor in a new tab; no tool reads it back | You want the diagram in the full draw.io editor and edit it yourself from there |
| draw.io's hosted MCP app, `https://mcp.draw.io/mcp` | Shows the diagram inside the chat in Claude.ai, ChatGPT, VS Code or Cursor, with nothing to install; the diagram is sent to draw.io's server | You work in a chat app and want to see the diagram in the conversation |
| draw.io's plugin for Claude Code, Codex CLI and Copilot CLI | A skill that writes `.drawio` files; PNG, SVG and PDF export needs draw.io Desktop | You want diagram files in your repository without an MCP server |
| [`lgazo/drawio-mcp-server`](https://github.com/lgazo/drawio-mcp-server) | A draw.io editor on localhost, or your own draw.io through a browser extension; tools create, read, update and delete single shapes, layers and pages | You want fine-grained tools, several documents at once, or Mermaid import |

## Saved diagrams

Every change is saved to `~/.next-ai-drawio/<session-id>.drawio` with its last 20 versions; the newest 50 diagrams are kept. To continue one in a later conversation, ask the AI for it: it finds it with `list_saved_diagrams` and reopens it with `start_session`.

## Your own drawing rules

Write them in `~/.next-ai-drawio/instructions.md`, for example "Always use a minimal style". They are added to the drawing guide on every call, so edits apply without a restart. The first 5000 characters are used.

## Tools

| Tool | What it does |
|---|---|
| `start_session` | Open the preview and return the drawing guide; `session_id` continues a saved diagram |
| `create_new_diagram` | Draw a new diagram from `mxCell` XML |
| `edit_diagram` | Add, update or delete cells by id, all or nothing |
| `get_diagram` | The current XML, including your edits in the browser |
| `get_selection` | The shapes you selected in the preview |
| `screenshot_diagram` | A PNG of a page, for the AI to check |
| `load_diagram`, `export_diagram` | Open a `.drawio` or `.drawio.svg` file; save `.drawio`, `.png`, `.svg` or `.drawio.svg` |
| `restore_version` | Go back to an earlier version; a redo stays possible |
| `list_saved_diagrams` | Diagrams saved by earlier sessions, newest first |
| `get_drawing_guide`, `get_shape_library` | The drawing rules again; the icon styles of a library such as `aws4` |
| `list_pages`, `add_page`, `rename_page`, `delete_page` | Pages (tabs) |

## Configuration

Environment variables, set in the client's `env` for the server:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `6002` | Preview port; when it is taken, the next free one up to 6020 is used |
| `DRAWIO_DATA_DIR` | `~/.next-ai-drawio` | Folder for saved diagrams and `instructions.md`; `off` turns saving off |
| `DRAWIO_AUTO_SCREENSHOT` | unset | `true` attaches a screenshot to every create and edit result (2 to 10 s per call) |
| `DRAWIO_BASE_URL` | the bundled draw.io | Use another draw.io, such as a self-hosted one (see below) |
| `DRAWIO_LANG` | unset | Fix the editor and preview language: `en`, `zh`, `zh-tw`, `ja`, `de` and so on |
| `DRAWIO_UI` | unset | Fix the draw.io theme: `kennedy`, `atlas`, `dark`, `min`, `sketch` or `simple` |
| `DRAWIO_DARK` | `auto` | `1` starts dark, `0` starts light, `auto` follows the system |
| `BROWSER` | unset | `none` does not open the preview by itself; `start_session` still returns the URL |
| `DRAWIO_ALLOW_EMBED` | unset | `true` lets pages on this machine (`localhost`, `127.0.0.1`) show the preview in a frame, such as DeepSeek Harness's sidebar browser |
| `DRAWIO_PREVIEW_UI` | `shell` | `classic` opens the previous preview page, without outlines, Ctrl+Z or `get_selection` |
| `DEBUG` | unset | `true` logs debug messages to stderr |

### Self-hosted draw.io

```bash
docker run -d -p 8080:8080 jgraph/drawio
```

Then set `DRAWIO_BASE_URL=http://localhost:8080`. The preview cannot reach into a draw.io from another origin, so the AI's changes are not outlined, Ctrl+Z does not take them back (use the version cards) and `get_selection` does not work. The bundled copy leaves out a few features that load code on demand, such as the org chart layout. It also has no image proxy, so exported images leave out pictures inserted by their web address; see [Offline deployment](https://github.com/DayuanJiang/next-ai-draw-io/blob/main/docs/en/offline-deployment.md#insert-images-from-other-websites).

## Troubleshooting

- **Blank preview in VS Code Simple Browser or Cursor's browser**: the page refuses to be embedded in other pages. Open the URL in a regular browser.
- **Screenshot or PNG/SVG export times out**: the preview tab renders them, and browsers slow down background tabs. Bring the tab to the front and try again.
- **"No active session"**: the AI has to call `start_session` first.
- **The preview does not update**: open the URL that `start_session` returned; its `?mcp=` part connects the page to the session.

## How it works

The server talks to the agent over stdio and runs an HTTP server on `127.0.0.1` that serves the preview page and the bundled draw.io; the page polls it for changes. Every `/api` request needs a token that only the preview page has, so other websites cannot read or change your diagram.

## License

Apache-2.0
