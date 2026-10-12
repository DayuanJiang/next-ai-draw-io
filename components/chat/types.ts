import type { DynamicToolUIPart, ToolUIPart, UITools } from "ai"
import type { DiagramOperation } from "@/packages/mcp-server/src/diagram-operations.ts"

export type { DiagramOperation }

/**
 * A tool part as the UI reads it, in any state: input, output and errorText
 * are each there or not, instead of one shape per state.
 */
export type ToolPartLike = (ToolUIPart<UITools> | DynamicToolUIPart) & {
    input?:
        | ({
              xml?: string
              operations?: DiagramOperation[]
          } & Record<string, unknown>)
        | undefined
    output?: string
    errorText?: string
}
