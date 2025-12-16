/**
 * Edit Diagram Tool
 * Returns guidance for the AI client to generate edit operations
 * The AI client analyzes the diagram and generates operations, then uses apply_operations
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

// Operations schema documentation for the AI client
const OPERATIONS_SCHEMA = {
    type: "object",
    properties: {
        operations: {
            type: "array",
            items: {
                type: "object",
                oneOf: [
                    {
                        properties: {
                            type: { const: "update" },
                            cell_id: {
                                type: "string",
                                description: "ID of the cell to update",
                            },
                            new_xml: {
                                type: "string",
                                description:
                                    "Complete mxCell XML with same ID, updated attributes",
                            },
                        },
                        required: ["type", "cell_id", "new_xml"],
                    },
                    {
                        properties: {
                            type: { const: "add" },
                            cell_id: {
                                type: "string",
                                description: "Unique ID for the new cell",
                            },
                            new_xml: {
                                type: "string",
                                description: "Complete mxCell XML for the new element",
                            },
                        },
                        required: ["type", "cell_id", "new_xml"],
                    },
                    {
                        properties: {
                            type: { const: "delete" },
                            cell_id: {
                                type: "string",
                                description: "ID of the cell to delete",
                            },
                        },
                        required: ["type", "cell_id"],
                    },
                ],
            },
        },
    },
    required: ["operations"],
}

const EDIT_PROMPT_TEMPLATE = `Analyze the current diagram and generate operations to make the requested changes.

## Current Diagram XML
\`\`\`xml
{{CURRENT_XML}}
\`\`\`

## Edit Instruction
{{INSTRUCTION}}

## How to Generate Operations

1. **Understand the current structure**: Look at the existing mxCell elements, their IDs, positions, and connections.

2. **Plan your changes**: Decide which cells need to be updated, added, or deleted.

3. **Generate operations JSON**:

### Update Operation
Modify an existing cell. The cell_id must match an existing cell, and new_xml replaces the entire cell:
\`\`\`json
{"type": "update", "cell_id": "3", "new_xml": "<mxCell id=\\"3\\" value=\\"New Label\\" style=\\"rounded=1;fillColor=#dae8fc;\\" vertex=\\"1\\" parent=\\"1\\">\\n  <mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/>\\n</mxCell>"}
\`\`\`

### Add Operation
Add a new cell. Use a unique cell_id that doesn't exist in the diagram:
\`\`\`json
{"type": "add", "cell_id": "new1", "new_xml": "<mxCell id=\\"new1\\" value=\\"New Box\\" style=\\"rounded=1;\\" vertex=\\"1\\" parent=\\"1\\">\\n  <mxGeometry x=\\"300\\" y=\\"200\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/>\\n</mxCell>"}
\`\`\`

### Delete Operation
Remove a cell by ID:
\`\`\`json
{"type": "delete", "cell_id": "5"}
\`\`\`

## Important Rules
- For update/add: new_xml must be a COMPLETE mxCell element including mxGeometry
- The ID in new_xml MUST match the cell_id
- When adding edges, set source and target attributes to connect to existing cells
- Position new elements to avoid overlaps with existing ones

Generate ONLY the JSON object with the operations array, no other text.`

/**
 * Register the edit_diagram tool
 */
export function registerEditDiagramTool(server: McpServer): void {
    server.tool(
        "edit_diagram",
        "Get guidance for editing a draw.io diagram. Returns the current XML and instructions for generating edit operations. After generating operations, use apply_operations to apply them.",
        {
            currentXml: z
                .string()
                .describe("Current diagram XML (full mxfile format)"),
            instruction: z
                .string()
                .describe(
                    "Natural language instruction describing the edit (e.g., 'Change the color of node A to blue', 'Add a new box labeled Database')"
                ),
        },
        async ({ currentXml, instruction }) => {
            // Build the edit prompt with the current XML and instruction
            const editPrompt = EDIT_PROMPT_TEMPLATE.replace(
                "{{CURRENT_XML}}",
                currentXml
            ).replace("{{INSTRUCTION}}", instruction)

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                action: "edit",
                                editPrompt,
                                operationsSchema: OPERATIONS_SCHEMA,
                                currentXml,
                                instruction,
                                nextSteps: [
                                    "1. Analyze the currentXml to understand the diagram structure",
                                    "2. Generate operations JSON based on the editPrompt guidance",
                                    "3. Call apply_operations with the currentXml and your operations array",
                                    "4. The apply_operations tool will return the modified XML",
                                    "5. Call export_diagram if the user wants PNG/SVG output",
                                ],
                            },
                            null,
                            2
                        ),
                    },
                ],
            }
        }
    )
}
