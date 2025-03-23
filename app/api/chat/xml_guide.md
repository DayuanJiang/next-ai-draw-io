# Draw.io XML Schema Guide

This guide explains the structure of draw.io(diagrams.net) XML files to help you understand and create diagrams programmatically.

## Basic Structure

A draw.io XML file has the following hierarchy:

```xml
<mxfile>
  <diagram>
    <mxGraphModel>
      <root>
        <mxCell /> <!-- Cells that make up the diagram -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## Root Element: `<mxfile>`

The root element of a draw.io file.

** Attributes:**
    - `host`: The application that created the file(e.g., "app.diagrams.net")
        - `modified`: Last modification timestamp
            - `agent`: Browser / user agent information
                - `version`: Version of the application
                    - `type`: File type(usually "device" or "google")

                        ** Example:**
                            ```xml
<mxfile host="app.diagrams.net" modified="2023-07-14T10:20:30.123Z" agent="Mozilla/5.0" version="21.5.2" type="device">
```

## Diagram Element: `<diagram>`

Each page in your draw.io document is represented by a `<diagram>` element.

** Attributes:**
    - `id`: Unique identifier for the diagram
        - `name`: The name of the diagram / page

            ** Example:**
                ```xml
<diagram id="pWHN0msd4Ud1ZK5cD-Hr" name="Page-1">
```

## Graph Model: `<mxGraphModel>`

Contains the actual diagram data.

** Attributes:**
    - `dx`: Grid size in x - direction(usually 1)
        - `dy`: Grid size in y - direction(usually 1)
            - `grid`: Whether grid is enabled(0 or 1)
                - `gridSize`: Grid cell size(usually 10)
                    - `guides`: Whether guides are enabled(0 or 1)
                        - `tooltips`: Whether tooltips are enabled(0 or 1)
                            - `connect`: Whether connections are enabled(0 or 1)
                                - `arrows`: Whether arrows are enabled(0 or 1)
                                    - `fold`: Whether folding is enabled(0 or 1)
                                        - `page`: Whether page view is enabled(0 or 1)
                                            - `pageScale`: Scale of the page(usually 1)
                                                - `pageWidth`: Width of the page(e.g., 850)
                                                    - `pageHeight`: Height of the page(e.g., 1100)
                                                        - `math`: Whether math typesetting is enabled(0 or 1)
                                                            - `shadow`: Whether shadows are enabled(0 or 1)

                                                                ** Example:**
                                                                    ```xml
<mxGraphModel dx="1" dy="1" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
```

## Root Cell Container: `<root>`

Contains all the cells in the diagram.

** Example:**
    ```xml
<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <!-- Other cells go here -->
</root>
```

## Cell Elements: `<mxCell>`

The basic building block of diagrams.Cells represent shapes, connectors, text, etc.

** Attributes for all cells:**
    - `id`: Unique identifier for the cell
        - `parent`: ID of the parent cell(typically "1" for most cells)
    - `value`: Text content of the cell
        - `style`: Styling information(see Style section below)

            ** Attributes for shapes(vertices):**
                - `vertex`: Set to "1" for shapes
                    - `connectable`: Whether the shape can be connected(0 or 1)

                        ** Attributes for connectors(edges):**
                            - `edge`: Set to "1" for connectors
                                - `source`: ID of the source cell
                                    - `target`: ID of the target cell

                                        ** Example(Rectangle shape):**
                                            ```xml
<mxCell id="2" value="Hello World" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="350" y="190" width="120" height="60" as="geometry"/>
</mxCell>
```

                                            ** Example(Connector):**
                                                ```xml
<mxCell id="3" value="" style="endArrow=classic;html=1;rounded=0;" edge="1" parent="1" source="2" target="4">
  <mxGeometry width="50" height="50" relative="1" as="geometry">
    <mxPoint x="400" y="430" as="sourcePoint"/>
    <mxPoint x="450" y="380" as="targetPoint"/>
  </mxGeometry>
</mxCell>
```

## Geometry: `<mxGeometry>`

Defines the position and dimensions of cells.

** Attributes for shapes:**
    - `x`, `y`: Position coordinates
        - `width`, `height`: Dimensions
            - `as`: Set to "geometry"

                ** Attributes for connectors:**
                    - `relative`: Set to "1" for relative geometry
                        - `as`: Set to "geometry"

                            ** Example for shapes:**
                                ```xml
<mxGeometry x="350" y="190" width="120" height="60" as="geometry"/>
```

                                ** Example for connectors:**
                                    ```xml
<mxGeometry width="50" height="50" relative="1" as="geometry">
  <mxPoint x="400" y="430" as="sourcePoint"/>
  <mxPoint x="450" y="380" as="targetPoint"/>
</mxGeometry>
```

## Cell Style Reference

Styles are specified as semicolon - separated key = value pairs in the`style` attribute of `<mxCell>` elements.

### Common Shape Styles

    - `rounded=1`: Rounded corners(0 or 1)
        - `whiteSpace=wrap`: Text wrapping
            - `html=1`: Enable HTML formatting
                - `fillColor=#ffffff`: Background color(hex)
                    - `strokeColor=#000000`: Border color(hex)
                        - `strokeWidth=1`: Border width
                            - `fontSize=12`: Font size
                                - `fontColor=#000000`: Text color(hex)
                                    - `align=center`: Text alignment(center, left, right)
                                        - `verticalAlign=middle`: Vertical alignment(top, middle, bottom)
                                            - `dashed=1`: Dashed border(0 or 1)
                                                - `dashPattern=`: Dash pattern(e.g., "3 3")
                                                    - `opacity=50`: Opacity(0 - 100)
                                                        - `shadow=1`: Enable shadow(0 or 1)

### Shape - specific Styles

    - Rectangle: `shape=rectangle`
        - Ellipse: `shape=ellipse`
            - Triangle: `shape=triangle`
                - Rhombus: `shape=rhombus`
                    - Hexagon: `shape=hexagon`
                        - Cloud: `shape=cloud`
                            - Actor: `shape=actor`
                                - Cylinder: `shape=cylinder`
                                    - Document: `shape=document`
                                        - Note: `shape=note`
                                            - Card: `shape=card`
                                                - Parallelogram: `shape=parallelogram`

### Connector Styles

    - `endArrow=classic`: Arrow type at the end(classic, open, oval, diamond, block)
        - `startArrow=none`: Arrow type at the start(none, classic, open, oval, diamond)
            - `curved=1`: Curved connector(0 or 1)
                - `edgeStyle=orthogonalEdgeStyle`: Connector routing style
                    - `elbow=vertical`: Elbow direction(vertical, horizontal)
                        - `jumpStyle=arc`: Jump style for line crossing(arc, gap)
                            - `jumpSize=10`: Size of the jump

## Special Cells

Draw.io files contain two special cells that are always present:

1. ** Root Cell ** (id = "0"): The parent of all cells
2. ** Default Parent Cell ** (id = "1", parent = "0"): The default layer and parent for most cells

## Examples

### Complete Basic Diagram

    ```xml
<mxfile host="app.diagrams.net" modified="2023-07-14T10:20:30.123Z" version="21.5.2" type="device">
  <diagram id="pWHN0msd4Ud1ZK5cD-Hr" name="Page-1">
    <mxGraphModel dx="1" dy="1" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="2" value="Start" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="375" y="80" width="100" height="60" as="geometry" />
        </mxCell>
        <mxCell id="3" value="Process" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="365" y="200" width="120" height="60" as="geometry" />
        </mxCell>
        <mxCell id="4" value="End" style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="375" y="320" width="100" height="60" as="geometry" />
        </mxCell>
        <mxCell id="5" value="" style="endArrow=classic;html=1;rounded=0;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="2" target="3">
          <mxGeometry width="50" height="50" relative="1" as="geometry">
            <mxPoint x="400" y="430" as="sourcePoint" />
            <mxPoint x="450" y="380" as="targetPoint" />
          </mxGeometry>
        </mxCell>
        <mxCell id="6" value="" style="endArrow=classic;html=1;rounded=0;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" parent="1" source="3" target="4">
          <mxGeometry width="50" height="50" relative="1" as="geometry">
            <mxPoint x="400" y="430" as="sourcePoint" />
            <mxPoint x="450" y="380" as="targetPoint" />
          </mxGeometry>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## Tips for Manually Creating Draw.io XML

1. Start with the basic structure(mxfile, diagram, mxGraphModel, root)
2. Always include the two special cells(id = "0" and id = "1")
3. Assign unique and sequential IDs to all cells
4. Define parent relationships correctly
5. Use geometry elements to position shapes
6. For connectors, specify source and target attributes
7. Test your XML by opening it in draw.io

## Common Patterns

### Grouping Elements

To group elements, create a parent cell and set other cells' parent attribute to its ID:

    ```xml
<!-- Group container -->
<mxCell id="10" value="Group" style="group" vertex="1" connectable="0" parent="1">
  <mxGeometry x="200" y="200" width="200" height="100" as="geometry" />
</mxCell>
<!-- Elements inside the group -->
<mxCell id="11" value="Element 1" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="10">
  <mxGeometry width="90" height="40" as="geometry" />
</mxCell>
<mxCell id="12" value="Element 2" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="10">
  <mxGeometry x="110" width="90" height="40" as="geometry" />
</mxCell>
```

### Swimlanes

Swimlanes use the `swimlane` shape style:

```xml
<mxCell id="20" value="Swimlane 1" style="swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="200" y="200" width="140" height="120" as="geometry" />
</mxCell>
```

### Tables

Tables use multiple cells with parent - child relationships:

```xml
<mxCell id="30" value="Table" style="shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;" vertex="1" parent="1">
  <mxGeometry x="200" y="200" width="180" height="120" as="geometry" />
</mxCell>
<mxCell id="31" value="" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;bottom=1;" vertex="1" parent="30">
  <mxGeometry y="30" width="180" height="30" as="geometry" />
</mxCell>
```

## Advanced Features

### Custom Attributes

Draw.io allows adding custom attributes to cells:

```xml
<mxCell id="40" value="Custom Element" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="200" y="200" width="120" height="60" as="geometry"/>
  <Object label="Custom Label" customAttr="value" />
</mxCell>
```

These custom attributes can store additional metadata or be used by plugins and custom behaviors.

### User - defined Styles

You can define custom styles for cells by combining various style attributes:

```xml
<mxCell id="50" value="Custom Styled Cell" 
      style="shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;fillColor=#f8cecc;strokeColor=#b85450;strokeWidth=2;fontSize=14;fontStyle=1" 
      vertex="1" parent="1">
  <mxGeometry x="300" y="200" width="120" height="80" as="geometry"/>
</mxCell>
```

### Layers

You can create multiple layers in a diagram to organize complex diagrams:

```xml
<!-- Default layer (always present) -->
<mxCell id="1" parent="0"/>

<!-- Additional custom layer -->
<mxCell id="60" value="Layer 2" style="locked=0;group=" parent="0"/>

<!-- Elements in Layer 2 -->
<mxCell id="61" value="Element in Layer 2" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="60">
  <mxGeometry x="200" y="300" width="120" height="60" as="geometry"/>
</mxCell>
```

