import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useDiagramToolHandlers } from "@/hooks/use-diagram-tool-handlers"

const geometry =
    '<mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>'
const box = (id: string) =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1">${geometry}</mxCell>`

function setup(partialXml: string) {
    const refs = {
        partialXmlRef: { current: partialXml },
        // A failed edit's preview is still on the canvas, its original kept
        editDiagramOriginalXmlRef: {
            current: new Map([["edit-1", "<mxfile>original</mxfile>"]]),
        },
        processedToolCallsRef: { current: new Set<string>() },
        validationRetryCountRef: { current: 0 },
        chartXMLRef: { current: "" },
    }
    const onDisplayChart = vi.fn(
        (_xml: string, _skipValidation?: boolean): string | null => null,
    )
    const { result } = renderHook(() =>
        useDiagramToolHandlers({
            ...refs,
            onDisplayChart,
            onFetchChart: async () => "",
            onExport: () => {},
            enableVlmValidation: false,
        }),
    )
    const addToolOutput = vi.fn()
    const append = (xml: string) =>
        result.current.handleToolCall(
            {
                toolCall: {
                    toolCallId: "append-1",
                    toolName: "append_diagram",
                    input: { xml },
                },
            },
            addToolOutput,
        )
    return { refs, onDisplayChart, addToolOutput, append }
}

describe("the screenshot check and Stop", () => {
    const draw = async (opts: {
        watchStop: () => () => boolean
        validateDiagram: () => Promise<any>
        captureValidationPng?: () => Promise<string>
        // Checks already made in this user turn
        retryCount?: { current: number }
    }) => {
        const onValidationStateChange = vi.fn()
        const { result } = renderHook(() =>
            useDiagramToolHandlers({
                partialXmlRef: { current: "" },
                editDiagramOriginalXmlRef: { current: new Map() },
                processedToolCallsRef: { current: new Set() },
                validationRetryCountRef: opts.retryCount ?? { current: 0 },
                chartXMLRef: { current: "" },
                onDisplayChart: () => null,
                onFetchChart: async () => "",
                onExport: () => {},
                enableVlmValidation: true,
                captureValidationPng:
                    opts.captureValidationPng ??
                    (async () => "data:image/png;base64,AA"),
                validateDiagram: opts.validateDiagram,
                watchStop: opts.watchStop,
                onValidationStateChange,
            }),
        )
        const addToolOutput = vi.fn()
        await result.current.handleToolCall(
            {
                toolCall: {
                    toolCallId: "d1",
                    toolName: "display_diagram",
                    input: { xml: box("2") },
                },
            },
            addToolOutput,
        )
        return { addToolOutput, onValidationStateChange }
    }

    it("skips a check that had not started when the user stopped", async () => {
        const validateDiagram = vi.fn(async () => ({
            valid: true,
            issues: [],
            suggestions: [],
        }))
        const { addToolOutput, onValidationStateChange } = await draw({
            watchStop: () => () => true,
            validateDiagram,
        })
        expect(validateDiagram).not.toHaveBeenCalled()
        expect(onValidationStateChange.mock.lastCall?.[1].status).toBe(
            "skipped",
        )
        expect(addToolOutput.mock.lastCall?.[0].output).toMatch(
            /Successfully displayed/,
        )
    })

    it("ends with the diagram's result when Stop cancels a running check", async () => {
        const { addToolOutput, onValidationStateChange } = await draw({
            watchStop: () => () => false,
            validateDiagram: async () => {
                throw new DOMException("Validation cancelled", "AbortError")
            },
        })
        expect(onValidationStateChange.mock.lastCall?.[1].status).toBe(
            "skipped",
        )
        expect(addToolOutput).toHaveBeenCalledTimes(1)
        expect(addToolOutput.mock.lastCall?.[0].state).toBeUndefined()
    })

    it("checks at most three diagrams in one user turn", async () => {
        const validateDiagram = vi.fn(async () => ({
            valid: true,
            issues: [],
            suggestions: [],
        }))
        const retryCount = { current: 0 }
        for (let i = 0; i < 4; i++) {
            await draw({
                watchStop: () => () => false,
                validateDiagram,
                retryCount,
            })
        }
        // Passed checks count too
        expect(validateDiagram).toHaveBeenCalledTimes(3)
    })

    it("skips the check when Stop came during the screenshot", async () => {
        // As the chat panel counts it: the next message already cleared
        // the stop flag when the screenshot arrives
        let stops = 0
        let stoppedNow = false
        const validateDiagram = vi.fn(async () => ({
            valid: true,
            issues: [],
            suggestions: [],
        }))
        const { onValidationStateChange } = await draw({
            watchStop: () => {
                const before = stops
                return () => stoppedNow || stops !== before
            },
            captureValidationPng: async () => {
                stops++ // Stop
                stoppedNow = false // the next message
                return "data:image/png;base64,AA"
            },
            validateDiagram,
        })
        expect(validateDiagram).not.toHaveBeenCalled()
        expect(onValidationStateChange.mock.lastCall?.[1].status).toBe(
            "skipped",
        )
    })
})

describe("append_diagram and the stored previews", () => {
    it("takes the stored originals when it draws the completed diagram", async () => {
        // Otherwise the preview code later loads the failed edit's original
        // over the completed diagram
        const { refs, onDisplayChart, append } = setup(
            `${box("2")}<mxCell id="3" value="3" vertex="1" parent="1"><mxGeometry x="0" y="0" width="8`,
        )
        await append('0" height="40" as="geometry"/></mxCell>')
        expect(onDisplayChart).toHaveBeenCalledTimes(1)
        expect(onDisplayChart.mock.calls[0][0]).toContain('id="3"')
        expect(refs.editDiagramOriginalXmlRef.current.size).toBe(0)
        expect(refs.processedToolCallsRef.current.has("edit-1")).toBe(true)
    })

    it("leaves them while the diagram is still incomplete", async () => {
        // Nothing is drawn, so the failed edit's preview must still be undone
        const { refs, onDisplayChart, append } = setup(
            `${box("2")}<mxCell id="3" value="3" vertex="1" parent="1"><mxGeometry x="0" y="0" width="8`,
        )
        await append('0" height="40"')
        expect(onDisplayChart).not.toHaveBeenCalled()
        expect(refs.editDiagramOriginalXmlRef.current.size).toBe(1)
        expect(refs.processedToolCallsRef.current.has("edit-1")).toBe(false)
    })

    it("leaves them when the assembled diagram is invalid", async () => {
        const { refs, onDisplayChart, addToolOutput, append } = setup(
            `<mxCell id="1" value="root id" vertex="1" parent="1">${geometry}</mxCell><mxCell id="3" value="3" vertex="1" parent="1"><mxGeometry x="0" y="0" width="8`,
        )
        await append('0" height="40" as="geometry"/></mxCell>')
        expect(onDisplayChart).not.toHaveBeenCalled()
        expect(addToolOutput.mock.calls[0][0].state).toBe("output-error")
        expect(refs.editDiagramOriginalXmlRef.current.size).toBe(1)
    })
})
