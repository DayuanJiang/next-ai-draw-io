import { describe, expect, it } from "vitest"
import {
    type AiCanvasState,
    diagramFingerprint,
    diagramForMessage,
    MAX_EDITS_WITHOUT_DIAGRAM,
} from "@/lib/diagram-context"

const page = (cells: string) =>
    `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
const box = (id: string, value = id, x = 40) =>
    `<mxCell id="${id}" value="${value}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`

const A = page(box("2") + box("3", "B", 200))
const stateOf = (xml: string, exact = true, pageId: string | null = null) =>
    ({ pageId, fingerprint: diagramFingerprint(xml), exact }) as AiCanvasState

const user = (metadata?: unknown) => ({
    role: "user",
    parts: [{ type: "text" }],
    ...(metadata !== undefined && { metadata }),
})
const assistant = (
    ...calls: { tool: string; id: string; state?: string }[]
) => ({
    role: "assistant",
    parts: calls.map((c) => ({
        type: `tool-${c.tool}`,
        toolCallId: c.id,
        state: c.state ?? "output-available",
    })),
})

describe("diagramFingerprint", () => {
    it("ignores formatting, attribute order, defaults and number spelling", () => {
        const draw = page(
            `<mxCell id="2" value="A" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="0" y="40.0" width="120" height="60" as="geometry"/></mxCell><mxCell id="5" edge="1" parent="1" source="2" target="2" value=""><mxGeometry relative="1" as="geometry"/></mxCell>`,
        )
        const exported = `<mxGraphModel dx="800" dy="600" grid="1">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="2" parent="1" vertex="1" style="rounded=1;" value="A">
      <mxGeometry y="40" width="120" height="60" as="geometry" />
    </mxCell>
    <mxCell id="5" parent="1" source="2" target="2" edge="1">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`
        expect(diagramFingerprint(draw)).toBe(diagramFingerprint(exported))
    })

    it("tells a moved, renamed, added or removed shape apart", () => {
        const base = diagramFingerprint(A)
        expect(
            diagramFingerprint(page(box("2") + box("3", "B", 210))),
        ).not.toBe(base)
        expect(
            diagramFingerprint(page(box("2", "X") + box("3", "B", 200))),
        ).not.toBe(base)
        expect(diagramFingerprint(page(box("2")))).not.toBe(base)
        expect(
            diagramFingerprint(page(box("2") + box("3", "B", 200) + box("4"))),
        ).not.toBe(base)
    })

    it("tells a change of which shape is in front, or of the background, apart", () => {
        const base = diagramFingerprint(A)
        expect(
            diagramFingerprint(page(box("3", "B", 200) + box("2"))),
        ).not.toBe(base)
        expect(
            diagramFingerprint(
                A.replace(
                    "<mxGraphModel>",
                    '<mxGraphModel background="#000000">',
                ),
            ),
        ).not.toBe(base)
    })

    it("reads the cells in draw.io's order: each parent, then its children", () => {
        const container = `<mxCell id="c" value="Group" style="swimlane;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="300" height="200" as="geometry"/></mxCell>`
        const child = `<mxCell id="k" value="Inside" vertex="1" parent="c"><mxGeometry x="20" y="40" width="80" height="40" as="geometry"/></mxCell>`
        // An edit adds the child at the end; draw.io writes it after its parent
        expect(diagramFingerprint(page(container + box("2") + child))).toBe(
            diagramFingerprint(page(container + child + box("2"))),
        )
    })

    it("reads a wrapped cell's parent from the cell, not the user's data", () => {
        const wrapped = `<object id="a" label="A" parent="b"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></object>`
        const b = box("b", "B", 60)
        // Bringing a to the front is a change, whatever its data says
        expect(diagramFingerprint(page(wrapped + b))).not.toBe(
            diagramFingerprint(page(b + wrapped)),
        )
    })

    it("takes a waypoint's left-out coordinate as 0, as draw.io writes it", () => {
        const edge = (point: string) =>
            page(
                `${box("2")}<mxCell id="5" edge="1" parent="1" source="2" target="2"><mxGeometry relative="1" as="geometry"><Array as="points">${point}</Array></mxGeometry></mxCell>`,
            )
        expect(diagramFingerprint(edge('<mxPoint x="0" y="80"/>'))).toBe(
            diagramFingerprint(edge('<mxPoint y="80"/>')),
        )
    })

    it("is null for XML without a model", () => {
        expect(diagramFingerprint("")).toBeNull()
        expect(diagramFingerprint("<mxGraphModel><root>")).toBeNull()
    })
})

describe("diagramForMessage", () => {
    const send = { xml: A, pageId: null }

    it("sends the canvas when the model has not drawn anything yet", () => {
        expect(
            diagramForMessage({
                history: [],
                pageXml: A,
                pageId: null,
                states: new Map(),
            }),
        ).toEqual(send)
    })

    it("leaves the canvas out when it is what the model's drawing made", () => {
        const states = new Map([["d1", stateOf(A)]])
        expect(
            diagramForMessage({
                history: [
                    user(),
                    assistant({ tool: "display_diagram", id: "d1" }),
                ],
                pageXml: A,
                pageId: null,
                states,
            }),
        ).toEqual({ unchanged: true })
    })

    it("sends the canvas after a change by hand, an inexact drawing or another page", () => {
        const history = [
            user(),
            assistant({ tool: "display_diagram", id: "d1" }),
        ]
        const edited = page(box("2", "moved", 300) + box("3", "B", 200))
        expect(
            diagramForMessage({
                history,
                pageXml: edited,
                pageId: null,
                states: new Map([["d1", stateOf(A)]]),
            }),
        ).toEqual({ xml: edited, pageId: null })
        expect(
            diagramForMessage({
                history,
                pageXml: A,
                pageId: null,
                states: new Map([["d1", stateOf(A, false)]]),
            }),
        ).toEqual(send)
        expect(
            diagramForMessage({
                history,
                pageXml: A,
                pageId: "page-2",
                states: new Map([["d1", stateOf(A)]]),
            }),
        ).toEqual({ xml: A, pageId: "page-2" })
    })

    it("sends the canvas after a reload, when the model's last change is unknown", () => {
        expect(
            diagramForMessage({
                history: [
                    user(),
                    assistant({ tool: "display_diagram", id: "d1" }),
                ],
                pageXml: A,
                pageId: null,
                states: new Map(),
            }),
        ).toEqual(send)
    })

    it("compares with the latest edit, and skips calls that failed", () => {
        const afterEdit = page(box("2", "edited") + box("3", "B", 200))
        const states = new Map([
            ["d1", stateOf(A)],
            ["e1", stateOf(afterEdit)],
        ])
        const history = [
            user(),
            assistant({ tool: "display_diagram", id: "d1" }),
            user({ diagram: { unchanged: true } }),
            assistant(
                { tool: "edit_diagram", id: "e1" },
                { tool: "edit_diagram", id: "e2", state: "output-error" },
            ),
        ]
        expect(
            diagramForMessage({
                history,
                pageXml: afterEdit,
                pageId: null,
                states,
            }),
        ).toEqual({ unchanged: true })
        expect(
            diagramForMessage({ history, pageXml: A, pageId: null, states }),
        ).toEqual(send)
    })

    it("uses a canvas sent with a later message as the model's picture", () => {
        const edited = page(box("2", "by hand") + box("3", "B", 200))
        const history = [
            user(),
            assistant({ tool: "display_diagram", id: "d1" }),
            user({ diagram: { xml: edited, pageId: null } }),
            { role: "assistant", parts: [{ type: "text" }] },
        ]
        expect(
            diagramForMessage({
                history,
                pageXml: edited,
                pageId: null,
                states: new Map([["d1", stateOf(A)]]),
            }),
        ).toEqual({ unchanged: true })
    })

    it("sends the canvas when any change since the model's last picture was inexact", () => {
        const afterEdit = page(box("2", "edited") + box("3", "B", 200))
        const history = [
            user(),
            assistant(
                { tool: "display_diagram", id: "d1" },
                { tool: "edit_diagram", id: "e1" },
            ),
        ]
        const states = (exactDrawing: boolean) =>
            new Map([
                ["d1", stateOf(A, exactDrawing)],
                ["e1", { ...stateOf(afterEdit), base: diagramFingerprint(A) }],
            ])
        const args = { history, pageXml: afterEdit, pageId: null }
        expect(diagramForMessage({ ...args, states: states(true) })).toEqual({
            unchanged: true,
        })
        // An auto-fixed drawing, then an exact edit: the fixes are unknown
        expect(diagramForMessage({ ...args, states: states(false) })).toEqual({
            xml: afterEdit,
            pageId: null,
        })
    })

    it("sends the canvas after a hand change made while the model worked", () => {
        const movedByHand = page(box("2") + box("3", "B", 400))
        const afterEdit = page(box("2", "edited") + box("3", "B", 400))
        const history = [
            user(),
            assistant({ tool: "display_diagram", id: "d1" }),
            user({ diagram: { unchanged: true } }),
            assistant({ tool: "edit_diagram", id: "e1" }),
        ]
        // The edit started from a canvas the model never saw
        const states = new Map([
            ["d1", stateOf(A)],
            [
                "e1",
                {
                    ...stateOf(afterEdit),
                    base: diagramFingerprint(movedByHand),
                },
            ],
        ])
        expect(
            diagramForMessage({
                history,
                pageXml: afterEdit,
                pageId: null,
                states,
            }),
        ).toEqual({ xml: afterEdit, pageId: null })
    })

    it("sends the canvas when a change on it got an error or no result", () => {
        for (const state of ["output-error", "input-available"]) {
            expect(
                diagramForMessage({
                    history: [
                        user(),
                        assistant({ tool: "display_diagram", id: "d1", state }),
                    ],
                    pageXml: A,
                    pageId: null,
                    states: new Map([["d1", stateOf(A)]]),
                }),
            ).toEqual(send)
        }
    })

    it("sends the canvas again after more than the allowed edits in a row", () => {
        const states = new Map<string, AiCanvasState>([["d1", stateOf(A)]])
        const history: unknown[] = [
            user(),
            assistant({ tool: "display_diagram", id: "d1" }),
        ]
        for (let i = 1; i <= MAX_EDITS_WITHOUT_DIAGRAM + 1; i++) {
            states.set(`e${i}`, stateOf(A))
            history.push(user({ diagram: { unchanged: true } }))
            history.push(assistant({ tool: "edit_diagram", id: `e${i}` }))
            const result = diagramForMessage({
                history: history as never,
                pageXml: A,
                pageId: null,
                states,
            })
            expect(result).toEqual(
                i <= MAX_EDITS_WITHOUT_DIAGRAM ? { unchanged: true } : send,
            )
        }
    })
})

describe("embedded pictures", () => {
    const picture = (fill: string) =>
        `<mxCell id="9" value="" style="shape=image;image=data:image/png,${fill.repeat(25000)};" vertex="1" parent="1"><mxGeometry x="300" y="40" width="80" height="80" as="geometry"/></mxCell>`

    it("are kept as references in the canvas sent with a message", () => {
        const diagram = diagramForMessage({
            history: [],
            pageXml: page(box("2") + picture("A")),
            pageId: null,
            states: new Map(),
        })
        if (!("xml" in diagram)) throw new Error("expected the canvas")
        expect(diagram.xml).toContain("image=data:image/png,embedded-image-")
        expect(diagram.xml.length).toBeLessThan(1000)
    })

    it("leave the canvas out when it is what the model's drawing made", () => {
        const drawn = page(box("2") + picture("A"))
        const diagram = diagramForMessage({
            history: [
                user({ diagram: { xml: "", pageId: null } }),
                assistant({ tool: "display_diagram", id: "d1" }),
            ],
            pageXml: drawn,
            pageId: null,
            states: new Map([["d1", stateOf(drawn)]]),
        })
        expect(diagram).toEqual({ unchanged: true })
    })

    it("compare with a canvas sent earlier by their reference", () => {
        const drawn = page(box("2") + picture("A"))
        const sent = diagramForMessage({
            history: [],
            pageXml: drawn,
            pageId: null,
            states: new Map(),
        })
        const next = diagramForMessage({
            history: [user({ diagram: sent })],
            pageXml: drawn,
            pageId: null,
            states: new Map(),
        })
        expect(next).toEqual({ unchanged: true })
        // Another picture in the same place is a change
        const changed = diagramForMessage({
            history: [user({ diagram: sent })],
            pageXml: page(box("2") + picture("B")),
            pageId: null,
            states: new Map(),
        })
        expect("xml" in changed).toBe(true)
    })
})
