import type { DiagramType } from "./types.ts"

/**
 * Swimlane diagrams (cross-functional flowcharts). Without a guide the
 * lanes are often coloured bands with the steps drawn on them, which stay
 * behind when a lane is moved.
 *
 * Two guides, one per direction, since a model copies the example it is
 * shown. The lanes stand side by side with their names on top, which is how
 * the models draw them when left alone and what long role names need. Real
 * requests asked for "vertical lanes" and "the lane titles on top": a guide
 * that knew only rows drew rows there. Lanes as rows have a guide of their
 * own for the users who ask for them: as a paragraph of rules in this guide
 * the steps came out on the lanes' names, and as a second example here the
 * model drew rows for half of the users who had not asked.
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
    when: "a process split by who does each step (roles, departments, systems); a cross-functional flowchart. Lanes side by side, their names on top",
    example: EXAMPLE,
    guide: (draw) => `# Swimlane diagram

This guide draws the lanes side by side with their names on top. If the user asks for horizontal lanes (lanes as rows, one above the other), get the guide of the type "swimlane-horizontal" and follow that one.

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

The server then spaces the steps evenly on their rows and gives every connector a path around the steps: which lane and which row a step stands in is what counts.

Now call ${draw} with type="swimlane". Write no text before the call.`,
}

const ROWS_EXAMPLE = `<mxStyle name="lane" value="swimlane;horizontal=0;startSize=30;"/>
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

export const swimlaneHorizontal: DiagramType = {
    name: "swimlane-horizontal",
    when: "a swimlane diagram with the lanes as rows, one above the other: only when the user asks for horizontal lanes",
    example: ROWS_EXAMPLE,
    guide: (draw) => `# Swimlane diagram with horizontal lanes

Example (three lanes as rows, seven steps in five columns):

${ROWS_EXAMPLE}

Lanes
- One lane per role, stacked from top to bottom: a container with the style "lane;" and the role as its value (the name stands upright in a 30 px band at the lane's left).
- All lanes have the same x and w and touch each other: y = 40 + 120 × index, h=120. A role's name longer than 8 CJK characters or 14 Latin letters needs taller lanes: h=160 and y = 40 + 160 × index for all of them, and 20 more in every step's y.
- Every step is a child of the lane of the role that does it: parent = the lane's id, x and y counted from the lane's corner.

Columns
- Time runs from left to right in columns 160 px apart. A step stands in the column after the step that leads to it: x = 50 + 160 × column (0 for the first), y=30, w=120, h=60. A decision is a rhombus with y=20 and h=80. No step starts left of x=50, where the lane's name is.
- Two steps of one lane never share a column. The two branches of a decision go to the same next column when they are in different lanes.
- Every lane is as wide as all the columns: w = 160 × columns + 30.

Connectors
- To a step in the next column, in any lane: style "next;" (out of the right side, into the left side).
- To a step in the same column of another lane: out of the side that faces it, into the facing side (exitX=0.5;exitY=0;entryX=0.5;entryY=1 upwards, exitY=1 and entryY=0 downwards).
- A decision's second branch leaves by its bottom or top: "edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0;entryY=0.5;". The branch's word (Yes, No) is the edge's value.
- A line back to an earlier step leaves by the top or bottom and enters the step's top or bottom, so it runs between the rows of steps and never through one.

The server then spaces the steps evenly on their columns and gives every connector a path around the steps: which lane and which column a step stands in is what counts.

Now call ${draw} with type="swimlane-horizontal". Write no text before the call.`,
}
