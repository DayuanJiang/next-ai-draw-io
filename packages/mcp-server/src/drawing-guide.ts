/**
 * Drawing guide for the model, returned by start_session, get_drawing_guide
 * and the diagram-workflow prompt.
 *
 * Adapted from the web app's system prompt (lib/system-prompts.ts) and its
 * tool descriptions (app/api/chat/route.ts). When drawing rules change there,
 * update this file too.
 */

import {
    indent,
    SWIMLANE_EXAMPLE,
    TWO_EDGES_EXAMPLE,
    WAYPOINT_EXAMPLE,
} from "./xml-examples.ts"

export const DRAWING_GUIDE = `# Draw.io drawing guide

## Workflow
- create_new_diagram draws a new diagram and REPLACES the whole document. add_page adds another tab. edit_diagram changes cells of an existing page. load_diagram opens a .drawio file (the server reads the file itself). get_diagram returns the current XML, including the user's manual edits. export_diagram saves to a file.
- Before drawing, describe your layout plan in 2-3 sentences, so shapes do not overlap and edges do not cross shapes.
- Send XML only through tool calls, never in chat text. Never draw a box just to send the user a message.
- Before using any icon library (AWS, Azure, GCP, Kubernetes, Cisco, BPMN, Material Design, web icons...), call get_shape_library and use the exact style names it returns. NEVER guess icon style names. For AWS, use the AWS 2025 icons (library aws4).
- After drawing or heavily editing a complex diagram, call screenshot_diagram once to see the result, and fix overlapping shapes and edges that cross shapes.
- When replicating a diagram from an image, match its style and layout closely: straight or curved lines, rounded or square shapes.
- The preview page has History (it saves a snapshot before every AI change and can restore any of the last 20 versions) and Download. You can make changes freely; nothing is lost.

## The XML you send
Single page (create_new_diagram, add_page): send ONLY the mxCell elements. The server adds <mxfile>, <mxGraphModel>, <root> and the root cells id="0" and id="1".

    <mxCell id="2" value="Label" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="3" style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0;entryY=0.5;endArrow=classic;html=1;" edge="1" parent="1" source="2" target="4">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>

Several pages at once (create_new_diagram only): send a full <mxfile> with one <diagram id="..." name="..."> per page. Every page's <root> must start with <mxCell id="0"/><mxCell id="1" parent="0"/>.

Rules (XML that breaks them is rejected):
1. All mxCell elements are siblings. NEVER nest an mxCell inside another mxCell.
2. Ids are unique within a page and start from "2" ("0" and "1" are the root cells).
3. parent="1" for top-level shapes, parent="<container id>" for shapes inside a container.
4. Edge source and target must reference existing cell ids.
5. Escape special characters in attribute values: &lt; for <, &gt; for >, &amp; for &, &quot; for ".
6. NEVER include XML comments (<!-- -->). draw.io strips them.
7. In tool arguments (JSON), every " inside the XML must be escaped as \\".

Containers and swimlanes: children use the container id as parent and coordinates relative to the container.

${indent(SWIMLANE_EXAMPLE)}

## Layout
- Keep every element of a page within x 0 to 800 and y 0 to 600, so the whole diagram fits one view without a page break.
- Containers (for example AWS cloud boxes) are at most 700 pixels wide and 550 pixels tall.
- Start near x=40, y=40 and keep elements grouped closely.
- For large diagrams, stack vertically or use a grid instead of spreading wide.

## Edge routing rules
Rule 1: Never let two edges share a path. Two edges between the same nodes exit and enter at different points (exitY=0.3 for the first, exitY=0.7 for the second, not both 0.5).
Rule 2: For bidirectional connections (A to B and B to A), use opposite sides: A exits right (exitX=1) into the left of B (entryX=0); B exits left (exitX=0) into the right of A (entryX=1).
Rule 3: Always set exitX, exitY, entryX and entryY in the edge style, e.g. style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.3;entryX=0;entryY=0.3;endArrow=classic;".
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
- Shapes: rounded=1, fillColor=#hex, strokeColor=#hex, whiteSpace=wrap;html=1;
- Edges: endArrow=classic, block, open or none; startArrow=none or classic; curved=1; edgeStyle=orthogonalEdgeStyle
- Text: fontSize=14, fontStyle=1 (bold), align=center, left or right
- Animated connectors: add flowAnimation=1 to the edge style.

## Minimal style
When the user asks for a minimal, plain, black-and-white or unstyled diagram, use these rules instead of the styles above:
- No fillColor, strokeColor, rounded, fontSize, fontStyle or hex colors.
- Shapes use style "whiteSpace=wrap;html=1;", edges use "html=1;endArrow=classic;".
- Containers that hold other shapes use "whiteSpace=wrap;html=1;fillColor=none;" so they do not cover their children.
- Keep at least 50px between elements, and follow all edge routing rules strictly.

## Editing with edit_diagram
- update replaces a cell: send the complete mxCell including mxGeometry, with the same id as cell_id.
- add inserts a new cell with a new id. One cell per operation.
- delete removes a cell. Its children and every edge connected to it are deleted too, so give only the container's id.
- All-or-nothing: if any operation fails, nothing is applied. A rejected call includes the current XML of the page; rebuild your operations on it and retry.
- If the diagram is large, change it with edit_diagram instead of redrawing it.

    {"operations": [{"operation": "update", "cell_id": "3", "new_xml": "<mxCell id=\\"3\\" value=\\"New Label\\" style=\\"rounded=1;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}
    {"page_name": "CNN", "operations": [{"operation": "add", "cell_id": "conv-1", "new_xml": "<mxCell id=\\"conv-1\\" value=\\"Conv\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"40\\" y=\\"40\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}
    {"page_index": 1, "operations": [{"operation": "delete", "cell_id": "5"}]}

Pages: list_pages shows every page's id, name and index. edit_diagram, get_diagram and export_diagram take an optional page_id, page_name or page_index; without one they use the first page.
`
