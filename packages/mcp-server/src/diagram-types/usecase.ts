import type { DiagramType } from "./types.ts"

/**
 * Use case diagrams. Without a guide the use cases are drawn on the system's
 * box without belonging to it, so they stay behind when the box is moved,
 * and an actor is sometimes pieced together from a circle and lines.
 */
const EXAMPLE = `<mxStyle name="actor" value="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;"/>
<mxStyle name="uses" value="endArrow=none;"/>
<mxStyle name="include" value="dashed=1;endArrow=open;"/>
<mxCell id="2" value="ATM" style="swimlane;startSize=30;" x="200" y="40" w="440" h="300"/>
<mxCell id="3" value="Withdraw cash" style="ellipse;" parent="2" x="40" y="50" w="160" h="50"/>
<mxCell id="4" value="Check balance" style="ellipse;" parent="2" x="40" y="130" w="160" h="50"/>
<mxCell id="5" value="Transfer money" style="ellipse;" parent="2" x="40" y="210" w="160" h="50"/>
<mxCell id="6" value="Authenticate" style="ellipse;" parent="2" x="260" y="130" w="160" h="50"/>
<mxCell id="7" value="Customer" style="actor;" x="80" y="160" w="30" h="60"/>
<mxCell id="8" value="Bank" style="actor;" x="730" y="160" w="30" h="60"/>
<mxCell id="9" style="uses;" source="7" target="3"/>
<mxCell id="10" style="uses;" source="7" target="4"/>
<mxCell id="11" style="uses;" source="7" target="5"/>
<mxCell id="12" value="«include»" style="include;" source="3" target="6"/>
<mxCell id="13" value="«include»" style="include;" source="4" target="6"/>
<mxCell id="14" value="«include»" style="include;" source="5" target="6"/>
<mxCell id="15" style="uses;" source="8" target="6"/>`

export const usecase: DiagramType = {
    name: "usecase",
    when: "UML use cases: actors, a system and what the actors do with it",
    example: EXAMPLE,
    guide: (draw) => `# Use case diagram

Example (two actors, a system with four use cases):

${EXAMPLE}

Where the user says what stands where (an actor's side, a use case at the top, columns) or how the lines run, do that. The rules below are for when they do not.

The system
- One container with the style "swimlane;startSize=30;" and the system's name as its value. Every use case is a child of it: parent = its id, x and y counted from its corner.
- Size it to its use cases: w = 280 for one column of use cases, 440 for two; h = 80 × the use cases of the tallest column + 60.

Use cases
- An ellipse with the name as its value, 160 wide (more for a long name: about 8 px per Latin letter, 15 px per CJK character, plus 40) and 50 tall.
- Stack them in a column 80 px apart: x=40, y = 50, 130, 210, ... A use case that others include or extend goes in a second column at x=260, at the height of the ones that point to it.
- With actors on both sides, the use cases of the right side's actors stand in the second column too, so every actor's lines stay on its own side. A use case that actors of both sides take part in stands alone at the top, between the columns (x=150, y=50), and the columns start below it at y=130.

Actors
- One cell per actor with the style "actor;" (draw.io's stick figure, the name below it), w=30, h=60. Never build a figure from circles and lines.
- Actors stand outside the system: the people who start use cases on its left (x = system x - 120), other systems and helpers on its right (x = system right edge + 90), each at the height of the middle of its use cases. Two actors on one side are at least 120 px apart, so that the name of one stays clear of the next.

Lines
- An actor and a use case it takes part in: a straight line, style "uses;". Add no edgeStyle: a line with elbows runs around the system or through other use cases.
- Include and extend: a straight dashed arrow, style "include;", with «include» or «extend» as its value. It runs from the use case that includes to the included one, and from the extending use case to the one it extends.

Now call ${draw}. Write no text before the call.`,
}
