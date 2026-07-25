/**
 * ID-based diagram operations
 *
 * The xmlContent argument may be either a bare <mxGraphModel> (legacy) or a
 * full <mxfile> with one or more <diagram> pages. For mxfile inputs, an
 * optional pageSelector identifies which page to edit; when omitted, the
 * first page is targeted (the "active page by convention" — see pages.ts).
 */

import { findPageElement, hasPageSelector, type PageSelector } from "./pages.js"

export interface DiagramOperation {
    operation: "update" | "add" | "delete"
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
 *
 * @param xmlContent - The diagram XML. May be either a bare <mxGraphModel> or
 *                     a full <mxfile> with one or more <diagram> children.
 * @param operations - Array of operations to apply.
 * @param pageSelector - Optional page selector for multi-page docs. Defaults
 *                       to the first page.
 * @returns Object with result XML (same shape as input) and any per-op errors.
 */
export function applyDiagramOperations(
    xmlContent: string,
    operations: DiagramOperation[],
    pageSelector?: PageSelector,
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

    // Locate the <root> element to operate on.
    //
    // - For <mxfile> input: resolve the page via pageSelector, then dive into
    //   its <root>. This scopes querySelectorAll calls below to one page so
    //   cells on other pages aren't accidentally matched.
    // - For bare <mxGraphModel> input: use the document's only <root>.
    let root: Element | null
    if (doc.documentElement?.tagName === "mxfile") {
        const found = findPageElement(doc as unknown as Document, pageSelector)
        if (!found) {
            const selDesc = hasPageSelector(pageSelector)
                ? ` matching selector ${JSON.stringify(pageSelector)}`
                : ""
            return {
                result: xmlContent,
                errors: [
                    {
                        type: "update",
                        cellId: "",
                        message: `Page${selDesc} not found in <mxfile>`,
                    },
                ],
            }
        }
        root = found.element.querySelector("root")
        if (!root) {
            const pageId =
                found.element.getAttribute("id") || `(index ${found.index})`
            return {
                result: xmlContent,
                errors: [
                    {
                        type: "update",
                        cellId: "",
                        message: `Page "${pageId}" has no <root> element`,
                    },
                ],
            }
        }
    } else {
        if (hasPageSelector(pageSelector)) {
            return {
                result: xmlContent,
                errors: [
                    {
                        type: "update",
                        cellId: "",
                        message:
                            "Page selector provided but document is not multi-page (no <mxfile> wrapper). Use create_new_diagram with a full <mxfile> first, or omit the page selector.",
                    },
                ],
            }
        }
        root = doc.querySelector("root")
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
    }

    // Build a map of cell IDs to elements (scoped to the resolved page).
    const cellMap = new Map<string, Element>()
    root.querySelectorAll("mxCell").forEach((cell) => {
        const id = cell.getAttribute("id")
        if (id) cellMap.set(id, cell)
    })

    // Process each operation
    for (const op of operations) {
        if (op.operation === "update") {
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
        } else if (op.operation === "add") {
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
        } else if (op.operation === "delete") {
            // Protect root cells from deletion
            if (op.cell_id === "0" || op.cell_id === "1") {
                errors.push({
                    type: "delete",
                    cellId: op.cell_id,
                    message: `Cannot delete root cell "${op.cell_id}"`,
                })
                continue
            }

            const existingCell = cellMap.get(op.cell_id)
            if (!existingCell) {
                // Cell not found - might have been cascade-deleted by a previous operation
                // Skip silently instead of erroring (AI may redundantly list children/edges)
                continue
            }

            // Cascade delete: collect all cells to delete (children + edges + self)
            const cellsToDelete = new Set<string>()

            // Recursive function to find all descendants
            const collectDescendants = (cellId: string) => {
                if (cellsToDelete.has(cellId)) return
                cellsToDelete.add(cellId)

                // Find children (cells where parent === cellId)
                // Scoped to `root` so other pages' cells with the same parent id
                // (notably "1") are never touched.
                const children = root!.querySelectorAll(
                    `mxCell[parent="${cellId}"]`,
                )
                children.forEach((child) => {
                    const childId = child.getAttribute("id")
                    if (childId && childId !== "0" && childId !== "1") {
                        collectDescendants(childId)
                    }
                })
            }

            // Collect the target cell and all its descendants
            collectDescendants(op.cell_id)

            // Find edges referencing any of the cells to be deleted
            // Also recursively collect children of those edges (e.g., edge labels)
            for (const cellId of cellsToDelete) {
                const referencingEdges = root.querySelectorAll(
                    `mxCell[source="${cellId}"], mxCell[target="${cellId}"]`,
                )
                referencingEdges.forEach((edge) => {
                    const edgeId = edge.getAttribute("id")
                    // Protect root cells from being added via edge references
                    if (edgeId && edgeId !== "0" && edgeId !== "1") {
                        // Recurse to collect edge's children (like labels)
                        collectDescendants(edgeId)
                    }
                })
            }

            // Log what will be deleted
            if (cellsToDelete.size > 1) {
                console.log(
                    `[applyDiagramOperations] Cascade delete "${op.cell_id}" → deleting ${cellsToDelete.size} cells: ${Array.from(cellsToDelete).join(", ")}`,
                )
            }

            // Delete all collected cells
            for (const cellId of cellsToDelete) {
                const cell = cellMap.get(cellId)
                if (cell) {
                    cell.parentNode?.removeChild(cell)
                    cellMap.delete(cellId)
                }
            }
        }
    }

    // Serialize back to string
    const serializer = new XMLSerializer()
    const result = serializer.serializeToString(doc)

    return { result, errors }
}
