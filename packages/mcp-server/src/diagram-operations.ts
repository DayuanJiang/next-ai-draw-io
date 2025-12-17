/**
 * ID-based diagram operations
 * Copied from lib/utils.ts to avoid cross-package imports
 */

export interface DiagramOperation {
    type: "update" | "add" | "delete"
    cell_id: string
    new_xml?: string
}

export interface OperationError {
    type: "update" | "add" | "delete"
    cellId: string
    message: string
}

export interface ApplyOperationsResult {
    result: string
    errors: OperationError[]
}

/**
 * Apply diagram operations (update/add/delete) using ID-based lookup.
 * This replaces the text-matching approach with direct DOM manipulation.
 *
 * @param xmlContent - The full mxfile XML content
 * @param operations - Array of operations to apply
 * @returns Object with result XML and any errors
 */
export function applyDiagramOperations(
    xmlContent: string,
    operations: DiagramOperation[],
): ApplyOperationsResult {
    const errors: OperationError[] = []

    // Parse the XML
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlContent, "text/xml")

    // Check for parse errors
    const parseError = doc.querySelector("parsererror")
    if (parseError) {
        return {
            result: xmlContent,
            errors: [
                {
                    type: "update",
                    cellId: "",
                    message: `XML parse error: ${parseError.textContent}`,
                },
            ],
        }
    }

    // Find the root element (inside mxGraphModel)
    const root = doc.querySelector("root")
    if (!root) {
        return {
            result: xmlContent,
            errors: [
                {
                    type: "update",
                    cellId: "",
                    message: "Could not find <root> element in XML",
                },
            ],
        }
    }

    // Build a map of cell IDs to elements
    const cellMap = new Map<string, Element>()
    root.querySelectorAll("mxCell").forEach((cell) => {
        const id = cell.getAttribute("id")
        if (id) cellMap.set(id, cell)
    })

    // Process each operation
    for (const op of operations) {
        if (op.type === "update") {
            const existingCell = cellMap.get(op.cell_id)
            if (!existingCell) {
                errors.push({
                    type: "update",
                    cellId: op.cell_id,
                    message: `Cell with id="${op.cell_id}" not found`,
                })
                continue
            }

            if (!op.new_xml) {
                errors.push({
                    type: "update",
                    cellId: op.cell_id,
                    message: "new_xml is required for update operation",
                })
                continue
            }

            // Parse the new XML
            const newDoc = parser.parseFromString(
                `<wrapper>${op.new_xml}</wrapper>`,
                "text/xml",
            )
            const newCell = newDoc.querySelector("mxCell")
            if (!newCell) {
                errors.push({
                    type: "update",
                    cellId: op.cell_id,
                    message: "new_xml must contain an mxCell element",
                })
                continue
            }

            // Validate ID matches
            const newCellId = newCell.getAttribute("id")
            if (newCellId !== op.cell_id) {
                errors.push({
                    type: "update",
                    cellId: op.cell_id,
                    message: `ID mismatch: cell_id is "${op.cell_id}" but new_xml has id="${newCellId}"`,
                })
                continue
            }

            // Import and replace the node
            const importedNode = doc.importNode(newCell, true)
            existingCell.parentNode?.replaceChild(importedNode, existingCell)

            // Update the map with the new element
            cellMap.set(op.cell_id, importedNode)
        } else if (op.type === "add") {
            // Check if ID already exists
            if (cellMap.has(op.cell_id)) {
                errors.push({
                    type: "add",
                    cellId: op.cell_id,
                    message: `Cell with id="${op.cell_id}" already exists`,
                })
                continue
            }

            if (!op.new_xml) {
                errors.push({
                    type: "add",
                    cellId: op.cell_id,
                    message: "new_xml is required for add operation",
                })
                continue
            }

            // Parse the new XML
            const newDoc = parser.parseFromString(
                `<wrapper>${op.new_xml}</wrapper>`,
                "text/xml",
            )
            const newCell = newDoc.querySelector("mxCell")
            if (!newCell) {
                errors.push({
                    type: "add",
                    cellId: op.cell_id,
                    message: "new_xml must contain an mxCell element",
                })
                continue
            }

            // Validate ID matches
            const newCellId = newCell.getAttribute("id")
            if (newCellId !== op.cell_id) {
                errors.push({
                    type: "add",
                    cellId: op.cell_id,
                    message: `ID mismatch: cell_id is "${op.cell_id}" but new_xml has id="${newCellId}"`,
                })
                continue
            }

            // Import and append the node
            const importedNode = doc.importNode(newCell, true)
            root.appendChild(importedNode)

            // Add to map
            cellMap.set(op.cell_id, importedNode)
        } else if (op.type === "delete") {
            const existingCell = cellMap.get(op.cell_id)
            if (!existingCell) {
                errors.push({
                    type: "delete",
                    cellId: op.cell_id,
                    message: `Cell with id="${op.cell_id}" not found`,
                })
                continue
            }

            // Check for edges referencing this cell (warning only, still delete)
            const referencingEdges = root.querySelectorAll(
                `mxCell[source="${op.cell_id}"], mxCell[target="${op.cell_id}"]`,
            )
            if (referencingEdges.length > 0) {
                const edgeIds = Array.from(referencingEdges)
                    .map((e) => e.getAttribute("id"))
                    .join(", ")
                console.warn(
                    `[applyDiagramOperations] Deleting cell "${op.cell_id}" which is referenced by edges: ${edgeIds}`,
                )
            }

            // Remove the node
            existingCell.parentNode?.removeChild(existingCell)
            cellMap.delete(op.cell_id)
        }
    }

    // Serialize back to string
    const serializer = new XMLSerializer()
    const result = serializer.serializeToString(doc)

    return { result, errors }
}
