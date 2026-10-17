/**
 * Drawing guide for the model, returned by start_session, get_drawing_guide
 * and the diagram-workflow prompt.
 *
 * The XML examples and the style rules are shared with the web app's system
 * prompt (xml-examples.ts). The other rules are adapted from that prompt
 * (lib/system-prompts.ts) and the web app's tool descriptions
 * (app/api/chat/route.ts); when they change there, update this file too.
 */

import {
    CUSTOM_DATA_EXAMPLE,
    CUSTOM_DATA_RULE,
    indent,
    STYLE_CLASS_EXAMPLE,
    SWIMLANE_EXAMPLE,
    styleRules,
    TWO_EDGES_EXAMPLE,
    WAYPOINT_EXAMPLE,
} from "./xml-examples.ts"

const styles = styleRules("create_new_diagram or add_page", "the server")

export const DRAWING_GUIDE = `# Draw.io drawing guide

## Workflow
- create_new_diagram draws a new diagram and REPLACES the whole document. add_page adds another tab. edit_diagram changes cells of an existing page. load_diagram opens a .drawio file (the server reads the file itself, or takes the file's content as its 'xml' argument when you already have it in hand). get_diagram returns the current XML, including the user's manual edits. export_diagram saves to a file. To update an existing .drawio file, load_diagram it, edit with edit_diagram and export_diagram to the same path; never rewrite the file or the auto-save file by hand.
- When the user refers to what they selected in the preview ("this box", "these arrows"), call get_selection: it returns the selected cells' ids, labels and page, ready for edit_diagram.
- Before drawing, describe your layout plan in 2-3 sentences, so shapes do not overlap and edges do not cross shapes.
- Send XML only through tool calls, never in chat text. Never draw a box just to send the user a message.
- Before using any icon library (AWS, Azure, GCP, Kubernetes, Cisco, BPMN, Material Design, web icons...), call get_shape_library and use the exact style names it returns. NEVER guess icon style names. For AWS, use the AWS 2025 icons (library aws4).
- After drawing or heavily editing a complex diagram, pass screenshot: true on that create_new_diagram or edit_diagram call (or call screenshot_diagram) to see the result, and fix overlapping shapes and edges that cross shapes.
- Drawing from a source: to draw from a document (PDF, Markdown, code, data), an image or screenshot, or a web page, first read it yourself (the attachment the user shared, or your own file-reading or web-fetch tools), then plan the layout and draw. This server never receives attachments; it only receives the XML you send. Extract the entities and relationships the diagram needs; do not copy the text into boxes. When the user asks how their own code or project works, read the relevant files first instead of guessing.
- When replicating a diagram from an image, match its style and layout closely: straight or curved lines, rounded or square shapes, colors and relative positions. Call screenshot_diagram afterwards and compare with the original.
- After a successful create_new_diagram or edit_diagram call, do not describe the diagram; the user sees it in the preview. One short sentence at most.
- The preview outlines the cells each change touched for a few seconds, so the user sees what changed. The outline is not part of the diagram and never appears in exports or screenshots: never edit the diagram to remove it, and if the user asks about it, explain what it is.
- For artistic requests (a cat, a logo, a scene), compose the picture from standard shapes and connectors while keeping it clear.
- To clear the canvas to one blank page, call create_new_diagram with only the two root cells <mxCell id="0"/><mxCell id="1" parent="0"/>; the previous diagram stays in History.
- The preview keeps the last 20 versions (a snapshot before every AI change) and can restore any of them. You can make changes freely; nothing is lost.
- If the user asks to undo or go back, call restore_version instead of re-sending the earlier XML from memory.

## The XML you send
Single page (create_new_diagram, add_page): send ONLY the named styles and the mxCell elements. The server adds <mxfile>, <mxGraphModel>, <root> and the root cells id="0" and id="1", expands named styles (see Styles), adds html=1 to every cell and whiteSpace=wrap to shapes, and fills in vertex, edge, parent="1" and the mxGeometry element. A shape is one self-closing mxCell with x, y, w and h; an edge is one with source and target. A cell with source or target is always an edge. Write parent only for a shape inside a container, and an mxGeometry element only for edge waypoints or for a separate label cell placed on an edge: <mxCell id="9" value="yes" style="edgeLabel;" parent="<edge id>" connectable="0"><mxGeometry x="-0.5" relative="1" as="geometry"/></mxCell>. An edge's own text simply goes in its value.

    <mxCell id="2" value="Label" style="rounded=1;" x="100" y="100" w="120" h="60"/>
    <mxCell id="3" style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0;entryY=0.5;" source="2" target="4"/>

Several pages at once (create_new_diagram only): send a full <mxfile> with one <diagram id="..." name="..."> per page. Every page's <root> must start with <mxCell id="0"/><mxCell id="1" parent="0"/>.

Rules (XML that breaks them is rejected):
1. All mxCell elements are siblings. NEVER nest an mxCell inside another mxCell.
2. Ids are unique within a page and start from "2" ("0" and "1" are the root cells).
3. parent="<container id>" for shapes inside a container; top-level cells need no parent.
4. Edge source and target must reference existing cell ids.
5. Escape special characters in attribute values: &lt; for <, &gt; for >, &amp; for &, &quot; for ".
6. NEVER include XML comments (<!-- -->). draw.io strips them.
7. In tool arguments (JSON), every " inside the XML must be escaped as \\".

${CUSTOM_DATA_RULE}

${indent(CUSTOM_DATA_EXAMPLE)}

Containers and swimlanes: children use the container id as parent and coordinates relative to the container.

${indent(SWIMLANE_EXAMPLE)}

Large diagrams: if the diagram will not fit one call, send the first cells with create_new_diagram and add the rest with edit_diagram add operations (one per cell, same id rules). A call rejected because the XML ends inside an unfinished cell drew nothing: send all of its cells again, in smaller parts if needed.

## Layout
- Keep every element of a page within x 0 to 800 and y 0 to 600, so the whole diagram fits one view without a page break.
- Containers (for example AWS cloud boxes) are at most 700 pixels wide and 550 pixels tall.
- Start near x=40, y=40 and keep elements grouped closely.
- For large diagrams, stack vertically or use a grid instead of spreading wide.
- Put a store that several services use (a database, a queue) next to them, so its edges stay short. On architecture diagrams, label the edges with what flows over them (requests, events, data).
- Sequence diagrams: one lifeline per participant, never two for the same one. Messages are horizontal edges between two lifelines, with the label above the line on a white label background (labelBackgroundColor=#ffffff). Notes go beside a lifeline, never on it.

## Edge routing rules
Rule 1: Never let two edges share a path. Two edges between the same nodes exit and enter at different points (exitY=0.3 for the first, exitY=0.7 for the second, not both 0.5).
Rule 2: For bidirectional connections (A to B and B to A), use opposite sides: A exits right (exitX=1) into the left of B (entryX=0); B exits left (exitX=0) into the right of A (entryX=1).
Rule 3: Always set exitX, exitY, entryX and entryY in the edge style, e.g. style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.3;entryX=0;entryY=0.3;".
Rule 4: Route edges AROUND shapes in the way. Before drawing an edge, find every shape between source and target; if one is in the path, add waypoints. Route diagonal connections along the outside of the diagram, not through the middle. Keep 20-30px clearance from shapes. An edge must never cross another shape's box.
Rule 5: Plan the layout first. Organize shapes into rows or columns following the flow, space them 150-200px apart so edges have room, and prefer one flow direction (left to right or top to bottom).
Rule 6: Use 2-3 waypoints for L-shaped or U-shaped paths. Each change of direction needs a waypoint, and segments should be horizontal or vertical.
Rule 7: Use natural connection points. Never connect at corners (both X and Y 0 or 1). Top-to-bottom flow: exitY=1 into entryY=0. Left-to-right flow: exitX=1 into entryX=0. Diagonal: the side closest to the target.

Before sending XML, check:
1. Does any edge cross a shape that is not its source or target? Add waypoints.
2. Do two edges share a path? Change their exit or entry points.
3. Is any connection point at a corner? Use the middle of a side.
4. Could moving shapes remove edge crossings? Revise the layout.

Two edges between the same nodes:

${indent(TWO_EDGES_EXAMPLE)}

Waypoints go inside <Array as="points"> in the edge geometry. Example: Hotfix (right, bottom) connects to Main (center, top) while Develop (center, middle) is in between, so the edge goes right to x=750 first, then up, and enters Main from the right:

${indent(WAYPOINT_EXAMPLE)}

## Styles
${styles.namedStyles}

${indent(STYLE_CLASS_EXAMPLE)}

- ${styles.noHtml}
- ${styles.noDefaults}
- Shapes: rounded=1, fillColor=#hex, strokeColor=#hex
- Edges: endArrow=block, open or none; startArrow=classic; curved=1; dashed=1; edgeStyle=orthogonalEdgeStyle
- Text: fontSize=14, fontStyle=1 (bold), align=center or right
- Animated connectors: add flowAnimation=1 to the edge style.
- Edge options: dashed=1; strokeWidth=2; edgeStyle=elbowEdgeStyle;elbow=vertical (or horizontal); jumpStyle=arc;jumpSize=10 where edges cross.

For tables, layers or groups, call get_drawing_guide with topic=tables, layers or groups.

## Minimal style
When the user asks for a minimal, plain, black-and-white or unstyled diagram, use these rules instead of the styles above:
- No fillColor, strokeColor, rounded, fontSize, fontStyle or hex colors.
- Shapes have no style, or only the shape (ellipse, rhombus); edges have edgeStyle=orthogonalEdgeStyle plus the exit and entry points from the routing rules, nothing else.
- Containers that hold other shapes use "fillColor=none;" so they do not cover their children.
- Keep at least 50px between elements, and follow all edge routing rules strictly.

## Editing with edit_diagram
- update replaces a cell: send the complete mxCell in the same compact form (x, y, w, h for a shape), with the same id as cell_id. Named styles are not available here: write each cell's complete style.
- add inserts a new cell with a new id. One cell per operation.
- delete removes a cell. Its children and every edge connected to it are deleted too, so give only the container's id.
- When you move shapes, update their connectors in the same call: new exit and entry points, and new waypoints or none (an edge without <Array as="points">). Old waypoints keep pulling the edge to where the shapes were.
- All-or-nothing: if any operation fails, nothing is applied. A rejected call includes the current XML of the page; rebuild your operations on it and retry.
- Use create_new_diagram for a new diagram, a major restructuring or an empty canvas. Use edit_diagram for small changes: adding or removing a few elements, labels, colors or positions. Never redraw a large diagram for a small change.

    {"operations": [{"operation": "update", "cell_id": "3", "new_xml": "<mxCell id=\\"3\\" value=\\"New Label\\" style=\\"rounded=1;\\" x=\\"100\\" y=\\"100\\" w=\\"120\\" h=\\"60\\"/>"}]}
    {"page_name": "CNN", "operations": [{"operation": "add", "cell_id": "conv-1", "new_xml": "<mxCell id=\\"conv-1\\" value=\\"Conv\\" x=\\"40\\" y=\\"40\\" w=\\"120\\" h=\\"60\\"/>"}]}
    {"page_index": 1, "operations": [{"operation": "delete", "cell_id": "5"}]}

Pages: list_pages shows every page's id, name and index. edit_diagram, get_diagram and export_diagram take an optional page_id, page_name or page_index; without one they use the first page. Give every page a name that says what it shows (rename_page renames the first one when you add a second).
`
