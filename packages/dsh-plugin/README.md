# @next-ai-drawio/dsh

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin for [Next AI Draw.io](https://github.com/DayuanJiang/next-ai-draw-io). It adds the [`@next-ai-drawio/mcp-server`](https://www.npmjs.com/package/@next-ai-drawio/mcp-server) MCP server, so the agent can draw draw.io diagrams on a live canvas in your browser. You can edit the diagram by hand at the same time, and every change the AI makes is saved as a version you can go back to.

## Install

```bash
dsh plugin --profile web add @next-ai-drawio/dsh
```

Use the profile you start DSH with (`web` for `dsh web`). You need Node.js 18 or later; `npx` downloads the MCP server on first use. After installing, the plugin shows up under **Plugins** in the DSH web UI, where you can turn it off.

## Use

Ask, for example, "Read this repo and draw its architecture". The agent calls `start_session`, the preview opens in your browser, and the diagram appears as it is drawn.

The tools are named `mcp__drawio__<tool>`: `start_session`, `create_new_diagram`, `edit_diagram`, `get_diagram`, `screenshot_diagram`, `export_diagram`, `restore_version` and more. See the [MCP server README](https://github.com/DayuanJiang/next-ai-draw-io/tree/main/packages/mcp-server#readme) for the full list and its settings.

The agent checks its drawing with `screenshot_diagram`. Screenshots reach the model only when it accepts images; with a text-only model, DSH passes a short note instead of the picture.

## Settings

The plugin runs `npx -y @next-ai-drawio/mcp-server@latest`. To pass settings such as `DRAWIO_LANG`, add an `env` block to the `mcp-drawio` row in your profile's `cordis.patch.yml`:

```yaml
- id: mcp-drawio
  config:
    serverName: drawio
    transport: stdio
    command: npx
    args: ['-y', '@next-ai-drawio/mcp-server@latest']
    toolCallTimeoutMs: 120000
    env:
      DRAWIO_LANG: zh
```

A row override replaces the whole `config`, so keep the other fields.

## Remove

```bash
dsh plugin --profile web remove @next-ai-drawio/dsh
```
