/**
 * XML examples shared by the MCP drawing guide and the web app's system
 * prompt and tool descriptions, so both teach the model the same thing.
 */

export const SWIMLANE_EXAMPLE = `<mxCell id="lane1" value="Frontend" style="swimlane;" x="40" y="40" w="200" h="200"/>
<mxCell id="step1" value="Step 1" style="rounded=1;" parent="lane1" x="20" y="60" w="160" h="40"/>
<mxCell id="lane2" value="Backend" style="swimlane;" x="280" y="40" w="200" h="200"/>
<mxCell id="step2" value="Step 2" style="rounded=1;" parent="lane2" x="20" y="60" w="160" h="40"/>
<mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;" source="step1" target="step2"/>`

export const TWO_EDGES_EXAMPLE = `<mxCell id="e1" value="A to B" style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.3;entryX=0;entryY=0.3;" source="a" target="b"/>
<mxCell id="e2" value="B to A" style="edgeStyle=orthogonalEdgeStyle;exitX=0;exitY=0.7;entryX=1;entryY=0.7;" source="b" target="a"/>`

export const WAYPOINT_EXAMPLE = `<mxCell id="hotfix_to_main" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=1;entryY=0.5;" edge="1" parent="1" source="hotfix" target="main">
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="750" y="80"/>
      <mxPoint x="750" y="150"/>
    </Array>
  </mxGeometry>
</mxCell>`

/**
 * Custom data that draw.io shows in Edit Data: the id, the text and the
 * properties sit on an <object> wrapper around the cell (issue #822)
 */
export const CUSTOM_DATA_RULE = `Custom data: when the user's data gives a shape or an edge properties besides its text (an IP address, an owner, a status), keep them where draw.io's Edit Data shows them. Wrap the cell in <object> with the id, the text as label (not value) and one attribute per property; the mxCell inside keeps style and position, without id or value. Property names use letters, digits and underscores. Other cells stay plain mxCell. In edit_diagram, send the whole <object> with its id as cell_id.`

export const CUSTOM_DATA_EXAMPLE = `<object id="2" label="Web server" ip="10.0.0.5" owner="Ops"><mxCell style="rounded=1;" x="40" y="40" w="120" h="60"/></object>`

/** Named styles defined once and used by name, like CSS classes */
export const STYLE_CLASS_EXAMPLE = `<mxStyle name="step" value="fillColor=#dae8fc;strokeColor=#6c8ebf;"/>
<mxStyle name="down" value="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0;"/>
<mxCell id="2" value="Start" style="rounded=1;step;" x="40" y="40" w="120" h="60"/>
<mxCell id="3" value="Check" style="rhombus;step;fontStyle=1;" x="40" y="160" w="120" h="80"/>
<mxCell id="4" value="Done" style="rounded=1;step;" x="40" y="300" w="120" h="60"/>
<mxCell id="5" style="down;" source="2" target="3"/>
<mxCell id="6" style="down;" source="3" target="4"/>`

/**
 * The style rules shared by the drawing guide and the web app's system
 * prompt. They differ only in the tool whose call defines named styles
 * ("create_new_diagram or add_page", "display_diagram") and in who expands
 * them ("the server", "the app").
 */
export function styleRules(tool: string, actor: string) {
    const actorSentence = actor.charAt(0).toUpperCase() + actor.slice(1)
    return {
        /** Named styles, defined once and used like CSS classes */
        namedStyles: `Define each style used by several cells ONCE, as a named style before the cells, and use the name in the cells like a CSS class. A cell's style can combine a shape token, a name and overrides; later pairs win. Name only styles that two or more cells share; a style used by one cell stays inline. Names must not be draw.io's own style names: shapes such as text, ellipse, rhombus, swimlane, label, image, and colors such as blue, green, red, gray, yellow, orange, purple, pink. A definition applies to the call it is in: each ${tool} call defines the names it uses. ${actorSentence} expands the names, so the saved file is standard draw.io XML.`,
        /** html=1 and whiteSpace=wrap are added automatically */
        noHtml: `NEVER write html=1 or whiteSpace=wrap: ${actor} adds html=1 to every cell and whiteSpace=wrap to shapes. Labels are HTML: use &lt;br&gt; for a line break and &lt;b&gt; for bold, never \\n; a literal < or > in a label is written &amp;lt; or &amp;gt;.`,
        /** draw.io's own defaults are not written */
        noDefaults: `Do NOT repeat what draw.io already uses. For a plain shape: rounded=0, align=center, verticalAlign=middle, fontSize=12, strokeWidth=1, fillColor=#ffffff, strokeColor=#000000, fontColor=#000000. For an edge: endArrow=classic, strokeColor=#000000. Writing one of them is right only when it overrides what a name or the shape sets: an edge is rounded by default, so rounded=0 on an edge is a real setting, and a text cell is left/top aligned by default, so there align=center or verticalAlign=middle are real settings.`,
    }
}

/** Indent every line, for an indented code block in Markdown */
export const indent = (text: string, prefix = "    ") =>
    text
        .split("\n")
        .map((line) => prefix + line)
        .join("\n")
