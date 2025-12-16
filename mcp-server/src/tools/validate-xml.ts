/**
 * Validate XML Tool
 * Validates draw.io XML and optionally attempts to auto-fix issues
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { validateAndFixXml, validateMxCellStructure, formatXML } from "../shared/utils.js"

/**
 * Register the validate_xml tool
 */
export function registerValidateXmlTool(server: McpServer): void {
    server.tool(
        "validate_xml",
        "Validate draw.io XML structure and optionally attempt to auto-fix common issues like duplicate IDs, unclosed tags, or invalid attributes.",
        {
            xml: z.string().describe("Draw.io XML to validate"),
            autoFix: z.boolean().optional().describe("If true, attempt to auto-fix issues (default: true)"),
            format: z.boolean().optional().describe("If true, format the output XML with proper indentation"),
        },
        async ({ xml, autoFix = true, format = false }) => {
            try {
                if (autoFix) {
                    const result = validateAndFixXml(xml)
                    let outputXml = result.fixed || xml

                    if (format && outputXml) {
                        outputXml = formatXML(outputXml)
                    }

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    valid: result.valid,
                                    error: result.error,
                                    xml: outputXml,
                                    fixes: result.fixes,
                                    wasFixed: result.fixes.length > 0,
                                }, null, 2),
                            },
                        ],
                    }
                }

                // Validation only, no fixes
                const error = validateMxCellStructure(xml)
                let outputXml = xml

                if (format) {
                    outputXml = formatXML(xml)
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                valid: !error,
                                error,
                                xml: outputXml,
                                fixes: [],
                                wasFixed: false,
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
                                error: `Validation failed: ${errorMessage}`,
                                valid: false,
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
