/**
 * ID-based diagram operations
 *
 * The xmlContent argument may be either a bare <mxGraphModel> (legacy) or a
 * full <mxfile> with one or more <diagram> pages. For mxfile inputs, an
 * optional pageSelector identifies which page to edit; when omitted, the
 * first page is targeted (the "active page by convention" — see pages.ts).
 */

import { defaultLayerOf } from "./compact-cells.ts"
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
    /** Ids of updates whose new cell was the same as the old one */
    unchanged: string[]
    /** What the model should know about operations that went through */
    notes: string[]
}

/** Notes as the last part of a tool result, or "" without any */
export const notesText = (notes: string[]) =>
    notes.length > 0
        ? `\n\nNotes:\n${notes.map((note) => `- ${note}`).join("\n")}`
        : ""

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

/**
 * A cell as text with its attributes in order, so an update that sends a
 * cell as it already was counts as no change. The style keys keep their
 * order: draw.io uses the last value of a repeated key, so reordering them
 * can change the cell
 */
function cellKey(el: Element): string {
    const attrs = Array.from(el.attributes)
        .map((a) => {
            const value =
                a.name === "style"
                    ? a.value.split(";").filter(Boolean).join(";")
                    : a.value
            return `${a.name}=${JSON.stringify(value)}`
        })
        .sort()
        .join(" ")
    const children = Array.from(el.children).map(cellKey).join("")
    return `<${el.tagName} ${attrs}>${children}</${el.tagName}>`
}

/** The mxCell of a cell: itself, or the one inside its wrapper */
const innerCell = (cell: Element) =>
    cell.tagName === "mxCell" ? cell : cell.querySelector("mxCell")

/** Read parent/source/target, which a wrapped cell keeps on its inner mxCell. */
function cellAttr(cell: Element, name: string): string | null {
    return innerCell(cell)?.getAttribute(name) ?? null
}

const isShapeOrEdge = (cell: Element) =>
    cellAttr(cell, "vertex") === "1" || cellAttr(cell, "edge") === "1"

/** The cells of a page by id */
function cellsById(root: Element): Map<string, Element> {
    const cells = new Map<string, Element>()
    root.querySelectorAll(CELL_SELECTOR).forEach((cell) => {
        const id = cell.getAttribute("id")
        // A wrapped mxCell may repeat its wrapper's id; the wrapper is the cell
        const wrapped =
            cell.tagName === "mxCell" &&
            /^(UserObject|object)$/.test(cell.parentElement?.tagName ?? "")
        if (id && !wrapped) cells.set(id, cell)
    })
    return cells
}

/** Position and size of a shape placed by coordinates, or null */
function boxOf(cell: Element | undefined) {
    const inner = cell && innerCell(cell)
    const geometry = Array.from(inner?.children ?? []).find(
        (child) => child.tagName === "mxGeometry",
    )
    if (
        inner?.getAttribute("vertex") !== "1" ||
        !geometry ||
        geometry.getAttribute("relative") === "1"
    ) {
        return null
    }
    const number = (name: string) => Number(geometry.getAttribute(name) ?? 0)
    return {
        x: number("x"),
        y: number("y"),
        width: number("width"),
        height: number("height"),
    }
}

/**
 * The cell a new shape belongs in front of in the page's order (draw.io
 * draws the cells in that order, the last one on top): null for most. A box
 * that covers other shapes of the page is a frame or a background around
 * them, and belongs behind the first of them or of their edges. In front,
 * it would take every click meant for a shape inside it (draw.io selects
 * the topmost cell, also where its fill is none), and with a fill it would
 * hide them. Also returns the shapes it covers.
 */
function placeBehind(
    root: Element,
    cells: Map<string, Element>,
    newCell: Element,
): { before: Element | null; covered: string[] } {
    const frame = boxOf(newCell)
    const covered: string[] = []
    if (frame) {
        const parent = cellAttr(newCell, "parent")
        for (const [id, cell] of cells) {
            const box = boxOf(cell)
            if (
                box &&
                cellAttr(cell, "parent") === parent &&
                box.x >= frame.x &&
                box.y >= frame.y &&
                box.x + box.width <= frame.x + frame.width &&
                box.y + box.height <= frame.y + frame.height &&
                box.width * box.height < frame.width * frame.height
            ) {
                covered.push(id)
            }
        }
    }
    const inside = (id: string | null) => id !== null && covered.includes(id)
    const before =
        Array.from(root.children).find(
            (cell) =>
                inside(cell.getAttribute("id")) ||
                inside(cellAttr(cell, "source")) ||
                inside(cellAttr(cell, "target")),
        ) ?? null
    return { before, covered }
}

// A UML stereotype as it is typed: <<include>>, <<use case>>. With a space
// after the first pair ("a << b") draw.io shows the text as written
const STEREOTYPE = /<<(\p{L}[^<>]{0,40})>>/gu

/** Up to ten ids, and how many more there are */
const listIds = (ids: string[]) =>
    ids.slice(0, 10).join(", ") +
    (ids.length > 10 ? ` and ${ids.length - 10} more` : "")

/**
 * A look at the cells the model just wrote (`ids`; every cell of the page
 * when left out) for what draw.io accepts without a word but shows
 * differently from what the model meant.
 *
 * repairs: a source or target that names no cell of the page is removed, and
 * a cell whose parent is missing goes on the page's layer. draw.io does both
 * when it loads the page; its corrected copy would then come back from the
 * browser looking like a hand edit by the user. A stereotype typed as
 * <<include>> becomes «include»: draw.io would show "<>" (4 of 10 use case
 * diagrams of real requests had one). Each repair is also a note.
 *
 * notes: shapes that reach outside their container (a child's x and y count
 * from the container's corner; a model that writes page coordinates there
 * puts the child outside the box, while an icon set on the border is meant
 * to be there, so the note leaves that open), labels with a literal \n, and
 * references to pictures the diagram does not have.
 */
export function reviewCells(
    root: Element,
    ids?: Iterable<string>,
): { repairs: string[]; notes: string[] } {
    const cells = cellsById(root)
    // Where a compact cell without a parent goes too; looked up only when
    // a cell needs it
    let layer: string | undefined
    const ends: string[] = []
    const orphans: string[] = []
    const outside: string[] = []
    const literal: string[] = []
    const pictures: string[] = []
    const stereotypes: string[] = []
    for (const id of ids ?? cells.keys()) {
        const cell = cells.get(id)
        const inner = cell && innerCell(cell)
        if (!cell || !inner) continue
        for (const end of ["source", "target"]) {
            const ref = inner.getAttribute(end)
            if (ref && !cells.has(ref)) {
                inner.removeAttribute(end)
                ends.push(`${id} (${end} "${ref}")`)
            }
        }
        const parentId = inner.getAttribute("parent")
        if (parentId && !cells.has(parentId)) {
            layer ??= defaultLayerOf(
                new XMLSerializer().serializeToString(root),
            )
            inner.setAttribute("parent", layer)
            orphans.push(`${id} (parent "${parentId}")`)
        }
        const box = boxOf(cell)
        const container = boxOf(cells.get(inner.getAttribute("parent") ?? ""))
        if (
            box &&
            container &&
            (box.x < -1 ||
                box.y < -1 ||
                box.x + box.width > container.width + 1 ||
                box.y + box.height > container.height + 1)
        ) {
            outside.push(id)
        }
        // getAttributeNode gives the decoded value (linkedom's getAttribute
        // escapes it again in an XML document)
        const label =
            (cell.getAttributeNode("value") ?? cell.getAttributeNode("label"))
                ?.value ?? ""
        // (a Windows path, C:\new or \\nas01\backup, has one by its nature)
        if (label.includes("\\n") && !/[A-Za-z]:\\|\\\\/.test(label)) {
            literal.push(id)
        }
        // A stereotype typed as <<include>>: an html=1 label is HTML, so
        // draw.io takes <include> for a tag and shows only "<>"
        const style = inner.getAttribute("style") ?? ""
        const kept = /(^|;)html=1(;|$)/.test(style)
            ? label.replace(STEREOTYPE, "«$1»")
            : label
        if (kept !== label) {
            cell.setAttribute(
                cell.hasAttribute("value") ? "value" : "label",
                kept,
            )
            stereotypes.push(id)
        }
        if (style.includes("embedded-image-")) {
            pictures.push(id)
        }
    }
    const repairs: string[] = []
    if (ends.length > 0) {
        repairs.push(
            `Drawn without the end that names no cell on this page: ${ends.join(", ")}. Update these edges once the cells exist.`,
        )
    }
    if (orphans.length > 0) {
        repairs.push(
            `Put on the page itself, as the parent is no cell on this page: ${orphans.join(", ")}.`,
        )
    }
    if (stereotypes.length > 0) {
        repairs.push(
            `Wrote <<name>> as «name» in: ${listIds(stereotypes)}. A label is HTML, so draw.io takes <name> for a tag and shows only <>.`,
        )
    }
    const notes: string[] = []
    if (outside.length > 0) {
        notes.push(
            `Outside their container: ${listIds(outside)}. The x and y of a cell with parent="<container id>" count from the container's top left corner. If that is not intended, move these cells or make the container larger.`,
        )
    }
    if (literal.length > 0) {
        notes.push(
            `The label holds a literal \\n, shown as those two characters: ${listIds(literal)}. For a line break write &lt;br&gt;.`,
        )
    }
    if (pictures.length > 0) {
        notes.push(
            `No picture for the reference in: ${listIds(pictures)}. A reference (embedded-image-<id>) stands for a picture this diagram holds, as get_diagram shows it; these cells show a broken image.`,
        )
    }
    return { repairs, notes }
}

/**
 * The cell an add or update operation sends in new_xml, imported into doc,
 * or the error message for the model.
 */
function parseNewCell(
    op: DiagramOperation,
    parser: DOMParser,
    doc: Document,
): Element | string {
    if (!op.new_xml) return `new_xml is required for ${op.operation} operation`
    // A cut-off cell (its XML still streaming in a preview) would parse in
    // Chrome to a cell without its geometry
    const wrapped = `<wrapper>${op.new_xml}</wrapper>`
    const syntaxError = getXmlSyntaxError(wrapped)
    if (syntaxError) return `new_xml is not well-formed XML: ${syntaxError}`
    const newCell = parser
        .parseFromString(wrapped, "text/xml")
        .querySelector(CELL_SELECTOR)
    if (!newCell) return "new_xml must contain an mxCell element"
    const newCellId = newCell.getAttribute("id")
    if (newCellId !== op.cell_id) {
        return `ID mismatch: cell_id is "${op.cell_id}" but new_xml has id="${newCellId}"`
    }
    return doc.importNode(newCell, true)
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
            unchanged: [],
            notes: [],
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
                unchanged: [],
                notes: [],
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
                unchanged: [],
                notes: [],
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
                unchanged: [],
                notes: [],
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
                unchanged: [],
                notes: [],
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
    const cellMap = cellsById(root)
    // Ids deleted so far in this batch; deleting one again is a no-op
    const deletedIds = new Set<string>()
    const unchanged: string[] = []
    const notes: string[] = []
    const addedIds: string[] = []

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

            const newCell = parseNewCell(op, parser, doc)
            if (typeof newCell === "string") {
                errors.push({
                    type: "update",
                    cellId: op.cell_id,
                    message: newCell,
                })
                continue
            }

            // <mxCell id="3" value="Renamed"/> has no size and no connection:
            // it is neither a shape nor an edge, and the cell would vanish
            if (isShapeOrEdge(existingCell) && !isShapeOrEdge(newCell)) {
                errors.push({
                    type: "update",
                    cellId: op.cell_id,
                    message:
                        "new_xml has no position or size (x, y, w, h) and no source or target, so the cell would vanish. update replaces the whole cell: send its value, style and position too",
                })
                continue
            }

            if (cellKey(newCell) === cellKey(existingCell)) {
                unchanged.push(op.cell_id)
            }
            existingCell.parentNode?.replaceChild(newCell, existingCell)
            cellMap.set(op.cell_id, newCell)
        } else if (op.operation === "add") {
            if (cellMap.has(op.cell_id)) {
                errors.push({
                    type: "add",
                    cellId: op.cell_id,
                    message: `Cell with id="${op.cell_id}" already exists`,
                })
                continue
            }

            const newCell = parseNewCell(op, parser, doc)
            if (typeof newCell === "string") {
                errors.push({
                    type: "add",
                    cellId: op.cell_id,
                    message: newCell,
                })
                continue
            }

            root.appendChild(newCell)
            cellMap.set(op.cell_id, newCell)
            addedIds.push(op.cell_id)
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
                // The cell is gone, which is what the model asked for, so
                // the other operations still apply. Often it went with its
                // container or its shape in an earlier call. One removed by
                // this batch (the model lists children and edges too) needs
                // no word.
                if (!deletedIds.has(op.cell_id)) {
                    notes.push(
                        `delete ${op.cell_id}: no cell with this id on the page (already deleted?), skipped.`,
                    )
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

            // Log what will be deleted (stderr: stdout carries JSON-RPC),
            // and tell the model, which would otherwise delete them again
            if (cellsToDelete.size > 1) {
                log.debug(
                    `Cascade delete "${op.cell_id}" → deleting ${cellsToDelete.size} cells: ${Array.from(cellsToDelete).join(", ")}`,
                )
                notes.push(
                    `delete ${op.cell_id} also removed its children and connected edges: ${Array.from(cellsToDelete).slice(1).join(", ")}.`,
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

    // A new box goes behind the shapes it covers. Which ones it covers is
    // known once every operation is applied: a later update of the batch
    // can move a shape into a box added before it. A cell the batch deleted
    // again is no longer in the map.
    for (const id of addedIds) {
        const cell = cellMap.get(id)
        if (!cell) continue
        const { before, covered } = placeBehind(root, cellMap, cell)
        const order = Array.from(root.children)
        if (before && order.indexOf(before) < order.indexOf(cell)) {
            root.insertBefore(cell, before)
            notes.push(
                `${id} is drawn behind the shapes it covers (${listIds(covered)}), so they stay visible and can be selected.`,
            )
        }
    }

    // Serialize back to string
    const serializer = new XMLSerializer()
    const result = serializer.serializeToString(doc)

    return { result, errors, unchanged, notes }
}
