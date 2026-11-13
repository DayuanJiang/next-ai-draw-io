import type { DiagramType } from "./types.ts"

/**
 * Sequence diagrams. Without a guide every model invents its own way:
 * shapes draw.io cannot show as lifelines, several messages attached to one
 * point, message texts on 2 px shapes.
 *
 * A message is placed by a pixel offset from the top of its participants
 * (exitDy, entryDy), not by a fraction of their height: a participant made
 * taller later, by the model or by hand, then leaves the messages where
 * they are, and one more message is one more edge.
 */
export const SEQUENCE_EXAMPLE = `<mxStyle name="life" value="shape=umlLifeline;perimeter=lifelinePerimeter;size=40;"/>
<mxStyle name="msg" value="verticalAlign=bottom;endArrow=block;"/>
<mxStyle name="reply" value="verticalAlign=bottom;endArrow=open;dashed=1;"/>
<mxCell id="2" value="User" style="life;" x="40" y="40" w="120" h="240"/>
<mxCell id="3" value="App" style="life;" x="240" y="40" w="120" h="240"/>
<mxCell id="4" value="Server" style="life;" x="440" y="40" w="120" h="240"/>
<mxCell id="5" value="Log in" style="msg;exitX=0.5;exitY=0;exitDy=80;entryX=0.5;entryY=0;entryDy=80;" source="2" target="3"/>
<mxCell id="6" value="POST /login" style="msg;exitX=0.5;exitY=0;exitDy=120;entryX=0.5;entryY=0;entryDy=120;" source="3" target="4"/>
<mxCell id="7" value="Check password" style="msg;align=left;verticalAlign=middle;spacingLeft=4;exitX=0.5;exitY=0;exitDy=160;entryX=0.5;entryY=0;entryDy=180;" source="4" target="4"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="530" y="200"/><mxPoint x="530" y="220"/></Array></mxGeometry></mxCell>
<mxCell id="8" value="200 OK" style="reply;exitX=0.5;exitY=0;exitDy=200;entryX=0.5;entryY=0;entryDy=200;" source="4" target="3"/>`

export const sequence: DiagramType = {
    name: "sequence",
    when: "who sends what to whom, in time order: requests and replies between users, apps and services",
    guide: (draw, edit) => `# Sequence diagram

Where this guide differs from the general rules, follow the guide: the diagram may grow below y=600, and a message has only the style and the exit and entry points written here (no edgeStyle, no waypoints except for a message to itself).

Example (three participants, four rows):

${SEQUENCE_EXAMPLE}

Participants
- One cell per participant, never two for the same one, with the style "life;" and the name as its value. draw.io shows the name in a 40 px head and draws the dashed lifeline below it as part of the shape.
- All have the same y. w=120, and x 200 apart (more when the message texts are long: about 8 px per Latin letter, 15 px per CJK character).
- Count the rows first: h = 80 + 40 × rows, the same for all.

Messages
- One row per message, in time order. Row k (1 for the first) lies D = 40 × (k + 1) px below the top of the participants: 80, 120, 160, ...
- A message is an edge between two participants with its text as the value and the style "msg;exitX=0.5;exitY=0;exitDy=D;entryX=0.5;entryY=0;entryDy=D;". A reply uses "reply;" in place of "msg;". Every message has its own D.
- A message from a participant to itself (id 7 in the example) takes one row: exitDy=D, entryDy=D+20, and two waypoints 30 px right of the participant's middle, at y = participant y + D and y = participant y + D + 20.

Frames and notes
- A loop or alt frame is a shape with the style "shape=umlFrame;width=50;height=20;fillColor=none;" and "loop" or "alt" as its value. Keep one row empty above its first message for the title. With D1 the D of that empty row and D2 the D of its last message: y = participant y + D1 - 30, h = D2 - D1 + 50, and it reaches from 10 px left of its leftmost participant to 10 px right of its rightmost one.
- A note is a shape with the style "shape=note;size=12;" in a row of its own, beside a lifeline, never on it.

Changing a sequence diagram with ${edit}
- One more message at the end: add one edge with the next D, and update every participant with h 40 larger.
- A message in the middle: also add 40 to exitDy and entryDy of every later message.

Now call ${draw}. Write no text before the call.`,
}
