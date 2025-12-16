/**
 * Export Diagram Tool
 * Exports a draw.io diagram to PNG, SVG, or .drawio file format
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { exportDiagram } from "../export/puppeteer-exporter.js"

/**
 * Register the export_diagram tool
 */
export function registerExportDiagramTool(server: McpServer): void {
    server.tool(
        "export_diagram",
        "Export a draw.io diagram to PNG, SVG, or .drawio file format. PNG/SVG export uses a headless browser to render the diagram.",
        {
            xml: z.string().describe("Draw.io XML content (full mxfile format)"),
            format: z.enum(["png", "svg", "drawio"]).describe("Export format"),
            scale: z.number().optional().describe("Scale factor for PNG export (default: 1)"),
            background: z.string().optional().describe("Background color for PNG (default: transparent). Use 'white' or hex color like '#ffffff'"),
            border: z.number().optional().describe("Border padding in pixels (default: 0)"),
        },
        async ({ xml, format, scale, background, border }) => {
            try {
                const result = await exportDiagram(xml, {
                    format,
                    scale: scale || 1,
                    background,
                    border: border || 0,
                })

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                format,
                                filename: result.filename,
                                mimeType: result.mimeType,
                                // Include base64 data for the caller to use
                                data: result.data,
                                dataUrl: `data:${result.mimeType};base64,${result.data}`,
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
                                success: false,
                                error: `Export failed: ${errorMessage}`,
                                format,
                            }, null, 2),
                        },
                    ],
                    isError: true,
                }
            }
        }
    )
}
