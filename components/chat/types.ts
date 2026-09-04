/** An `edit_diagram` operation: a patch against one cell, addressed by its id. */
export interface DiagramOperation {
    operation: "update" | "add" | "delete"
    cell_id: string
    new_xml?: string
}

/**
 * A `restructure_diagram` operation.
 *
 * Deliberately loose. The engine owns the real schema (lib/diagram-engine/operations.ts)
 * and it has two dozen variants; the card only needs to say WHAT each step did, so it
 * reads the two fields every variant shares and picks a few recognisable extras out of
 * the rest. Mirroring the full union here would mean editing this file every time the
 * engine gains an operation.
 *
 * The field names matter: `op`/`id`, where edit_diagram has `operation`/`cell_id`. Both
 * tools happen to call their argument `operations`, which is what let the card render one
 * as the other and print six blank `cell_id:` lines.
 */
export interface StructureOperation {
    op: string
    id?: string
    label?: string
    parent?: string
    [key: string]: unknown
}

export interface ToolPartLike {
    type: string
    toolCallId: string
    state?: string
    input?: {
        xml?: string
        operations?: DiagramOperation[] | StructureOperation[]
    } & Record<string, unknown>
    output?: string
}
