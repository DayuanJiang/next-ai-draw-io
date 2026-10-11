/**
 * The cells the user has selected in the preview, as the page reads them
 * from the editor (shell/use-mcp-sync.ts) and the get_selection tool
 * reports them. The shape is shared with the shell; only plain data, so the
 * server can take it from a POST as it is.
 */

export interface SelectedCellInfo {
    id: string
    /** The label as text, HTML removed and long ones cut */
    label: string
    edge: boolean
    source?: string
    target?: string
    /** The cell's geometry as the XML has it (relative to its parent) */
    geometry?: { x: number; y: number; width: number; height: number }
    /** The container the cell is in, when it is not on the layer itself */
    parent?: string
}

export interface SelectionAnswer {
    /** The page on screen */
    pageId: string | null
    pageName: string | null
    cells: SelectedCellInfo[]
    /** The page cannot reach the editor (an external draw.io) */
    unavailable?: boolean
}

/** A POST body's selection, if it has the shape above; else null */
export function parseSelectionAnswer(value: unknown): SelectionAnswer | null {
    if (!value || typeof value !== "object") return null
    const given = value as Record<string, unknown>
    if (given.unavailable === true) {
        return { pageId: null, pageName: null, cells: [], unavailable: true }
    }
    if (!Array.isArray(given.cells)) return null
    const text = (v: unknown) => (typeof v === "string" ? v : null)
    const cells: SelectedCellInfo[] = []
    for (const raw of given.cells) {
        if (!raw || typeof raw !== "object") continue
        const c = raw as Record<string, unknown>
        if (typeof c.id !== "string" || !c.id) continue
        const cell: SelectedCellInfo = {
            id: c.id,
            label: text(c.label) ?? "",
            edge: c.edge === true,
        }
        if (text(c.source)) cell.source = c.source as string
        if (text(c.target)) cell.target = c.target as string
        if (text(c.parent)) cell.parent = c.parent as string
        const g = c.geometry as Record<string, unknown> | undefined
        if (
            g &&
            typeof g === "object" &&
            [g.x, g.y, g.width, g.height].every(
                (n) => typeof n === "number" && Number.isFinite(n),
            )
        ) {
            cell.geometry = {
                x: g.x as number,
                y: g.y as number,
                width: g.width as number,
                height: g.height as number,
            }
        }
        cells.push(cell)
    }
    return { pageId: text(given.pageId), pageName: text(given.pageName), cells }
}

/** describeSelection details at most this many cells; the rest by id only */
export const MAX_LISTED_CELLS = 100

/**
 * The get_selection result text. `externalDrawio` names the draw.io origin
 * when the preview loads it from another origin, where the page cannot
 * read the editor. A selection of a whole large diagram would fill the
 * model's context with labels and geometry: the first cells get them, the
 * rest are listed by id alone (an edit on the selection needs every id).
 */
export function describeSelection(
    answer: SelectionAnswer,
    externalDrawio: string | null,
): string {
    if (answer.unavailable) {
        return externalDrawio
            ? `The preview loads draw.io from ${externalDrawio} (another origin), where the selection cannot be read. Ask the user which shapes they mean, or call get_diagram.`
            : "The preview could not read the editor's selection. Ask the user which shapes they mean, or call get_diagram."
    }
    const page = answer.pageName
        ? `page "${answer.pageName}"${answer.pageId ? ` (page_id="${answer.pageId}")` : ""}`
        : "the page on screen"
    if (answer.cells.length === 0) {
        return `Nothing is selected on ${page}. Ask the user to select the shapes they mean in the preview, or call get_diagram.`
    }
    const listed = answer.cells.slice(0, MAX_LISTED_CELLS)
    const lines = listed.map((cell) => {
        const label = cell.label ? `"${cell.label}"` : "(no label)"
        if (cell.edge) {
            const ends =
                cell.source || cell.target
                    ? ` from ${cell.source ? `"${cell.source}"` : "nothing"} to ${cell.target ? `"${cell.target}"` : "nothing"}`
                    : " (not connected)"
            return `- id="${cell.id}" edge ${label}${ends}`
        }
        const g = cell.geometry
        const where = g
            ? ` at x=${g.x} y=${g.y} w=${g.width} h=${g.height}`
            : ""
        const parent = cell.parent ? ` inside "${cell.parent}"` : ""
        return `- id="${cell.id}" shape ${label}${where}${parent}`
    })
    const rest = answer.cells.slice(MAX_LISTED_CELLS)
    if (rest.length > 0) {
        lines.push(
            `- and ${rest.length} more cells, listed by id only: ${rest.map((c) => `"${c.id}"`).join(", ")}`,
        )
    }
    const count =
        answer.cells.length === 1 ? "1 cell" : `${answer.cells.length} cells`
    const target = answer.pageId ? ` (page_id="${answer.pageId}")` : ""
    return `${count} selected on ${page}:\n${lines.join("\n")}\n\nUse these ids with edit_diagram${target}; call get_diagram for their full XML.`
}
