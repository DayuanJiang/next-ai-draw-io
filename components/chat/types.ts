import type { DiagramOperation } from "@/packages/mcp-server/src/diagram-operations.ts"

export type { DiagramOperation }

export interface ToolPartLike {
    type: string
    toolCallId: string
    state?: string
    input?: {
        xml?: string
        operations?: DiagramOperation[]
    } & Record<string, unknown>
    output?: string
    errorText?: string
}
