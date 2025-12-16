# Draw.io MCP Server

[![npm version](https://img.shields.io/npm/v/drawio-diagram-mcp.svg)](https://www.npmjs.com/package/drawio-diagram-mcp)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A Model Context Protocol (MCP) server that provides draw.io diagram generation, editing, validation, and export capabilities.

## Quick Start

### Using npx (Recommended)

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["-y", "drawio-diagram-mcp"]
    }
  }
}
```

That's it! No installation or API keys needed.

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/anthropics/draw-io-mcp.git
cd draw-io-mcp/mcp-server

# Install dependencies
npm install

# Build
npm run build
```

Then configure Claude Desktop:

```json
{
  "mcpServers": {
    "drawio": {
      "command": "node",
      "args": ["/path/to/draw-io-mcp/mcp-server/dist/index.js"]
    }
  }
}
```

## Collaborative Architecture

This MCP server uses a **collaborative architecture** where:

1. **Tools provide guidance** - `generate_diagram` and `edit_diagram` return prompts and instructions
2. **AI client generates content** - Claude (or another AI) uses the guidance to create XML
3. **Deterministic operations stay in MCP** - Validation, XML operations, and export run server-side

This means **no API key configuration is needed** - the server works with any MCP-compatible AI client.

## Features

- **Diagram Generation Guidance**: Get system prompts and style guides for creating diagrams
- **Edit Guidance**: Get instructions for modifying existing diagrams
- **Direct XML Operations**: Apply precise edits (add, update, delete, move elements)
- **XML Validation**: Validate and auto-fix draw.io XML
- **Export**: Export diagrams to PNG, SVG, or native .drawio format
- **Templates**: Pre-built templates for common diagram types
- **Prompts**: Pre-configured prompts for AWS, flowcharts, sequence diagrams, and more

## How It Works

### Generate Diagram Flow

```
1. User: "Create a flowchart for login process"
2. Claude calls: generate_diagram(prompt="login flowchart")
3. MCP returns: {
     systemPrompt: "You are a draw.io diagram expert...",
     styleReference: "## Common Shape Styles...",
     instructions: "Create a flowchart diagram for: login process..."
   }
4. Claude generates mxCell XML using the guidance
5. Claude calls: validate_xml(xml="<mxCell>...")
6. MCP returns: { valid: true, fixedXml: "..." }
7. Claude returns the diagram to the user
```

### Edit Diagram Flow

```
1. User: "Add a logout button to this diagram"
2. Claude calls: edit_diagram(currentXml="...", instruction="add logout")
3. MCP returns: {
     editPrompt: "Analyze the current diagram...",
     operationsSchema: {...},
     currentXml: "..."
   }
4. Claude generates operations JSON: [{"type": "add", ...}]
5. Claude calls: apply_operations(xml="...", operations=[...])
6. MCP returns: { success: true, xml: "..." }
```

## Available Tools

### `generate_diagram`

Get guidance for generating a new diagram.

**Parameters:**
- `prompt` (required): Description of the diagram to create
- `diagramType` (optional): Type hint - "flowchart", "sequence", "er", "aws", "class", "mindmap", "network", "custom"
- `style` (optional): "default" for colorful, "minimal" for black/white

**Returns:** System prompt, style reference, and instructions for the AI to generate XML.

### `edit_diagram`

Get guidance for editing an existing diagram.

**Parameters:**
- `currentXml` (required): Current draw.io XML
- `instruction` (required): What changes to make

**Returns:** Edit prompt, operations schema, and instructions for generating edit operations.

### `apply_operations`

Apply direct XML operations (no AI needed).

**Parameters:**
- `xml` (required): Current draw.io XML
- `operations` (required): Array of operations:
  - `update`: Update element by id with new XML
  - `add`: Add a new element
  - `delete`: Delete element by id

**Example:**
```json
{
  "xml": "<mxfile>...</mxfile>",
  "operations": [
    {"type": "add", "cell_id": "newBox", "new_xml": "<mxCell id=\"newBox\" value=\"New Step\" style=\"rounded=1;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"100\" y=\"200\" width=\"120\" height=\"60\" as=\"geometry\"/></mxCell>"},
    {"type": "delete", "cell_id": "oldBox"}
  ]
}
```

### `validate_xml`

Validate draw.io XML and optionally auto-fix issues.

**Parameters:**
- `xml` (required): XML content to validate
- `autoFix` (optional): Automatically fix issues (default: true)

### `export_diagram`

Export diagram to PNG, SVG, or .drawio format.

**Parameters:**
- `xml` (required): Draw.io XML content
- `format` (required): "png", "svg", or "drawio"
- `scale` (optional): Scale factor for PNG (default: 2)
- `background` (optional): Background color (default: "#ffffff")

**Returns:**
- `data`: Base64-encoded image data (PNG/SVG) or XML string (drawio)
- `mimeType`: MIME type of the output
- `filename`: Suggested filename

## Available Resources

### `templates://list`

Get a list of all available diagram templates.

### `templates://{templateId}`

Get XML content for a specific template:
- `templates://flowchart`
- `templates://sequence-diagram`
- `templates://er-diagram`
- `templates://aws-architecture`
- `templates://class-diagram`
- `templates://mindmap`

### `reference://styles`

Get draw.io style property reference documentation.

## Available Prompts

| Prompt | Description |
|--------|-------------|
| `aws-architecture` | Generate AWS architecture diagrams |
| `flowchart` | Generate flowchart diagrams |
| `sequence-diagram` | Generate UML sequence diagrams |
| `er-diagram` | Generate Entity-Relationship diagrams |
| `class-diagram` | Generate UML class diagrams |
| `mindmap` | Generate mind map diagrams |
| `network-diagram` | Generate network topology diagrams |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

### Puppeteer Issues (for PNG/SVG export)

1. **Chrome not found**: Set `PUPPETEER_EXECUTABLE_PATH` environment variable
2. **Sandbox errors**: Set `PUPPETEER_NO_SANDBOX=true` (Docker/CI environments)
3. **Timeout errors**: Check network connectivity

## License

Apache 2.0 License - see [LICENSE](LICENSE) file for details.
