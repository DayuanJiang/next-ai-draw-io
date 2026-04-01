import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useDiagramToolHandlers } from "@/hooks/use-diagram-tool-handlers"
import { wrapWithMxFile } from "@/lib/utils"

describe("useDiagramToolHandlers - append_diagram multi-page context", () => {
    it("should preserve existing pages when append_diagram completes a truncated output", async () => {
        // Existing mxfile with one non-blank page
        const existingCells = `<mxCell id="2" value="Old" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="30" as="geometry"/></mxCell>`
        const existingMxfile = wrapWithMxFile(existingCells, { pageName: "Page-1" })

        const partialXmlRef = {
            current: `<mxCell id="2" value="New" vertex="1" parent="1"><mxGeometry x="10" y="10"`,
        }
        const editDiagramOriginalXmlRef = { current: new Map<string, string>() }
        const chartXMLRef = { current: existingMxfile }

        const onDisplayChart = vi.fn((_xml: string) => null)
        const onFetchChart = vi.fn(async () => existingMxfile)
        const onExport = vi.fn()

        // Stabilize Date.now/Math.random for deterministic wrapWithMxFile IDs
        const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000)
        const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0.123456789)

        try {
            const { result } = renderHook(() =>
                useDiagramToolHandlers({
                    partialXmlRef,
                    editDiagramOriginalXmlRef,
                    chartXMLRef,
                    onDisplayChart,
                    onFetchChart,
                    onExport,
                    enableVlmValidation: false,
                }),
            )

            const addToolOutput = vi.fn()

            await result.current.handleToolCall(
                {
                    toolCall: {
                        toolCallId: "call-1",
                        toolName: "append_diagram",
                        input: {
                            xml: ` width="80" height="30" as="geometry"/></mxCell>`,
                        },
                    },
                } as any,
                addToolOutput as any,
            )

            expect(onFetchChart).not.toHaveBeenCalled()
            expect(onDisplayChart).toHaveBeenCalledTimes(1)

            const displayedXml = onDisplayChart.mock.calls[0][0] as string

            // Should contain both the old page content and the newly assembled content
            expect(displayedXml).toContain('value="Old"')
            expect(displayedXml).toContain('value="New"')

            const pageCount = (displayedXml.match(/<diagram\b/g) || []).length
            expect(pageCount).toBe(2)

            // Tool output should indicate success
            expect(addToolOutput).toHaveBeenCalledWith(
                expect.objectContaining({
                    tool: "append_diagram",
                    toolCallId: "call-1",
                    output: expect.any(String),
                }),
            )
        } finally {
            dateNowSpy.mockRestore()
            mathRandomSpy.mockRestore()
        }
    })
})
