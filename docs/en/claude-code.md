# Use it from Claude Code

The MCP server lets Claude Code draw draw.io diagrams from your project's files. The diagram appears on a live canvas in your browser, the same canvas as the web app: you can edit it by hand, and Claude reads your edits before it changes the diagram again.

## Install

You need Node.js 18 or later. In a terminal, run:

```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

`--scope user` makes the tools available in every project. Without it, they exist only in the folder where you ran the command.

You can also install it as a plugin from the Claude Code community marketplace (Claude Code 2.1.275 or later):

```text
/plugin install next-ai-drawio --marketplace anthropics/claude-plugins-community
```

Start a new Claude Code session. `/mcp` lists `drawio` once it is connected.

For Codex, VS Code, Cursor and other clients, see the [MCP server README](../../packages/mcp-server/README.md).

## Draw your first diagram

Ask for a diagram of something Claude can read:

```text
Read this repo and draw its architecture
```

Claude reads the code with its own tools, opens the preview in your browser and draws the diagram there. A large diagram is drawn in parts, so you see it grow.

Other requests that work well:

- "Draw the request flow of the checkout API as a sequence diagram"
- "Turn docs/architecture.md into a diagram with AWS icons"
- "Open diagrams/system.drawio and add the new queue service"

<!-- demo: mcp -->

## Work on the diagram together

- **Edit by hand.** The preview is a full draw.io editor. Move shapes, change labels or restyle them; Claude reads the diagram, including your changes, before it edits again.
- **Point at shapes.** Select shapes in the preview and say "make these blue" or "split this into two services". Claude reads what you selected.
- **See what changed.** Claude's changes are outlined for a few seconds. Ctrl+Z in the preview takes its last change back.
- **Go back further.** The last 20 versions are cards next to the canvas, where you can compare or restore one. You can also ask Claude to undo.

## Save and export

Every change is saved to `~/.next-ai-drawio/<session-id>.drawio` with its last 20 versions, and the newest 50 diagrams are kept. To continue a diagram in a later conversation, ask Claude for it: it finds the saved diagram and reopens it.

Ask Claude to export when you need a file: `.drawio`, `.png`, `.svg` or `.drawio.svg`. A `.drawio.svg` file is an image that draw.io can also open and edit, which suits README files.

## Your own drawing rules

Write them in `~/.next-ai-drawio/instructions.md`, for example "Always use a minimal style". They are added to the drawing guide on every call, so changes apply without a restart. The first 5000 characters are used.

## Settings

Environment variables change how the server works. Pass them with `-e` when you add the server:

```bash
claude mcp add --scope user drawio -e DRAWIO_LANG=ja -- npx @next-ai-drawio/mcp-server@latest
```

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `6002` | Preview port; when it is taken, the next free one up to 6020 is used |
| `DRAWIO_DATA_DIR` | `~/.next-ai-drawio` | Folder for saved diagrams and `instructions.md`; `off` turns saving off |
| `DRAWIO_AUTO_SCREENSHOT` | unset | `true` attaches a screenshot to every create and edit result (2 to 10 s per call) |
| `DRAWIO_LANG` | unset | Fix the editor and preview language: `en`, `zh`, `zh-tw`, `ja`, `de` and so on |
| `DRAWIO_DARK` | `auto` | `1` starts dark, `0` starts light, `auto` follows the system |
| `BROWSER` | unset | `none` does not open the preview by itself |

All variables, and how to use a self-hosted draw.io, are in the [MCP server README](../../packages/mcp-server/README.md#configuration).

## Troubleshooting

- **The preview does not open.** Ask Claude for the preview URL and open it yourself; its `?mcp=` part connects the page to the session.
- **Blank preview in VS Code Simple Browser or Cursor's browser.** The page refuses to be embedded in other pages. Open the URL in a regular browser.
- **A screenshot or PNG/SVG export times out.** The preview tab renders them, and browsers slow down background tabs. Bring the tab to the front and try again.
- **"No active session".** Claude has to start a session first; ask it to start the drawio session again.
