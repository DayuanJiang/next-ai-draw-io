/**
 * Style Reference Resource
 * Provides draw.io style property documentation
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

// Style reference documentation
const STYLE_REFERENCE = {
    shapes: {
        rectangle: {
            style: "rounded=0;whiteSpace=wrap;html=1;",
            description: "Basic rectangle shape",
        },
        roundedRect: {
            style: "rounded=1;whiteSpace=wrap;html=1;",
            description: "Rectangle with rounded corners",
        },
        ellipse: {
            style: "ellipse;whiteSpace=wrap;html=1;",
            description: "Ellipse/oval shape",
        },
        circle: {
            style: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;",
            description: "Circle (fixed aspect ratio ellipse)",
        },
        diamond: {
            style: "rhombus;whiteSpace=wrap;html=1;",
            description: "Diamond/rhombus shape (decision nodes)",
        },
        cylinder: {
            style: "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;",
            description: "Cylinder shape (databases)",
        },
        hexagon: {
            style: "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;",
            description: "Hexagon shape",
        },
        parallelogram: {
            style: "shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;",
            description: "Parallelogram shape (data I/O)",
        },
        actor: {
            style: "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;",
            description: "UML actor (stick figure)",
        },
        swimlane: {
            style: "swimlane;horizontal=0;startSize=20;",
            description: "Swimlane container for grouping",
        },
        cloud: {
            style: "ellipse;shape=cloud;whiteSpace=wrap;html=1;",
            description: "Cloud shape",
        },
        document: {
            style: "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;",
            description: "Document shape (wavy bottom)",
        },
    },
    edges: {
        basicArrow: {
            style: "endArrow=classic;html=1;",
            description: "Simple arrow connector",
        },
        dashedArrow: {
            style: "dashed=1;endArrow=classic;html=1;",
            description: "Dashed line with arrow",
        },
        bidirectional: {
            style: "endArrow=classic;startArrow=classic;html=1;",
            description: "Arrow on both ends",
        },
        orthogonal: {
            style: "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;",
            description: "Right-angle connector",
        },
        curved: {
            style: "curved=1;endArrow=classic;html=1;",
            description: "Curved connector",
        },
        openArrow: {
            style: "endArrow=open;html=1;",
            description: "Open (unfilled) arrow",
        },
        blockArrow: {
            style: "endArrow=block;html=1;",
            description: "Block arrow",
        },
        inheritanceArrow: {
            style: "endArrow=block;endFill=0;html=1;",
            description: "Empty triangle (UML inheritance)",
        },
        compositionArrow: {
            style: "endArrow=diamondThin;endFill=1;html=1;",
            description: "Filled diamond (UML composition)",
        },
        aggregationArrow: {
            style: "endArrow=diamondThin;endFill=0;html=1;",
            description: "Empty diamond (UML aggregation)",
        },
    },
    colors: {
        fill: {
            property: "fillColor=#hex",
            description: "Background fill color",
            examples: ["fillColor=#dae8fc", "fillColor=#d5e8d4", "fillColor=#ffe6cc"],
        },
        stroke: {
            property: "strokeColor=#hex",
            description: "Border/outline color",
            examples: ["strokeColor=#6c8ebf", "strokeColor=#82b366", "strokeColor=#d79b00"],
        },
        font: {
            property: "fontColor=#hex",
            description: "Text color",
            examples: ["fontColor=#000000", "fontColor=#333333"],
        },
        gradient: {
            property: "gradientColor=#hex;gradientDirection=south",
            description: "Gradient fill effect",
            directions: ["south", "north", "east", "west"],
        },
    },
    text: {
        bold: {
            property: "fontStyle=1",
            description: "Bold text",
        },
        italic: {
            property: "fontStyle=2",
            description: "Italic text",
        },
        boldItalic: {
            property: "fontStyle=3",
            description: "Bold and italic text",
        },
        underline: {
            property: "fontStyle=4",
            description: "Underlined text",
        },
        fontSize: {
            property: "fontSize=14",
            description: "Font size in points",
        },
        align: {
            property: "align=center",
            description: "Horizontal alignment",
            options: ["left", "center", "right"],
        },
        verticalAlign: {
            property: "verticalAlign=middle",
            description: "Vertical alignment",
            options: ["top", "middle", "bottom"],
        },
    },
    layout: {
        whiteSpace: {
            property: "whiteSpace=wrap",
            description: "Enable text wrapping",
        },
        html: {
            property: "html=1",
            description: "Enable HTML formatting in labels",
        },
        aspect: {
            property: "aspect=fixed",
            description: "Maintain aspect ratio when resizing",
        },
        container: {
            property: "container=1",
            description: "Mark shape as a container for grouping",
        },
        collapsible: {
            property: "collapsible=1",
            description: "Allow container to be collapsed",
        },
    },
    edgeRouting: {
        exitX: {
            property: "exitX=0-1",
            description: "Exit point X position (0=left, 0.5=center, 1=right)",
        },
        exitY: {
            property: "exitY=0-1",
            description: "Exit point Y position (0=top, 0.5=middle, 1=bottom)",
        },
        entryX: {
            property: "entryX=0-1",
            description: "Entry point X position",
        },
        entryY: {
            property: "entryY=0-1",
            description: "Entry point Y position",
        },
        waypoints: {
            syntax: "<Array as=\"points\"><mxPoint x=\"x\" y=\"y\"/></Array>",
            description: "Intermediate routing points for edges",
        },
    },
    commonPresets: {
        defaultBox: "rounded=0;whiteSpace=wrap;html=1;",
        roundedBox: "rounded=1;whiteSpace=wrap;html=1;",
        blueBox: "rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;",
        greenBox: "rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;",
        orangeBox: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;",
        redBox: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;",
        purpleBox: "rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;",
        grayBox: "rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;",
        decisionDiamond: "rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;",
        startEnd: "rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;",
    },
}

/**
 * Register style reference resource
 */
export function registerStyleResource(server: McpServer): void {
    server.resource(
        "reference://styles",
        "reference://styles",
        async (uri) => {
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(STYLE_REFERENCE, null, 2),
                    },
                ],
            }
        }
    )
}
