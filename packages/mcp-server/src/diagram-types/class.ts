import type { DiagramType } from "./types.ts"

/**
 * Class diagrams. Without a guide a class is sometimes a box with texts and
 * lines laid on it, which stay behind when it is moved, and a third of the
 * drawings have a relation that runs through a class or labels on each
 * other.
 */
const EXAMPLE = `<mxStyle name="class" value="align=left;verticalAlign=top;spacingLeft=8;spacingTop=4;"/>
<mxStyle name="inherit" value="edgeStyle=orthogonalEdgeStyle;endArrow=block;endFill=0;endSize=12;exitX=0.5;exitY=0;"/>
<mxStyle name="compose" value="edgeStyle=orthogonalEdgeStyle;startArrow=diamondThin;startFill=1;startSize=14;endArrow=none;"/>
<mxCell id="2" value="&lt;b&gt;Shape&lt;/b&gt;&lt;hr&gt;x: int&lt;br&gt;y: int&lt;hr&gt;area(): float&lt;br&gt;draw()" style="class;" x="240" y="40" w="200" h="130"/>
<mxCell id="3" value="&lt;b&gt;Circle&lt;/b&gt;&lt;hr&gt;radius: float" style="class;" x="120" y="270" w="200" h="70"/>
<mxCell id="4" value="&lt;b&gt;Rectangle&lt;/b&gt;&lt;hr&gt;width: float&lt;br&gt;height: float" style="class;" x="360" y="270" w="200" h="90"/>
<mxCell id="5" value="&lt;b&gt;Canvas&lt;/b&gt;&lt;hr&gt;shapes: List&amp;lt;Shape&amp;gt;&lt;hr&gt;add(s: Shape)&lt;br&gt;render()" style="class;" x="560" y="40" w="200" h="110"/>
<mxCell id="6" style="inherit;entryX=0.3;entryY=1;" source="3" target="2"/>
<mxCell id="7" style="inherit;entryX=0.7;entryY=1;" source="4" target="2"/>
<mxCell id="8" value="0..*" style="compose;exitX=0;exitY=0.5;entryX=1;entryY=0.5;" source="5" target="2"/>`

export const classDiagram: DiagramType = {
    name: "class",
    when: "UML classes with their attributes and methods, and the relations between them",
    example: EXAMPLE,
    guide: (draw) => `# Class diagram

Example (a parent class with two subclasses, and a class composed of it):

${EXAMPLE}

Classes
- A class is ONE cell with the style "class;". Its value holds the name in bold, a line, the attributes, a line and the methods: <b>Name</b><hr>attribute: Type<br>attribute: Type<hr>method(): Type. Leave out a part the class does not have, with its <hr>. Never lay separate texts or lines on a class.
- An interface or an abstract class has «interface» or «abstract» and <br> before the name.
- In the XML the tags of the value are written &lt;b&gt;, &lt;hr&gt;, &lt;br&gt;, and a < or > that belongs to the text (List<Shape>) is written &amp;lt; or &amp;gt;, as in the example.
- w=200 (more when a line is long: about 7 px per letter plus 20). h = 30 + 18 for every attribute and method + 10 for every <hr>.

Layout
- A parent class stands above its subclasses, with 100 px between the rows. Subclasses of one parent stand side by side, 40 px apart, below it.
- Classes that are only associated stand side by side, at least 120 px apart, so that a relation runs straight from one to the other.

Relations
- Inheritance: style "inherit;" from the subclass (source) to the parent (target), which gets the hollow triangle. Every subclass enters the parent's bottom at its own point: entryX = 0.3, 0.5, 0.7 ... and entryY=1. An interface that a class implements: the same with dashed=1.
- Composition: style "compose;" from the whole (source, which gets the filled diamond) to the part. Aggregation: the same with startFill=0.
- Association: "edgeStyle=orthogonalEdgeStyle;endArrow=open;", or endArrow=none when it has no direction.
- A multiplicity (1, 0..*) or a role is the edge's value. Give every relation exit and entry points on the sides that face each other, so that no relation runs through a class.

Now call ${draw}. Write no text before the call.`,
}
