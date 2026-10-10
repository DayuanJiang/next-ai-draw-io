/**
 * XML examples shared by the MCP drawing guide and the web app's system
 * prompt and tool descriptions, so both teach the model the same thing.
 */

export const SWIMLANE_EXAMPLE = `<mxCell id="lane1" value="Frontend" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="200" height="200" as="geometry"/>
</mxCell>
<mxCell id="step1" value="Step 1" style="rounded=1;" vertex="1" parent="lane1">
  <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
</mxCell>
<mxCell id="lane2" value="Backend" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="280" y="40" width="200" height="200" as="geometry"/>
</mxCell>
<mxCell id="step2" value="Step 2" style="rounded=1;" vertex="1" parent="lane2">
  <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
</mxCell>
<mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="step1" target="step2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>`

export const TWO_EDGES_EXAMPLE = `<mxCell id="e1" value="A to B" style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.3;entryX=0;entryY=0.3;" edge="1" parent="1" source="a" target="b">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="e2" value="B to A" style="edgeStyle=orthogonalEdgeStyle;exitX=0;exitY=0.7;entryX=1;entryY=0.7;" edge="1" parent="1" source="b" target="a">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>`

export const WAYPOINT_EXAMPLE = `<mxCell id="hotfix_to_main" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=1;entryY=0.5;" edge="1" parent="1" source="hotfix" target="main">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="750" y="80"/>
      <mxPoint x="750" y="150"/>
    </Array>
  </mxGeometry>
</mxCell>`

/** Named styles defined once and used by name, like CSS classes */
export const STYLE_CLASS_EXAMPLE = `<mxStyle name="step" value="fillColor=#dae8fc;strokeColor=#6c8ebf;"/>
<mxStyle name="down" value="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0;"/>
<mxCell id="2" value="Start" style="rounded=1;step;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="3" value="Check" style="rhombus;step;fontStyle=1;" vertex="1" parent="1"><mxGeometry x="40" y="160" width="120" height="80" as="geometry"/></mxCell>
<mxCell id="4" value="Done" style="rounded=1;step;" vertex="1" parent="1"><mxGeometry x="40" y="300" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="5" style="down;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="6" style="down;" edge="1" parent="1" source="3" target="4"><mxGeometry relative="1" as="geometry"/></mxCell>`

/** Indent every line, for an indented code block in Markdown */
export const indent = (text: string, prefix = "    ") =>
    text
        .split("\n")
        .map((line) => prefix + line)
        .join("\n")
