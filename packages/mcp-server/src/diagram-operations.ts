/**
 * ID-based diagram operations
 *
 * The xmlContent argument may be either a bare <mxGraphModel> (legacy) or a
 * full <mxfile> with one or more <diagram> pages. For mxfile inputs, an
 * optional pageSelector identifies which page to edit; when omitted, the
 * first page is targeted (the "active page by convention" — see pages.ts).
 */

import { decompressPageContent } from "./load-diagram.ts"
import { log } from "./logger.ts"
import { findPageElement, hasPageSelector, type PageSelector } from "./pages.ts"
import { getXmlSyntaxError } from "./xml-syntax.ts"

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

// Cells with links, tooltips or custom data are stored as
// <UserObject id="..."><mxCell .../></UserObject> (or <object>): the id sits
// on the wrapper, so the wrapper is treated as the cell.
const CELL_SELECTOR = "mxCell, UserObject, object"

/**
 * Return the <root> of a <diagram> page, creating it when missing. An empty
 * page gets a blank model with the "0" and "1" root cells; a page whose text
 * is draw.io's compressed format is decompressed in place. Returns null if
 * the text is neither empty nor decompressible.
 */
function ensurePageRoot(doc: Document, page: Element): Element | null {
    const existing = page.querySelector("root")
    if (existing) return existing

    let model = page.querySelector("mxGraphModel")
    if (!model) {
        const text = page.textContent?.trim() ?? ""
        if (text) {
            const xml = decompressPageContent(text)
            if (!xml || getXmlSyntaxError(xml)) return null
            const parsed = new DOMParser().parseFromString(xml, "text/xml")
            if (parsed.documentElement?.tagName !== "mxGraphModel") return null
            page.textContent = ""
            model = page.appendChild(
                doc.importNode(parsed.documentElement, true),
            ) as Element
            const decompressedRoot = model.querySelector("root")
            if (decompressedRoot) return decompressedRoot
        } else {
            model = page.appendChild(doc.createElement("mxGraphModel"))
        }
    }

    const blank = new DOMParser().parseFromString(
        `<root><mxCell id="0"/><mxCell id="1" parent="0"/></root>`,
        "text/xml",
    )
    return model.appendChild(
        doc.importNode(blank.documentElement, true),
    ) as Element
}

/** Read parent/source/target, which a wrapped cell keeps on its inner mxCell. */
function cellAttr(cell: Element, name: string): string | null {
    const inner =
        cell.tagName === "mxCell" ? cell : cell.querySelector("mxCell")
    return inner?.getAttribute(name) ?? null
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

    // Check for syntax errors, then parse the XML
    const parseError = getXmlSyntaxError(xmlContent)
    if (parseError) {
        return {
            result: xmlContent,
            errors: [
                {
                    type: "update",
                    cellId: "",
                    message: `XML parse error: ${parseError}`,
                },
            ],
        }
    }
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlContent, "text/xml")

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
        root = ensurePageRoot(doc as unknown as Document, found.element)
        if (!root) {
            const pageId =
                found.element.getAttribute("id") || `(index ${found.index})`
            return {
                result: xmlContent,
                errors: [
                    {
                        type: "update",
                        cellId: "",
                        message: `Page "${pageId}" has no <root> element and its content could not be decompressed`,
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
    root.querySelectorAll(CELL_SELECTOR).forEach((cell) => {
        const id = cell.getAttribute("id")
        // A wrapped mxCell may repeat its wrapper's id; the wrapper is the cell
        const wrapped =
            cell.tagName === "mxCell" &&
            /^(UserObject|object)$/.test(cell.parentElement?.tagName ?? "")
        if (id && !wrapped) cellMap.set(id, cell)
    })
    // Ids deleted so far in this batch; deleting one again is a no-op
    const deletedIds = new Set<string>()

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

            // A cut-off cell (its XML still streaming in a preview) would
            // parse in Chrome to a cell without its geometry
            const syntaxError = getXmlSyntaxError(
                `<wrapper>${op.new_xml}</wrapper>`,
            )
            if (syntaxError) {
                errors.push({
                    type: "update",
                    cellId: op.cell_id,
                    message: `new_xml is not well-formed XML: ${syntaxError}`,
                })
                continue
            }

            // Parse the new XML
            const newDoc = parser.parseFromString(
                `<wrapper>${op.new_xml}</wrapper>`,
                "text/xml",
            )
            const newCell = newDoc.querySelector(CELL_SELECTOR)
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

            // A cut-off cell (its XML still streaming in a preview) would
            // parse in Chrome to a cell without its geometry
            const syntaxError = getXmlSyntaxError(
                `<wrapper>${op.new_xml}</wrapper>`,
            )
            if (syntaxError) {
                errors.push({
                    type: "add",
                    cellId: op.cell_id,
                    message: `new_xml is not well-formed XML: ${syntaxError}`,
                })
                continue
            }

            // Parse the new XML
            const newDoc = parser.parseFromString(
                `<wrapper>${op.new_xml}</wrapper>`,
                "text/xml",
            )
            const newCell = newDoc.querySelector(CELL_SELECTOR)
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
                // Skip cells already cascade-deleted by a previous operation
                // (AI may redundantly list children/edges); warn otherwise
                if (!deletedIds.has(op.cell_id)) {
                    errors.push({
                        type: "delete",
                        cellId: op.cell_id,
                        message: `Cell with id="${op.cell_id}" not found`,
                    })
                }
                continue
            }

            // Cascade delete: collect all cells to delete (children + edges + self)
            const cellsToDelete = new Set<string>()

            // Recursive function to find all descendants
            const collectDescendants = (cellId: string) => {
                if (cellsToDelete.has(cellId)) return
                cellsToDelete.add(cellId)

                // Find children (cells where parent === cellId)
                // cellMap only holds this page's cells, so other pages' cells
                // with the same parent id (notably "1") are never touched.
                for (const [childId, child] of cellMap) {
                    if (
                        childId !== "0" &&
                        childId !== "1" &&
                        cellAttr(child, "parent") === cellId
                    ) {
                        collectDescendants(childId)
                    }
                }
            }

            // Collect the target cell and all its descendants
            collectDescendants(op.cell_id)

            // Find edges referencing any of the cells to be deleted
            // Also recursively collect children of those edges (e.g., edge labels)
            for (const cellId of cellsToDelete) {
                for (const [edgeId, edge] of cellMap) {
                    // Protect root cells from being added via edge references
                    if (edgeId === "0" || edgeId === "1") continue
                    if (
                        cellAttr(edge, "source") === cellId ||
                        cellAttr(edge, "target") === cellId
                    ) {
                        // Recurse to collect edge's children (like labels)
                        collectDescendants(edgeId)
                    }
                }
            }

            // Log what will be deleted (stderr: stdout carries JSON-RPC)
            if (cellsToDelete.size > 1) {
                log.debug(
                    `Cascade delete "${op.cell_id}" → deleting ${cellsToDelete.size} cells: ${Array.from(cellsToDelete).join(", ")}`,
                )
            }

            // Delete all collected cells
            for (const cellId of cellsToDelete) {
                const cell = cellMap.get(cellId)
                if (cell) {
                    cell.parentNode?.removeChild(cell)
                    cellMap.delete(cellId)
                }
                deletedIds.add(cellId)
            }
        }
    }

    // Serialize back to string
    const serializer = new XMLSerializer()
    const result = serializer.serializeToString(doc)

    return { result, errors }
}
