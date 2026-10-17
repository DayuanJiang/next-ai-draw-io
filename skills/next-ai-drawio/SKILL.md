---
name: next-ai-drawio
description: Draw and edit draw.io diagrams in a live browser preview that the user can also edit by hand, through the next-ai-drawio MCP server. Use when the user asks to draw, diagram, visualize or map something, such as a system or cloud architecture, a codebase, a flowchart, a sequence, ER, class or state diagram, an AWS, Azure, GCP or Kubernetes diagram, a network diagram, a mind map or an org chart; when they mention draw.io, drawio or a .drawio or .drawio.svg file; or when they want a diagram exported to PNG or SVG. If the next-ai-drawio tools are not connected, this skill shows how to install the server.
---

# next-ai-drawio

The next-ai-drawio MCP server opens a draw.io canvas in the user's browser. The diagram appears there as you draw it, the user can edit it by hand, and you can read their edits back.

## 1. Check that the server is connected

Look for its tools: `start_session`, `create_new_diagram`, `edit_diagram`, `get_diagram`. Clients may show them with a prefix, for example `mcp__drawio__start_session`. If they are there, go to step 3.

## 2. If the tools are missing, offer to install the server

Tell the user that this needs the next-ai-drawio MCP server, which runs on their machine with `npx` (Node.js 18 or later) and shows the diagram in their browser. Show the command for the client you are running in, and run it only after the user agrees:

- Claude Code: `claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest`
- Codex CLI: `codex mcp add drawio -- npx @next-ai-drawio/mcp-server@latest`. Codex asks before each tool that changes the diagram; to let them run, add `default_tools_approval_mode = "approve"` under `[mcp_servers.drawio]` in `~/.codex/config.toml`.
- VS Code, in `.vscode/mcp.json`: `{ "servers": { "drawio": { "type": "stdio", "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] } } }`
- Cursor, Claude Desktop, Cline and most other clients (`~/.cursor/mcp.json`, `claude_desktop_config.json`, `cline_mcp_settings.json`): `{ "mcpServers": { "drawio": { "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] } } }`. Keep the servers that are already configured.
- Any other client: follow https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/packages/mcp-server/README.md

MCP tools load when the client starts. After installing, ask the user to restart the client (in Claude Code, start a new session; `/mcp` lists `drawio` once it is connected) and then repeat the request.

If the user would rather not install anything, point them to the web app at https://next-ai-drawio.jiang.jp, where they can draw diagrams by chatting in the browser. Draw.io XML written by hand without the server is neither checked nor previewed, so write a `.drawio` file yourself only if the user asks for one anyway.

## 3. Draw

- Call `start_session` first. It opens the preview and returns the drawing guide (layout, edge routing and style rules). Follow the guide, and call `get_drawing_guide` if it is no longer in your context.
- Before using cloud or icon shapes (AWS, Azure, GCP, Kubernetes, Cisco, BPMN...), call `get_shape_library` and use the exact style names it returns.
- To change a `.drawio` or `.drawio.svg` file, call `load_diagram`, edit with `edit_diagram`, then `export_diagram` to the same path. Never write its XML yourself.
- To draw a codebase, read it first: start from the README, the manifests and the entry points, and follow the real calls. Draw only the parts and connections you saw in the code, keep about 8 to 12 boxes on a page and add pages for more detail, and tell the user in one sentence what you left out or could not confirm.
- After drawing or heavily editing a complex diagram, pass `screenshot: true` on that call (or call `screenshot_diagram`) and fix overlapping shapes and edges that cross shapes.
- When the user says "this box" or "these arrows", call `get_selection`. Call `get_diagram` before editing if the user may have changed the diagram by hand.
- `restore_version` goes back to an earlier version. `export_diagram` saves `.drawio`, `.drawio.svg`, `.png` or `.svg` files; use absolute paths.
