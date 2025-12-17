# Release Notes

## v0.4.3 (2024-12-17)

### New Features

- **MCP Server (Preview)**: Added Model Context Protocol server that enables AI agents like Claude Desktop, Cursor, and VS Code to generate and edit draw.io diagrams with real-time browser preview.

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

  Available tools:
  - `start_session` - Opens browser with real-time diagram preview
  - `display_diagram` - Create a new diagram from XML
  - `edit_diagram` - Edit diagram by ID-based operations (update/add/delete cells)
  - `get_diagram` - Get the current diagram XML
  - `export_diagram` - Save diagram to a `.drawio` file

### Technical Changes

- Added `packages/mcp-server/` as a separate npm package (`@next-ai-drawio/mcp-server`)
- Updated `tsconfig.json` to exclude `packages/` from Next.js build
- Updated `.gitignore` for monorepo structure (`packages/*/node_modules`, `packages/*/dist`)

### Documentation

- Added MCP Server section to all README files (English, Chinese, Japanese)
- Added detailed MCP server documentation in `packages/mcp-server/README.md`
