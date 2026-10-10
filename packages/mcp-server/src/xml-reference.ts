/**
 * Short XML references returned by get_drawing_guide with a topic. Each
 * snippet is the bare mxCell elements of one page, as create_new_diagram
 * accepts them, and is checked by tests/xml-reference.test.ts.
 */

import { indent } from "./xml-examples.ts"

const TABLE_ROW_STYLE =
    "shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;strokeColor=inherit;top=0;left=0;bottom=0;right=0;collapsible=0;dropTarget=0;fillColor=none;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;"

const TABLE_CELL_STYLE =
    "shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;strokeColor=inherit;overflow=hidden;fillColor=none;top=0;left=0;bottom=0;right=0;pointerEvents=1;"

const TABLES_EXAMPLE = `<mxCell id="table1" style="shape=table;startSize=0;container=1;collapsible=0;childLayout=tableLayout;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="240" height="80" as="geometry"/>
</mxCell>
<mxCell id="row1" style="${TABLE_ROW_STYLE}" vertex="1" parent="table1">
  <mxGeometry y="0" width="240" height="40" as="geometry"/>
</mxCell>
<mxCell id="cell11" value="Name" style="${TABLE_CELL_STYLE}fontStyle=1;" vertex="1" parent="row1">
  <mxGeometry x="0" y="0" width="120" height="40" as="geometry"/>
</mxCell>
<mxCell id="cell12" value="Role" style="${TABLE_CELL_STYLE}fontStyle=1;" vertex="1" parent="row1">
  <mxGeometry x="120" y="0" width="120" height="40" as="geometry"/>
</mxCell>
<mxCell id="row2" style="${TABLE_ROW_STYLE}" vertex="1" parent="table1">
  <mxGeometry y="40" width="240" height="40" as="geometry"/>
</mxCell>
<mxCell id="cell21" value="Alice" style="${TABLE_CELL_STYLE}" vertex="1" parent="row2">
  <mxGeometry x="0" y="0" width="120" height="40" as="geometry"/>
</mxCell>
<mxCell id="cell22" value="Admin" style="${TABLE_CELL_STYLE}" vertex="1" parent="row2">
  <mxGeometry x="120" y="0" width="120" height="40" as="geometry"/>
</mxCell>`

const LAYERS_EXAMPLE = `<mxCell id="L2" value="Layer 2" parent="0"/>
<mxCell id="2" value="On the default layer" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="3" value="On Layer 2" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="L2">
  <mxGeometry x="200" y="40" width="120" height="60" as="geometry"/>
</mxCell>`

const GROUPS_EXAMPLE = `<mxCell id="group1" style="group" vertex="1" connectable="0" parent="1">
  <mxGeometry x="40" y="40" width="260" height="60" as="geometry"/>
</mxCell>
<mxCell id="2" value="A" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="group1">
  <mxGeometry x="0" y="0" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="3" value="B" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="group1">
  <mxGeometry x="140" y="0" width="120" height="60" as="geometry"/>
</mxCell>`

export const XML_REFERENCE: Record<"tables" | "layers" | "groups", string> = {
    tables: `## Tables
A table is three levels of cells, as draw.io's sidebar inserts them: the table container (style "shape=table;startSize=0;container=1;collapsible=0;childLayout=tableLayout;", parent="1", geometry wide enough for all columns), one row per table row (style as below, parent = table id, width = table width, height = row height, y = row offset), and one cell per column inside each row (style as below, parent = row id, x = column offset, y = 0, width = column width, height = row height; the cell text is the value). A header row can use fontStyle=1 on its cells. Example with 2 rows and 2 columns:

${indent(TABLES_EXAMPLE)}
`,
    layers: `## Layers
A layer is the one case of a cell with parent="0" and no vertex or edge attribute; id="1" is the default layer. Add a layer cell and give shapes parent="<layer id>" to put them on it:

${indent(LAYERS_EXAMPLE)}
`,
    groups: `## Groups
A group is a container with style="group" (parent="1", geometry enclosing its children). Children use parent="<group id>" and coordinates relative to the group; moving the group moves them:

${indent(GROUPS_EXAMPLE)}
`,
}
