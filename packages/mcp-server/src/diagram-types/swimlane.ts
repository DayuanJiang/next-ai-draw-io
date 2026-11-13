import type { DiagramType } from "./types.ts"

/**
 * Swimlane diagrams (cross-functional flowcharts). Without a guide the
 * lanes are often coloured bands with the steps drawn on them, which stay
 * behind when a lane is moved, and half of the drawings have a connector
 * that runs through a step or a label.
 */
const EXAMPLE = `<mxStyle name="lane" value="swimlane;horizontal=0;startSize=30;"/>
<mxStyle name="next" value="edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0;entryY=0.5;"/>
<mxCell id="2" value="Customer" style="lane;" x="40" y="40" w="830" h="120"/>
<mxCell id="3" value="Support" style="lane;" x="40" y="160" w="830" h="120"/>
<mxCell id="4" value="Finance" style="lane;" x="40" y="280" w="830" h="120"/>
<mxCell id="5" value="Request refund" style="rounded=1;" parent="2" x="50" y="30" w="120" h="60"/>
<mxCell id="6" value="Check order" style="rounded=1;" parent="3" x="210" y="30" w="120" h="60"/>
<mxCell id="7" value="Eligible?" style="rhombus;" parent="3" x="370" y="20" w="120" h="80"/>
<mxCell id="8" value="Reject request" style="rounded=1;" parent="3" x="530" y="30" w="120" h="60"/>
<mxCell id="9" value="Approve refund" style="rounded=1;" parent="4" x="530" y="30" w="120" h="60"/>
<mxCell id="10" value="Send money" style="rounded=1;" parent="4" x="690" y="30" w="120" h="60"/>
<mxCell id="11" value="Receive refund" style="rounded=1;" parent="2" x="690" y="30" w="120" h="60"/>
<mxCell id="12" style="next;" source="5" target="6"/>
<mxCell id="13" style="next;" source="6" target="7"/>
<mxCell id="14" value="No" style="next;" source="7" target="8"/>
<mxCell id="15" value="Yes" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0;entryY=0.5;" source="7" target="9"/>
<mxCell id="16" style="next;" source="9" target="10"/>
<mxCell id="17" style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=0;entryX=0.5;entryY=1;" source="10" target="11"/>`

export const swimlane: DiagramType = {
    name: "swimlane",
    when: "a process split by who does each step (roles, departments, systems); a cross-functional flowchart",
    example: EXAMPLE,
    guide: (draw) => `# Swimlane diagram

Example (three lanes, seven steps in five columns):

${EXAMPLE}

Lanes
- One lane per role, stacked from top to bottom: a container with the style "lane;" and the role as its value (the name stands upright in a 30 px band on the lane's left).
- All lanes have the same x and w and touch each other: y = 40 + 120 × index, h=120.
- Every step is a child of the lane of the role that does it: parent = the lane's id, x and y counted from the lane's corner.

Columns
- Time runs from left to right in columns 160 px apart. A step stands in the column after the step that leads to it: x = 50 + 160 × column (0 for the first), y=30, w=120, h=60. A decision is a rhombus with y=20 and h=80.
- Two steps of one lane never share a column. The two branches of a decision go to the same next column when they are in different lanes.
- Every lane is as wide as all the columns: w = 160 × columns + 30.

Connectors
- To a step in the next column, in any lane: style "next;" (out of the right side, into the left side).
- To a step in the same column of another lane: out of the side that faces it, into the facing side (exitX=0.5;exitY=0;entryX=0.5;entryY=1 upwards, exitY=1 and entryY=0 downwards).
- A decision's second branch leaves by its bottom or top: "edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0;entryY=0.5;". The branch's word (Yes, No) is the edge's value.
- A line back to an earlier step leaves by the top or bottom and enters the step's top or bottom, so it runs between the rows of steps and never through one.

Now call ${draw}. Write no text before the call.`,
}
