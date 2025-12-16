/**
 * Template Resources
 * Provides diagram templates for common use cases
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

// Get directory path for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const templatesDir = join(__dirname, "../../templates")

// Template metadata
const TEMPLATES: Record<string, { name: string; description: string }> = {
    flowchart: {
        name: "Flowchart",
        description: "Basic flowchart with start/end nodes, process boxes, and decision diamonds",
    },
    "sequence-diagram": {
        name: "Sequence Diagram",
        description: "UML sequence diagram with lifelines and message arrows",
    },
    "er-diagram": {
        name: "ER Diagram",
        description: "Entity-Relationship diagram with entities, attributes, and relationships",
    },
    "aws-architecture": {
        name: "AWS Architecture",
        description: "AWS cloud architecture diagram with common services (EC2, S3, Lambda, etc.)",
    },
    "class-diagram": {
        name: "Class Diagram",
        description: "UML class diagram with classes, attributes, methods, and relationships",
    },
    mindmap: {
        name: "Mind Map",
        description: "Hierarchical mind map for brainstorming and organization",
    },
}

/**
 * Register template resources
 */
export function registerTemplateResources(server: McpServer): void {
    // List all available templates
    server.resource(
        "templates://list",
        "templates://list",
        async (uri) => {
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(
                            Object.entries(TEMPLATES).map(([id, info]) => ({
                                id,
                                name: info.name,
                                description: info.description,
                                uri: `templates://${id}`,
                            })),
                            null,
                            2
                        ),
                    },
                ],
            }
        }
    )

    // Register individual template resources
    for (const [templateId, info] of Object.entries(TEMPLATES)) {
        server.resource(
            `templates://${templateId}`,
            `templates://${templateId}`,
            async (uri) => {
                const templateFile = join(templatesDir, `${templateId}.xml`)

                if (!existsSync(templateFile)) {
                    // Return inline template if file doesn't exist
                    const inlineTemplate = getInlineTemplate(templateId)
                    return {
                        contents: [
                            {
                                uri: uri.href,
                                mimeType: "application/xml",
                                text: inlineTemplate,
                            },
                        ],
                    }
                }

                const xml = readFileSync(templateFile, "utf-8")
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: "application/xml",
                            text: xml,
                        },
                    ],
                }
            }
        )
    }
}

/**
 * Get inline template when file doesn't exist
 */
function getInlineTemplate(templateId: string): string {
    const templates: Record<string, string> = {
        flowchart: `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="2" value="Start" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="140" y="40" width="120" height="40" as="geometry"/>
</mxCell>
<mxCell id="3" value="Process" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="140" y="120" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="4" value="Decision?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
  <mxGeometry x="130" y="220" width="140" height="80" as="geometry"/>
</mxCell>
<mxCell id="5" value="End" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
  <mxGeometry x="140" y="340" width="120" height="40" as="geometry"/>
</mxCell>
<mxCell id="6" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;" edge="1" parent="1" source="2" target="3">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="7" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;" edge="1" parent="1" source="3" target="4">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="8" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;" edge="1" parent="1" source="4" target="5">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`,

        "sequence-diagram": `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="2" value="Client" style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="100" y="40" width="100" height="300" as="geometry"/>
</mxCell>
<mxCell id="3" value="Server" style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="300" y="40" width="100" height="300" as="geometry"/>
</mxCell>
<mxCell id="4" value="Database" style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="500" y="40" width="100" height="300" as="geometry"/>
</mxCell>
<mxCell id="5" value="Request" style="html=1;verticalAlign=bottom;endArrow=block;entryX=0;entryY=0;" edge="1" parent="1" source="2" target="3">
  <mxGeometry relative="1" as="geometry"><mxPoint x="150" y="120" as="sourcePoint"/></mxGeometry>
</mxCell>
<mxCell id="6" value="Query" style="html=1;verticalAlign=bottom;endArrow=block;entryX=0;entryY=0;" edge="1" parent="1" source="3" target="4">
  <mxGeometry relative="1" as="geometry"><mxPoint x="350" y="160" as="sourcePoint"/></mxGeometry>
</mxCell>
<mxCell id="7" value="Result" style="html=1;verticalAlign=bottom;endArrow=open;dashed=1;entryX=1;entryY=0;" edge="1" parent="1" source="4" target="3">
  <mxGeometry relative="1" as="geometry"><mxPoint x="550" y="200" as="sourcePoint"/></mxGeometry>
</mxCell>
<mxCell id="8" value="Response" style="html=1;verticalAlign=bottom;endArrow=open;dashed=1;entryX=1;entryY=0;" edge="1" parent="1" source="3" target="2">
  <mxGeometry relative="1" as="geometry"><mxPoint x="350" y="240" as="sourcePoint"/></mxGeometry>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`,

        "er-diagram": `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="2" value="User" style="swimlane;fontStyle=1;html=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="160" height="140" as="geometry"/>
</mxCell>
<mxCell id="3" value="id (PK)&#xa;username&#xa;email&#xa;created_at" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="2">
  <mxGeometry y="26" width="160" height="114" as="geometry"/>
</mxCell>
<mxCell id="4" value="Order" style="swimlane;fontStyle=1;html=1;" vertex="1" parent="1">
  <mxGeometry x="280" y="40" width="160" height="140" as="geometry"/>
</mxCell>
<mxCell id="5" value="id (PK)&#xa;user_id (FK)&#xa;total&#xa;status" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="4">
  <mxGeometry y="26" width="160" height="114" as="geometry"/>
</mxCell>
<mxCell id="6" value="Product" style="swimlane;fontStyle=1;html=1;" vertex="1" parent="1">
  <mxGeometry x="520" y="40" width="160" height="140" as="geometry"/>
</mxCell>
<mxCell id="7" value="id (PK)&#xa;name&#xa;price&#xa;description" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="6">
  <mxGeometry y="26" width="160" height="114" as="geometry"/>
</mxCell>
<mxCell id="8" value="1" style="endArrow=none;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="2" target="4">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="9" value="n" style="edgeLabel;html=1;align=center;verticalAlign=middle;" vertex="1" connectable="0" parent="8">
  <mxGeometry x="0.8" relative="1" as="geometry"><mxPoint x="-10" as="offset"/></mxGeometry>
</mxCell>
<mxCell id="10" value="n" style="endArrow=none;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="4" target="6">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="11" value="n" style="edgeLabel;html=1;align=center;verticalAlign=middle;" vertex="1" connectable="0" parent="10">
  <mxGeometry x="0.8" relative="1" as="geometry"><mxPoint x="-10" as="offset"/></mxGeometry>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`,

        "aws-architecture": `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="2" value="VPC" style="points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#248814;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontColor=#AAB7B8;dashed=0;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="600" height="400" as="geometry"/>
</mxCell>
<mxCell id="3" value="Public Subnet" style="points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#248814;fillColor=#E9F3E6;verticalAlign=top;align=left;spacingLeft=30;fontColor=#248814;dashed=0;" vertex="1" parent="2">
  <mxGeometry x="40" y="80" width="240" height="280" as="geometry"/>
</mxCell>
<mxCell id="4" value="Private Subnet" style="points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group;grStroke=0;strokeColor=#147EBA;fillColor=#E6F2F8;verticalAlign=top;align=left;spacingLeft=30;fontColor=#147EBA;dashed=0;" vertex="1" parent="2">
  <mxGeometry x="320" y="80" width="240" height="280" as="geometry"/>
</mxCell>
<mxCell id="5" value="EC2" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F78E04;gradientDirection=north;fillColor=#D05C17;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;" vertex="1" parent="3">
  <mxGeometry x="80" y="100" width="78" height="78" as="geometry"/>
</mxCell>
<mxCell id="6" value="Lambda" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#F78E04;gradientDirection=north;fillColor=#D05C17;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;" vertex="1" parent="4">
  <mxGeometry x="80" y="40" width="78" height="78" as="geometry"/>
</mxCell>
<mxCell id="7" value="RDS" style="sketch=0;points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];outlineConnect=0;fontColor=#232F3E;gradientColor=#4D72F3;gradientDirection=north;fillColor=#3334B9;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;" vertex="1" parent="4">
  <mxGeometry x="80" y="160" width="78" height="78" as="geometry"/>
</mxCell>
<mxCell id="8" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;" edge="1" parent="2" source="5" target="6">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="9" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;" edge="1" parent="2" source="6" target="7">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`,

        "class-diagram": `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="2" value="&lt;&lt;abstract&gt;&gt;&#xa;Animal" style="swimlane;fontStyle=3;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=40;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;" vertex="1" parent="1">
  <mxGeometry x="200" y="40" width="160" height="120" as="geometry"/>
</mxCell>
<mxCell id="3" value="- name: string&#xa;- age: int" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="2">
  <mxGeometry y="40" width="160" height="40" as="geometry"/>
</mxCell>
<mxCell id="4" value="+ makeSound(): void&#xa;+ move(): void" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="2">
  <mxGeometry y="80" width="160" height="40" as="geometry"/>
</mxCell>
<mxCell id="5" value="Dog" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;" vertex="1" parent="1">
  <mxGeometry x="60" y="240" width="160" height="100" as="geometry"/>
</mxCell>
<mxCell id="6" value="- breed: string" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="5">
  <mxGeometry y="26" width="160" height="34" as="geometry"/>
</mxCell>
<mxCell id="7" value="+ bark(): void&#xa;+ fetch(): void" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="5">
  <mxGeometry y="60" width="160" height="40" as="geometry"/>
</mxCell>
<mxCell id="8" value="Cat" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;" vertex="1" parent="1">
  <mxGeometry x="340" y="240" width="160" height="100" as="geometry"/>
</mxCell>
<mxCell id="9" value="- indoor: boolean" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="8">
  <mxGeometry y="26" width="160" height="34" as="geometry"/>
</mxCell>
<mxCell id="10" value="+ meow(): void&#xa;+ purr(): void" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;" vertex="1" parent="8">
  <mxGeometry y="60" width="160" height="40" as="geometry"/>
</mxCell>
<mxCell id="11" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=0;endSize=12;" edge="1" parent="1" source="5" target="2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="12" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=0;endSize=12;" edge="1" parent="1" source="8" target="2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`,

        mindmap: `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="2" value="Main Topic" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;fontSize=14;" vertex="1" parent="1">
  <mxGeometry x="240" y="160" width="120" height="120" as="geometry"/>
</mxCell>
<mxCell id="3" value="Branch 1" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="100" height="60" as="geometry"/>
</mxCell>
<mxCell id="4" value="Branch 2" style="ellipse;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="1">
  <mxGeometry x="440" y="40" width="100" height="60" as="geometry"/>
</mxCell>
<mxCell id="5" value="Branch 3" style="ellipse;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
  <mxGeometry x="40" y="340" width="100" height="60" as="geometry"/>
</mxCell>
<mxCell id="6" value="Branch 4" style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
  <mxGeometry x="440" y="340" width="100" height="60" as="geometry"/>
</mxCell>
<mxCell id="7" style="edgeStyle=none;rounded=1;html=1;endArrow=none;curved=1;strokeWidth=2;" edge="1" parent="1" source="2" target="3">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="8" style="edgeStyle=none;rounded=1;html=1;endArrow=none;curved=1;strokeWidth=2;" edge="1" parent="1" source="2" target="4">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="9" style="edgeStyle=none;rounded=1;html=1;endArrow=none;curved=1;strokeWidth=2;" edge="1" parent="1" source="2" target="5">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="10" style="edgeStyle=none;rounded=1;html=1;endArrow=none;curved=1;strokeWidth=2;" edge="1" parent="1" source="2" target="6">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`,
    }

    return templates[templateId] || templates.flowchart
}
