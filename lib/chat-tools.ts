import { type InferUITools, tool } from "ai"
import path from "path"
import { z } from "zod"
import {
    getShapeLibrary,
    SHAPE_LIBRARY_LIST,
} from "@/packages/mcp-server/src/shape-library.ts"
import {
    STYLE_CLASS_EXAMPLE,
    SWIMLANE_EXAMPLE,
} from "@/packages/mcp-server/src/xml-examples.ts"

/**
 * The chat's tools. display_diagram, edit_diagram and append_diagram run in
 * the browser: the chat engine's tool handler puts their result on the
 * canvas and reports it back as text, so they have an output schema and no
 * execute. get_shape_library runs on the server.
 */
export const chatTools = {
    display_diagram: tool({
        description: `Display a diagram on draw.io. Pass ONLY the mxStyle definitions and the mxCell elements - wrapper tags and root cells are added automatically.

VALIDATION RULES (XML will be rejected if violated):
1. Generate ONLY mxStyle definitions and mxCell elements (an mxCell with custom data inside an <object> wrapper) - NO wrapper tags (<mxfile>, <mxGraphModel>, <root>)
2. Do NOT include root cells (id="0" or id="1") - they are added automatically
3. All mxCell elements must be siblings - never nested
4. Every mxCell needs a unique id (start from "2")
5. parent defaults to "1"; write parent="<container-id>" only for shapes inside a container
6. Escape special chars in values: &lt; &gt; &amp; &quot;

A shape is one self-closing mxCell with x, y, w and h; an edge is one with source and target (a cell with source or target is always an edge). vertex="1", edge="1", parent="1" and the mxGeometry element are added automatically. Write parent only for a shape inside a container, and an mxGeometry element only for edge waypoints or for a separate label cell placed on an edge: <mxCell id="9" value="yes" style="edgeLabel;" parent="<edge id>" connectable="0"><mxGeometry x="-0.5" relative="1" as="geometry"/></mxCell>. An edge's own text simply goes in its value.

Example (generate ONLY this - no wrapper tags):
${SWIMLANE_EXAMPLE}

Styles: define a style used by several cells ONCE with <mxStyle name="..." value="..."/> before the cells and use the name in style like a CSS class; overrides after the name win. Name only styles that two or more cells share; names must not be draw.io's own style names (text, ellipse, rhombus, swimlane, label, image, blue, green, red, gray, yellow, orange, purple, pink). A definition applies to the call it is in. html=1 and whiteSpace=wrap are added automatically, never write them. Labels are HTML: use &lt;br&gt; for a line break, never \\n; a literal < or > is written &amp;lt; or &amp;gt;.
${STYLE_CLASS_EXAMPLE}

Notes:
- For AWS diagrams, use **AWS 2025 icons**.
- For animated connectors, add "flowAnimation=1" to edge style.
`,
        inputSchema: z.object({
            xml: z.string().describe("XML string to be displayed on draw.io"),
        }),
        outputSchema: z.string(),
    }),
    edit_diagram: tool({
        description: `Edit the current diagram by ID-based operations (update/add/delete cells).

Operations:
- update: Replace an existing cell by its id. Provide cell_id and complete new_xml.
- add: Add a new cell. Provide cell_id (new unique id) and new_xml.
- delete: Remove a cell. Cascade is automatic: children AND edges (source/target) are auto-deleted. Only specify ONE cell_id.

For update/add, new_xml is the complete mxCell (inside its <object> wrapper when it has custom data) in the compact form (a shape with x, y, w, h; an edge with source and target), with its complete style (named styles are not available in edit_diagram).

⚠️ JSON ESCAPING: Every " inside new_xml MUST be escaped as \\". Example: id=\\"5\\" value=\\"Label\\"

Example - Add a rectangle:
{"operations": [{"operation": "add", "cell_id": "rect-1", "new_xml": "<mxCell id=\\"rect-1\\" value=\\"Hello\\" style=\\"rounded=1;\\" x=\\"100\\" y=\\"100\\" w=\\"120\\" h=\\"60\\"/>"}]}

Example - Delete container (children & edges auto-deleted):
{"operations": [{"operation": "delete", "cell_id": "2"}]}`,
        inputSchema: z.object({
            operations: z
                .array(
                    z.object({
                        operation: z
                            .enum(["update", "add", "delete"])
                            .describe(
                                "Operation to perform: add, update, or delete",
                            ),
                        cell_id: z
                            .string()
                            .describe(
                                "The id of the mxCell. Must match the id attribute in new_xml.",
                            ),
                        new_xml: z
                            .string()
                            .optional()
                            .describe(
                                "Complete mxCell XML element (required for update/add)",
                            ),
                    }),
                )
                .describe("Array of operations to apply"),
        }),
        outputSchema: z.string(),
    }),
    append_diagram: tool({
        description: `Continue generating diagram XML when previous display_diagram output was truncated due to length limits.

WHEN TO USE: Only call this tool after display_diagram was truncated (you'll see an error message about truncation).

CRITICAL INSTRUCTIONS:
1. Do NOT include any wrapper tags - just continue the mxCell elements
2. Continue from EXACTLY where your previous output stopped
3. Complete the remaining mxCell elements
4. If still truncated, call append_diagram again with the next fragment

Example: If previous output ended with '<mxCell id="x" style="rounded=1', continue with ';" x="40" y="40" w="120" h="60"/>' and complete the remaining elements.`,
        inputSchema: z.object({
            xml: z
                .string()
                .describe(
                    "Continuation XML fragment to append (NO wrapper tags)",
                ),
        }),
        outputSchema: z.string(),
    }),
    get_shape_library: tool({
        description: `Get draw.io shape/icon library documentation with style syntax and shape names.

Available libraries:
${SHAPE_LIBRARY_LIST}

Call this tool to get shape names and usage syntax for a specific library.`,
        inputSchema: z.object({
            library: z
                .string()
                .describe(
                    "Library name (e.g., 'aws4', 'kubernetes', 'flowchart')",
                ),
        }),
        execute: async ({ library }) => {
            // Only known library names reach the file system
            const result = await getShapeLibrary(
                library,
                path.join(process.cwd(), "docs/shape-libraries"),
            )
            return result.ok ? result.text : result.error
        },
    }),
}

/** The tool names and their input and output types, for the UI messages */
export type ChatTools = InferUITools<typeof chatTools>
