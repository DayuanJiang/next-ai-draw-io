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
        continuationOriginalRef: { current: null },
        // A failed edit's preview is still on the canvas, its original kept
        editDiagramOriginalXmlRef: {
            current: new Map([["edit-1", "<mxfile>original</mxfile>"]]),
        },
        processedToolCallsRef: { current: new Set<string>() },
        validationRetryCountRef: { current: 0 },
        chartXMLRef: { current: "" },
    }
    const onDisplayChart = vi.fn(
        (
            _xml: string,
            _skipValidation?: boolean,
            _mode?: string,
        ): string | null => null,
    )
    const { result } = renderHook(() =>
        useDiagramToolHandlers({
            ...refs,
            onDisplayChart,
            onFetchChart: async () => "",
            enableVlmValidation: false,
        }),
    )
    const addToolOutput = vi.fn()
    const call = (toolName: string, input: object, toolCallId = "call-1") =>
        result.current.handleToolCall(
            { toolCall: { toolCallId, toolName, input } },
            addToolOutput,
        )
    const append = (xml: string) => call("append_diagram", { xml }, "append-1")
    return { refs, onDisplayChart, addToolOutput, append, call }
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
                continuationOriginalRef: { current: null },
                editDiagramOriginalXmlRef: { current: new Map() },
                processedToolCallsRef: { current: new Set() },
                validationRetryCountRef: opts.retryCount ?? { current: 0 },
                chartXMLRef: { current: "" },
                onDisplayChart: () => null,
                onFetchChart: async () => "",
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

    it("takes them when the assembled diagram is invalid, and goes back", async () => {
        // Back to the diagram before the failed edit's preview, at once
        const { refs, onDisplayChart, addToolOutput, append } = setup(
            `<mxCell id="1" value="root id" vertex="1" parent="1">${geometry}</mxCell><mxCell id="3" value="3" vertex="1" parent="1"><mxGeometry x="0" y="0" width="8`,
        )
        await append('0" height="40" as="geometry"/></mxCell>')
        expect(addToolOutput.mock.calls[0][0].state).toBe("output-error")
        expect(onDisplayChart.mock.calls).toEqual([
            ["<mxfile>original</mxfile>", true, "revert"],
        ])
        expect(refs.editDiagramOriginalXmlRef.current.size).toBe(0)
        expect(refs.processedToolCallsRef.current.has("edit-1")).toBe(true)
    })

    it("goes back to the diagram before the cut off drawing when it fails", async () => {
        // The failed edit's preview was drawn on the cut off drawing: its
        // original must not come back later
        const invalid = `<mxCell id="1" value="root id" vertex="1" parent="1">${geometry}</mxCell><mxCell id="3" value="3" vertex="1" parent="1"><mxGeometry x="0" y="0" width="8`
        const valid = `${box("2")}<mxCell id="3" value="3" vertex="1" parent="1"><mxGeometry x="0" y="0" width="8`
        for (const [partial, commitFails] of [
            [invalid, false],
            [valid, true],
        ] as const) {
            const { refs, onDisplayChart, append } = setup(partial)
            refs.continuationOriginalRef.current =
                "<mxfile>before the cut</mxfile>" as any
            refs.editDiagramOriginalXmlRef.current = new Map([
                ["edit-1", "<mxfile>cut off</mxfile>"],
            ])
            if (commitFails) {
                onDisplayChart.mockImplementation((_xml, _skip, mode) =>
                    mode === "commit" ? "load failed" : null,
                )
            }
            await append('0" height="40" as="geometry"/></mxCell>')
            const calls = onDisplayChart.mock.calls
            expect(calls.at(-1)).toEqual([
                "<mxfile>before the cut</mxfile>",
                true,
                "revert",
            ])
            expect(
                calls.some(([xml]) => xml === "<mxfile>cut off</mxfile>"),
            ).toBe(false)
            expect(refs.editDiagramOriginalXmlRef.current.size).toBe(0)
            expect(refs.continuationOriginalRef.current).toBeNull()
        }
    })
})

describe("display_diagram and undo", () => {
    it("commits the diagram as one undo step before any check", async () => {
        const { onDisplayChart, call } = setup("")
        await call("display_diagram", { xml: box("2") })
        expect(onDisplayChart.mock.calls.map((c) => c[2])).toEqual(["commit"])
    })
})

describe("a cut off drawing", () => {
    it("is replaced starting from the diagram before it", async () => {
        const { refs, onDisplayChart, call } = setup("")
        // Cut off: its preview stays, the diagram before it is kept
        await call(
            "display_diagram",
            { xml: `${box("2")}<mxCell id="3"` },
            "d1",
        )
        expect(refs.continuationOriginalRef.current).toBe(
            "<mxfile>original</mxfile>",
        )
        // A later drawing (after failed calls undone to the cut off one)
        // first goes back to it, so its undo step starts there
        await call("display_diagram", { xml: box("4") }, "d2")
        expect(
            onDisplayChart.mock.calls.map(([xml, , mode]) => [
                xml === "<mxfile>original</mxfile>" ? "original" : "new",
                mode,
            ]),
        ).toEqual([
            ["original", "revert"],
            ["new", "commit"],
        ])
        expect(refs.continuationOriginalRef.current).toBeNull()
    })
})

describe("the model's page", () => {
    const page = (id: string, cells: string) =>
        `<diagram id="${id}" name="Page ${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`
    const twoPages = `<mxfile>${page("a", box("A"))}${page("b", box("B"))}</mxfile>`
    /** Ids of the shapes on a page (not the root cells) */
    const shapesOn = (xml: string, pageId: string) =>
        Array.from(
            new DOMParser()
                .parseFromString(xml, "text/xml")
                .querySelectorAll(`diagram[id="${pageId}"] mxCell`),
        )
            .map((cell) => cell.getAttribute("id"))
            .filter((id) => id !== "0" && id !== "1")

    function setupOn(pageId: string | null) {
        const onDisplayChart = vi.fn(
            (
                _xml: string,
                _skipValidation?: boolean,
                _mode?: string,
                _meta?: object,
            ): string | null => null,
        )
        const { result } = renderHook(() =>
            useDiagramToolHandlers({
                partialXmlRef: { current: "" },
                continuationOriginalRef: { current: null },
                editDiagramOriginalXmlRef: { current: new Map() },
                processedToolCallsRef: { current: new Set() },
                validationRetryCountRef: { current: 0 },
                chartXMLRef: { current: twoPages },
                turnPageIdRef: { current: pageId },
                onDisplayChart,
                onFetchChart: async () => twoPages,
                enableVlmValidation: false,
            }),
        )
        const addToolOutput = vi.fn()
        const call = (toolName: string, input: object) =>
            result.current.handleToolCall(
                { toolCall: { toolCallId: "call-1", toolName, input } },
                addToolOutput,
            )
        return { onDisplayChart, addToolOutput, call }
    }

    it("display_diagram draws on that page and keeps the others", async () => {
        const { onDisplayChart, call } = setupOn("b")
        await call("display_diagram", { xml: box("N") })
        const [xml, , mode, meta] = onDisplayChart.mock.calls[0]
        expect(mode).toBe("commit")
        expect(meta).toEqual({ toolCallId: "call-1", pageId: "b" })
        expect(shapesOn(xml, "a")).toEqual(["A"])
        expect(shapesOn(xml, "b")).toEqual(["N"])
        // The page keeps its own name
        expect(xml).toContain('name="Page b"')
    })

    it("edit_diagram changes that page", async () => {
        const { onDisplayChart, addToolOutput, call } = setupOn("b")
        await call("edit_diagram", {
            operations: [{ operation: "delete", cell_id: "B" }],
        })
        expect(addToolOutput.mock.lastCall?.[0].state).toBeUndefined()
        const [xml] = onDisplayChart.mock.calls.at(-1) as [string]
        expect(shapesOn(xml, "a")).toEqual(["A"])
        expect(shapesOn(xml, "b")).toEqual([])
    })

    it("shows the model only its page when an edit fails", async () => {
        const { addToolOutput, call } = setupOn("b")
        await call("edit_diagram", {
            operations: [{ operation: "delete", cell_id: "missing" }],
        })
        const output = addToolOutput.mock.lastCall?.[0]
        expect(output?.state).toBe("output-error")
        expect(output?.errorText).toContain('id="B"')
        expect(output?.errorText).not.toContain('id="A"')
    })

    it("draws on the first page when the page is not known", async () => {
        const { onDisplayChart, call } = setupOn(null)
        await call("display_diagram", { xml: box("N") })
        const [xml, , , meta] = onDisplayChart.mock.calls[0]
        expect(meta).toEqual({ toolCallId: "call-1", pageId: null })
        expect(shapesOn(xml, "a")).toEqual(["N"])
        expect(shapesOn(xml, "b")).toEqual(["B"])
    })

    it("lets a drawing with several pages replace the document", async () => {
        const { onDisplayChart, call } = setupOn("b")
        const drawn = `<mxfile>${page("x", box("X"))}${page("y", box("Y"))}</mxfile>`
        await call("display_diagram", { xml: drawn })
        const [xml] = onDisplayChart.mock.calls[0]
        expect(shapesOn(xml, "x")).toEqual(["X"])
        expect(shapesOn(xml, "a")).toEqual([])
    })
})
