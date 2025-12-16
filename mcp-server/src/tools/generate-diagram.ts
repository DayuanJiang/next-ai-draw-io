/**
 * Generate Diagram Tool
 * Returns guidance for the AI client to generate draw.io diagrams
 * The AI client uses the provided prompts and style guide to create XML
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
    DEFAULT_SYSTEM_PROMPT,
    EXTENDED_SYSTEM_PROMPT,
    MINIMAL_STYLE_INSTRUCTION,
} from "../shared/system-prompts.js"

// Style reference for the AI client
const STYLE_REFERENCE = `
## Common Shape Styles
- Rectangle: rounded=0;whiteSpace=wrap;html=1;
- Rounded Rectangle: rounded=1;whiteSpace=wrap;html=1;
- Ellipse/Circle: ellipse;whiteSpace=wrap;html=1;
- Diamond (Decision): rhombus;whiteSpace=wrap;html=1;
- Cylinder (Database): shape=cylinder3;whiteSpace=wrap;html=1;

## Common Edge Styles
- Basic Arrow: endArrow=classic;html=1;
- Dashed Arrow: dashed=1;endArrow=classic;html=1;
- Bidirectional: endArrow=classic;startArrow=classic;html=1;
- Orthogonal: edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;

## Color Presets
- Blue: fillColor=#dae8fc;strokeColor=#6c8ebf;
- Green: fillColor=#d5e8d4;strokeColor=#82b366;
- Orange: fillColor=#ffe6cc;strokeColor=#d79b00;
- Red: fillColor=#f8cecc;strokeColor=#b85450;
- Purple: fillColor=#e1d5e7;strokeColor=#9673a6;
- Yellow: fillColor=#fff2cc;strokeColor=#d6b656;

## Text Formatting
- Bold: fontStyle=1
- Italic: fontStyle=2
- Font Size: fontSize=14
- Alignment: align=center (left, right)
`

/**
 * Register the generate_diagram tool
 */
export function registerGenerateDiagramTool(server: McpServer): void {
    server.tool(
        "generate_diagram",
        "Get guidance for generating a draw.io diagram. Returns system prompt and style guide for the AI to use. After generating XML, use validate_xml to check it.",
        {
            prompt: z
                .string()
                .describe("Natural language description of the diagram to create"),
            style: z
                .enum(["default", "minimal"])
                .optional()
                .describe(
                    "Visual style: 'default' for colorful diagrams, 'minimal' for black/white"
                ),
            diagramType: z
                .enum([
                    "flowchart",
                    "sequence",
                    "er",
                    "aws",
                    "class",
                    "mindmap",
                    "network",
                    "custom",
                ])
                .optional()
                .describe("Type of diagram to create"),
        },
        async ({ prompt, style, diagramType }) => {
            // Build the system prompt
            let systemPrompt = EXTENDED_SYSTEM_PROMPT

            // Add minimal style instruction if requested
            if (style === "minimal") {
                systemPrompt = MINIMAL_STYLE_INSTRUCTION + systemPrompt
            }

            // Build the generation instruction
            const typeHint =
                diagramType && diagramType !== "custom"
                    ? `Create a ${diagramType} diagram for: `
                    : "Create a diagram for: "

            const instructions = `${typeHint}${prompt}

Generate ONLY mxCell elements (no wrapper tags like <mxfile>, <mxGraphModel>, <root>).
Start with id="2" (id="0" and id="1" are reserved for root elements).
Set parent="1" for all top-level shapes.

After generating the XML, call the validate_xml tool to check and fix any issues.`

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                action: "generate",
                                systemPrompt,
                                styleReference: STYLE_REFERENCE,
                                instructions,
                                nextSteps: [
                                    "1. Use the systemPrompt as your context for generating draw.io XML",
                                    "2. Follow the styleReference for proper styling",
                                    "3. Generate mxCell elements based on the instructions",
                                    "4. Call validate_xml with the generated XML to check for issues",
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
