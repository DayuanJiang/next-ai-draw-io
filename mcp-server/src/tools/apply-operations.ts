/**
 * Apply Operations Tool
 * Applies ID-based edit operations directly to a diagram without AI
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { applyDiagramOperations, type DiagramOperation } from "../shared/utils.js"

/**
 * Register the apply_operations tool
 */
export function registerApplyOperationsTool(server: McpServer): void {
    server.tool(
        "apply_operations",
        "Apply ID-based edit operations directly to a draw.io diagram. This is a low-level tool that doesn't use AI - you provide the exact operations to perform.",
        {
            xml: z.string().describe("Current diagram XML (full mxfile format)"),
            operations: z.array(z.object({
                type: z.enum(["update", "add", "delete"]).describe("Operation type"),
                cell_id: z.string().describe("ID of the cell to operate on"),
                new_xml: z.string().optional().describe("For update/add: complete mxCell XML element"),
            })).describe("Array of operations to apply"),
        },
        async ({ xml, operations }) => {
            try {
                // Validate operations
                for (const op of operations) {
                    if ((op.type === "update" || op.type === "add") && !op.new_xml) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify({
                                        error: `Operation ${op.type} on cell ${op.cell_id} requires new_xml`,
                                        xml,
                                    }, null, 2),
                                },
                            ],
                            isError: true,
                        }
                    }
                }

                // Apply operations
                const { result, errors } = applyDiagramOperations(xml, operations as DiagramOperation[])

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                xml: result,
                                errors: errors.map(e => ({
                                    type: e.type,
                                    cellId: e.cellId,
                                    message: e.message,
                                })),
                                success: errors.length === 0,
                                operationsApplied: operations.length - errors.length,
                            }, null, 2),
                        },
                    ],
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: `Failed to apply operations: ${errorMessage}`,
                                xml,
                            }, null, 2),
                        },
                    ],
                    isError: true,
                }
            }
        }
    )
}
