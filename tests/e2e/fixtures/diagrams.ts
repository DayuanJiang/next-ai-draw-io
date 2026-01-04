/**
 * Shared XML diagram fixtures for E2E tests
 */

// Simple cat diagram
export const CAT_DIAGRAM_XML = `<mxCell id="cat-head" value="Cat Head" style="ellipse;whiteSpace=wrap;html=1;fillColor=#FFE4B5;" vertex="1" parent="1">
  <mxGeometry x="200" y="100" width="100" height="80" as="geometry"/>
</mxCell>
<mxCell id="cat-body" value="Cat Body" style="ellipse;whiteSpace=wrap;html=1;fillColor=#FFE4B5;" vertex="1" parent="1">
  <mxGeometry x="180" y="180" width="140" height="100" as="geometry"/>
</mxCell>`

// Simple flowchart
export const FLOWCHART_XML = `<mxCell id="start" value="Start" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;" vertex="1" parent="1">
  <mxGeometry x="200" y="50" width="100" height="40" as="geometry"/>
</mxCell>
<mxCell id="process" value="Process" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1">
  <mxGeometry x="200" y="130" width="100" height="40" as="geometry"/>
</mxCell>
<mxCell id="end" value="End" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;" vertex="1" parent="1">
  <mxGeometry x="200" y="210" width="100" height="40" as="geometry"/>
</mxCell>`

// Simple single box
export const SINGLE_BOX_XML = `<mxCell id="box" value="Test Box" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>`

// Test node for iframe interaction tests
export const TEST_NODE_XML = `<mxCell id="test-node-123" value="Test Node" style="rounded=1;fillColor=#d5e8d4;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>`

// Architecture box
export const ARCHITECTURE_XML = `<mxCell id="arch" value="Architecture" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="50" as="geometry"/>
</mxCell>`

// New node for append tests
export const NEW_NODE_XML = `<mxCell id="new-node" value="New Node" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1">
  <mxGeometry x="350" y="130" width="100" height="40" as="geometry"/>
</mxCell>`

// Truncated XML for error tests
export const TRUNCATED_XML = `<mxCell id="node1" value="Start" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="100" height="40"`

// Simple boxes for multi-turn tests
export const createBoxXml = (id: string, label: string, y = 100) =>
    `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="${y}" width="100" height="40" as="geometry"/></mxCell>`
