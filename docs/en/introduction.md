# Introduction

Next AI Draw.io draws and edits draw.io diagrams by chatting with an AI. You describe a diagram, the AI draws it on a real draw.io canvas, and you keep working on it by hand or by asking for changes. Every change the AI makes is outlined and saved as a version you can restore.

<!-- demo: tour -->

## Three ways to use it

| Where | What you get | Start here |
|---|---|---|
| In the browser | The editor at next-ai-drawio.jiang.jp. Nothing to install; add your own API key to lift the demo's daily limit | [Open the editor](https://next-ai-drawio.jiang.jp/) |
| On your desktop | The same app for Windows, macOS and Linux | [Latest release](https://github.com/DayuanJiang/next-ai-draw-io/releases/latest) |
| In your AI agent | An MCP server: Claude Code, Cursor, Codex and VS Code draw from your project's files on the same canvas, in your browser | [Use it from Claude Code](./claude-code.md) |

## What you can do

- **Generate**: describe a diagram in words, or start from a screenshot, a whiteboard photo, a PDF or a web page.
- **Edit by hand**: the canvas is the draw.io editor. Move, restyle and add shapes as you would in draw.io.
- **Edit with AI**: select shapes and ask for a change to just those, or ask for a change to the whole diagram. The AI reads your hand edits first.
- **Go back**: every AI change becomes a version card in the chat. Undo the latest change, compare a version with the canvas, or restore an older one.
- **Export**: save a `.drawio` file to keep editing in draw.io, or export PNG or SVG.

## How it works

A diagram is draw.io XML. The app sends your request and the current diagram to the AI model you picked, and the model answers with new or changed XML, which the canvas shows as it arrives. The draw.io editor is bundled with the app, so the app can drive it directly and read your edits back.

The app is built with:

- **Next.js** for the pages and the API
- **Vercel AI SDK** (`ai` and `@ai-sdk/*`) to stream answers from many AI providers
- **draw.io** as the editor

## AI providers

The demo site has a daily usage limit. In Settings you can pick another provider and enter your own key; the key is kept in your browser and never stored on the server. When you host the app yourself, you set up providers with environment variables: see [AI providers](./ai-providers.md).

## Next steps

- [Draw and edit](./editor.md) in the web app
- [Versions and undo](./versions.md)
- [Use it from Claude Code](./claude-code.md) or [other MCP clients](./mcp-clients.md)
- [AWS architecture diagrams](./aws-architecture.md) and [flowcharts and sequence diagrams](./flowcharts.md)
- [Run with Docker](./docker.md)
- [FAQ](./FAQ.md)
