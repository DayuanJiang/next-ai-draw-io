export interface DiagramOperation {
    operation: "update" | "add" | "delete"
    cell_id: string
    new_xml?: string
}

export interface ToolPartLike {
    type: string
    toolCallId: string
    state?: string
    input?: {
        xml?: string
        operations?: DiagramOperation[]
    } & Record<string, unknown>
    output?: string
}
