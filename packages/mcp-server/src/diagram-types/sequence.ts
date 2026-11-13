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

Rows
- Time runs down in rows 40 px apart, however many there are: never squeeze them to fit a page. Row k (1 for the first) lies D = 40 × (k + 1) px below the top of the participants: 80, 120, 160, ...
- Every message takes a row of its own, a reply too. So do the title of a frame and a note.

Messages
- A message is an edge between two participants with its text as the value and the style "msg;exitX=0.5;exitY=0;exitDy=D;entryX=0.5;entryY=0;entryDy=D;", D being that of its row. A reply uses "reply;" in place of "msg;".
- A message from a participant to itself (id 7 in the example): exitDy=D, entryDy=D+20, and two waypoints 30 px right of the participant's middle, at y = participant y + D and y = participant y + D + 20.

Frames and notes
- A loop or alt frame goes around the rows of its messages and one title row above them. The title row holds no message: the last message before the frame is in the row above the title row. With t the title row and m the row of the frame's last message: a shape with the style "shape=umlFrame;width=50;height=20;fillColor=none;" and the one word "loop" or "alt" as its value, y = participant y + 40 × (t + 1) - 30, h = 40 × (m - t) + 50, from 10 px left of its leftmost participant to 10 px right of its rightmost one. Its condition, if it has one, is a text cell in the title row: style "text;align=left;", x = frame x + 60, y = frame y, h=20.
- Example of a frame: messages in rows 1 to 3, then a loop around two messages. Row 4 is its title row, its messages are in rows 5 and 6 (D = 240 and 280), the frame has y = participant y + 170 and h = 130, and the next message is in row 7.
- A note is a shape with the style "shape=note;size=12;", 40 px tall and at most 160 wide, in a row of its own that holds no message: y = participant y + D - 20, x = the middle of the participant it belongs to + 20. It then stands right of that lifeline, clear of the next one.

Changing a sequence diagram with ${edit}
- One more message at the end: add one edge with the next D, and update every participant with h 40 larger.
- A message in the middle: also add 40 to exitDy and entryDy of every later message.

Now call ${draw}. Write no text before the call.`,
}
