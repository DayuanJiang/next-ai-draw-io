import type { DiagramType } from "./types.ts"

/**
 * Swimlane diagrams (cross-functional flowcharts). Without a guide the
 * lanes are often coloured bands with the steps drawn on them, which stay
 * behind when a lane is moved.
 *
 * The lanes stand side by side with their names on top, which is how the
 * models draw them when left alone and what long role names need; lanes as
 * rows are drawn when the user asks for them. Real requests asked for
 * "vertical lanes" and "the lane titles on top": a guide that knew only
 * rows drew rows there.
 */
const EXAMPLE = `<mxStyle name="next" value="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0;"/>
<mxCell id="2" value="Customer" style="swimlane;startSize=30;" x="40" y="40" w="220" h="540"/>
<mxCell id="3" value="Support" style="swimlane;startSize=30;" x="260" y="40" w="220" h="540"/>
<mxCell id="4" value="Finance" style="swimlane;startSize=30;" x="480" y="40" w="220" h="540"/>
<mxCell id="5" value="Request refund" style="rounded=1;" parent="2" x="40" y="50" w="140" h="60"/>
<mxCell id="6" value="Check order" style="rounded=1;" parent="3" x="40" y="150" w="140" h="60"/>
<mxCell id="7" value="Eligible?" style="rhombus;" parent="3" x="40" y="240" w="140" h="80"/>
<mxCell id="8" value="Reject request" style="rounded=1;" parent="3" x="40" y="350" w="140" h="60"/>
<mxCell id="9" value="Approve refund" style="rounded=1;" parent="4" x="40" y="350" w="140" h="60"/>
<mxCell id="10" value="Send money" style="rounded=1;" parent="4" x="40" y="450" w="140" h="60"/>
<mxCell id="11" value="Receive refund" style="rounded=1;" parent="2" x="40" y="450" w="140" h="60"/>
<mxCell id="12" style="next;" source="5" target="6"/>
<mxCell id="13" style="next;" source="6" target="7"/>
<mxCell id="14" value="No" style="next;" source="7" target="8"/>
<mxCell id="15" value="Yes" style="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0.5;entryY=0;" source="7" target="9"/>
<mxCell id="16" style="next;" source="9" target="10"/>
<mxCell id="17" style="edgeStyle=orthogonalEdgeStyle;exitX=0;exitY=0.5;entryX=1;entryY=0.5;" source="10" target="11"/>`

export const swimlane: DiagramType = {
    name: "swimlane",
    when: "a process split by who does each step (roles, departments, systems); a cross-functional flowchart",
    example: EXAMPLE,
    guide: (draw) => `# Swimlane diagram

Example (three lanes side by side, seven steps in five rows):

${EXAMPLE}

Lanes
- One lane per role, side by side from left to right: a container with the style "swimlane;startSize=30;" and the role as its value (the name stands in a 30 px band at the lane's top).
- All lanes have the same y and h and touch each other: x = 40 + 220 × index, w=220.
- Every step is a child of the lane of the role that does it: parent = the lane's id, x and y counted from the lane's corner.

Rows
- Time runs from top to bottom in rows 100 px apart. A step stands in the row after the step that leads to it: x=40, y = 50 + 100 × row (0 for the first), w=140, h=60. A decision is a rhombus with y = 40 + 100 × row and h=80.
- Two steps of one lane never share a row. The two branches of a decision go to the same next row when they are in different lanes.
- Every lane is as tall as all the rows: h = 100 × rows + 40.

Connectors
- To a step in the next row, in any lane: style "next;" (out of the bottom, into the top).
- To a step in the same row of another lane: out of the side that faces it, into the facing side (exitX=0;exitY=0.5;entryX=1;entryY=0.5 to the left; exitX=1 and entryX=0 to the right).
- A decision's second branch leaves by its side: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0.5;entryY=0;" (exitX=0 for the left side). The branch's word (Yes, No) is the edge's value.
- A line back to an earlier step leaves by a side and enters that step's side, so it runs between the lanes' steps and never through one.

Lanes as rows
- Only when the user asks for horizontal lanes (lanes as rows), turn everything by a quarter: the lane style is "swimlane;horizontal=0;startSize=30;" (the name upright at the lane's left), the lanes are stacked with y = 40 + 120 × index and h=120, the steps stand in columns 160 px apart (x = 50 + 160 × column, y=30, w=120), a lane's w = 160 × columns + 30, and "next;" leaves by the right side and enters the left side (exitX=1;exitY=0.5;entryX=0;entryY=0.5).

Now call ${draw}. Write no text before the call.`,
}
