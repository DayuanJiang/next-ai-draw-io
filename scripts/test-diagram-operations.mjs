/**
 * Simple test script for applyDiagramOperations function
 * Run with: node scripts/test-diagram-operations.mjs
 */

import { JSDOM } from "jsdom"

// Set up DOMParser for Node.js environment
const dom = new JSDOM()
globalThis.DOMParser = dom.window.DOMParser
globalThis.XMLSerializer = dom.window.XMLSerializer

// Import the function (we'll inline it since it's not ESM exported)
function applyDiagramOperations(xmlContent, operations) {
    const errors = []
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlContent, "text/xml")

    const parseError = doc.querySelector("parsererror")
    if (parseError) {
        return {
            result: xmlContent,
            errors: [
                {
                    operation: "update",
                    cellId: "",
                    message: `XML parse error: ${parseError.textContent}`,
                },
            ],
        }
    }

    const root = doc.querySelector("root")
    if (!root) {
        return {
            result: xmlContent,
            errors: [
                {
                    operation: "update",
                    cellId: "",
                    message: "Could not find <root> element in XML",
                },
            ],
        }
    }

    const cellMap = new Map()
    root.querySelectorAll("mxCell").forEach((cell) => {
        const id = cell.getAttribute("id")
        if (id) cellMap.set(id, cell)
    })

    for (const op of operations) {
        if (op.operation === "update") {
            const existingCell = cellMap.get(op.cell_id)
            if (!existingCell) {
                errors.push({
                    operation: "update",
                    cellId: op.cell_id,
                    message: `Cell with id="${op.cell_id}" not found`,
                })
                continue
            }
            if (!op.new_xml) {
                errors.push({
                    operation: "update",
                    cellId: op.cell_id,
                    message: "new_xml is required for update operation",
                })
                continue
            }
            const newDoc = parser.parseFromString(
                `<wrapper>${op.new_xml}</wrapper>`,
                "text/xml",
            )
            const newCell = newDoc.querySelector("mxCell")
            if (!newCell) {
                errors.push({
                    operation: "update",
                    cellId: op.cell_id,
                    message: "new_xml must contain an mxCell element",
                })
                continue
            }
            const newCellId = newCell.getAttribute("id")
            if (newCellId !== op.cell_id) {
                errors.push({
                    operation: "update",
                    cellId: op.cell_id,
                    message: `ID mismatch: cell_id is "${op.cell_id}" but new_xml has id="${newCellId}"`,
                })
                continue
            }
            const importedNode = doc.importNode(newCell, true)
            existingCell.parentNode?.replaceChild(importedNode, existingCell)
            cellMap.set(op.cell_id, importedNode)
        } else if (op.operation === "add") {
            if (cellMap.has(op.cell_id)) {
                errors.push({
                    operation: "add",
                    cellId: op.cell_id,
                    message: `Cell with id="${op.cell_id}" already exists`,
                })
                continue
            }
            if (!op.new_xml) {
                errors.push({
                    operation: "add",
                    cellId: op.cell_id,
                    message: "new_xml is required for add operation",
                })
                continue
            }
            const newDoc = parser.parseFromString(
                `<wrapper>${op.new_xml}</wrapper>`,
                "text/xml",
            )
            const newCell = newDoc.querySelector("mxCell")
            if (!newCell) {
                errors.push({
                    operation: "add",
                    cellId: op.cell_id,
                    message: "new_xml must contain an mxCell element",
                })
                continue
            }
            const newCellId = newCell.getAttribute("id")
            if (newCellId !== op.cell_id) {
                errors.push({
                    operation: "add",
                    cellId: op.cell_id,
                    message: `ID mismatch: cell_id is "${op.cell_id}" but new_xml has id="${newCellId}"`,
                })
                continue
            }
            const importedNode = doc.importNode(newCell, true)
            root.appendChild(importedNode)
            cellMap.set(op.cell_id, importedNode)
        } else if (op.operation === "delete") {
            const existingCell = cellMap.get(op.cell_id)
            if (!existingCell) {
                errors.push({
                    operation: "delete",
                    cellId: op.cell_id,
                    message: `Cell with id="${op.cell_id}" not found`,
                })
                continue
            }
            existingCell.parentNode?.removeChild(existingCell)
            cellMap.delete(op.cell_id)
        }
    }

    const serializer = new XMLSerializer()
    const result = serializer.serializeToString(doc)
    return { result, errors }
}

// Test data
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile>
  <diagram>
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Box A" style="rounded=1;" vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="Box B" style="rounded=1;" vertex="1" parent="1">
          <mxGeometry x="300" y="100" width="120" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="4" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="2" target="3">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`

let passed = 0
let failed = 0

function test(name, fn) {
    try {
        fn()
        console.log(`✓ ${name}`)
        passed++
    } catch (e) {
        console.log(`✗ ${name}`)
        console.log(`  Error: ${e.message}`)
        failed++
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed")
}

// Tests
test("Update operation changes cell value", () => {
    const { result, errors } = applyDiagramOperations(sampleXml, [
        {
            operation: "update",
            cell_id: "2",
            new_xml:
                '<mxCell id="2" value="Updated Box A" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="60" as="geometry"/></mxCell>',
        },
    ])
    assert(
        errors.length === 0,
        `Expected no errors, got: ${JSON.stringify(errors)}`,
    )
    assert(
        result.includes('value="Updated Box A"'),
        "Updated value should be in result",
    )
    assert(
        !result.includes('value="Box A"'),
        "Old value should not be in result",
    )
})

test("Update operation fails for non-existent cell", () => {
    const { errors } = applyDiagramOperations(sampleXml, [
        {
            operation: "update",
            cell_id: "999",
            new_xml: '<mxCell id="999" value="Test"/>',
        },
    ])
    assert(errors.length === 1, "Should have one error")
    assert(
        errors[0].message.includes("not found"),
        "Error should mention not found",
    )
})

test("Update operation fails on ID mismatch", () => {
    const { errors } = applyDiagramOperations(sampleXml, [
        {
            operation: "update",
            cell_id: "2",
            new_xml: '<mxCell id="WRONG" value="Test"/>',
        },
    ])
    assert(errors.length === 1, "Should have one error")
    assert(
        errors[0].message.includes("ID mismatch"),
        "Error should mention ID mismatch",
    )
})

test("Add operation creates new cell", () => {
    const { result, errors } = applyDiagramOperations(sampleXml, [
        {
            operation: "add",
            cell_id: "new1",
            new_xml:
                '<mxCell id="new1" value="New Box" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="500" y="100" width="120" height="60" as="geometry"/></mxCell>',
        },
    ])
    assert(
        errors.length === 0,
        `Expected no errors, got: ${JSON.stringify(errors)}`,
    )
    assert(result.includes('id="new1"'), "New cell should be in result")
    assert(
        result.includes('value="New Box"'),
        "New cell value should be in result",
    )
})

test("Add operation fails for duplicate ID", () => {
    const { errors } = applyDiagramOperations(sampleXml, [
        {
            operation: "add",
            cell_id: "2",
            new_xml: '<mxCell id="2" value="Duplicate"/>',
        },
    ])
    assert(errors.length === 1, "Should have one error")
    assert(
        errors[0].message.includes("already exists"),
        "Error should mention already exists",
    )
})

test("Add operation fails on ID mismatch", () => {
    const { errors } = applyDiagramOperations(sampleXml, [
        {
            operation: "add",
            cell_id: "new1",
            new_xml: '<mxCell id="WRONG" value="Test"/>',
        },
    ])
    assert(errors.length === 1, "Should have one error")
    assert(
        errors[0].message.includes("ID mismatch"),
        "Error should mention ID mismatch",
    )
})

test("Delete operation removes cell", () => {
    const { result, errors } = applyDiagramOperations(sampleXml, [
        { operation: "delete", cell_id: "3" },
    ])
    assert(
        errors.length === 0,
        `Expected no errors, got: ${JSON.stringify(errors)}`,
    )
    assert(!result.includes('id="3"'), "Deleted cell should not be in result")
    assert(result.includes('id="2"'), "Other cells should remain")
})

test("Delete operation fails for non-existent cell", () => {
    const { errors } = applyDiagramOperations(sampleXml, [
        { operation: "delete", cell_id: "999" },
    ])
    assert(errors.length === 1, "Should have one error")
    assert(
        errors[0].message.includes("not found"),
        "Error should mention not found",
    )
})

test("Multiple operations in sequence", () => {
    const { result, errors } = applyDiagramOperations(sampleXml, [
        {
            operation: "update",
            cell_id: "2",
            new_xml:
                '<mxCell id="2" value="Updated" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="60" as="geometry"/></mxCell>',
        },
        {
            operation: "add",
            cell_id: "new1",
            new_xml:
                '<mxCell id="new1" value="Added" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="500" y="100" width="120" height="60" as="geometry"/></mxCell>',
        },
        { operation: "delete", cell_id: "3" },
    ])
    assert(
        errors.length === 0,
        `Expected no errors, got: ${JSON.stringify(errors)}`,
    )
    assert(
        result.includes('value="Updated"'),
        "Updated value should be present",
    )
    assert(result.includes('id="new1"'), "Added cell should be present")
    assert(!result.includes('id="3"'), "Deleted cell should not be present")
})

test("Invalid XML returns parse error", () => {
    const { errors } = applyDiagramOperations("<not valid xml", [
        { operation: "delete", cell_id: "1" },
    ])
    assert(errors.length === 1, "Should have one error")
})

test("Missing root element returns error", () => {
    const { errors } = applyDiagramOperations("<mxfile></mxfile>", [
        { operation: "delete", cell_id: "1" },
    ])
    assert(errors.length === 1, "Should have one error")
    assert(
        errors[0].message.includes("root"),
        "Error should mention root element",
    )
})

// Summary
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
