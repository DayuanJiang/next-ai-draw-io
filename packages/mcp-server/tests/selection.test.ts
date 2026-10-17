import { describe, expect, it } from "vitest"
import {
    describeSelection,
    MAX_LISTED_CELLS,
    parseSelectionAnswer,
    type SelectionAnswer,
} from "../src/selection.ts"

const page = { pageId: "p1", pageName: "Flow" }

describe("get_selection text", () => {
    it("lists shapes with their geometry and edges with their ends", () => {
        const text = describeSelection(
            {
                ...page,
                cells: [
                    {
                        id: "3",
                        label: "Login",
                        edge: false,
                        geometry: { x: 100, y: 100, width: 120, height: 60 },
                    },
                    {
                        id: "7",
                        label: "",
                        edge: false,
                        geometry: { x: 20, y: 30, width: 80, height: 40 },
                        parent: "box",
                    },
                    {
                        id: "5",
                        label: "yes",
                        edge: true,
                        source: "3",
                        target: "4",
                    },
                    { id: "9", label: "", edge: true },
                ],
            },
            null,
        )
        expect(text).toContain(
            '4 cells selected on page "Flow" (page_id="p1"):',
        )
        expect(text).toContain(
            '- id="3" shape "Login" at x=100 y=100 w=120 h=60',
        )
        expect(text).toContain(
            '- id="7" shape (no label) at x=20 y=30 w=80 h=40 inside "box"',
        )
        expect(text).toContain('- id="5" edge "yes" from "3" to "4"')
        expect(text).toContain('- id="9" edge (no label) (not connected)')
        expect(text).toContain('edit_diagram (page_id="p1")')
    })

    it("details the first cells of a large selection and lists the rest by id", () => {
        const cells = (n: number) =>
            Array.from({ length: n }, (_, i) => ({
                id: `c${i + 1}`,
                label: `Cell ${i + 1}`,
                edge: false,
                geometry: { x: i, y: 0, width: 10, height: 10 },
            }))
        const text = describeSelection(
            { ...page, cells: cells(MAX_LISTED_CELLS + 5) },
            null,
        )
        expect(text).toContain(`${MAX_LISTED_CELLS + 5} cells selected`)
        expect(text).toContain(`id="c${MAX_LISTED_CELLS}"`)
        // No detail past the cap, but every id: the model acts on all of
        // them, and get_diagram cannot tell which cells were selected
        expect(text).not.toContain(`id="c${MAX_LISTED_CELLS + 1}"`)
        expect(text).not.toContain(`shape "Cell ${MAX_LISTED_CELLS + 1}"`)
        expect(text).toContain(
            `- and 5 more cells, listed by id only: "c${MAX_LISTED_CELLS + 1}", "c${MAX_LISTED_CELLS + 2}", "c${MAX_LISTED_CELLS + 3}", "c${MAX_LISTED_CELLS + 4}", "c${MAX_LISTED_CELLS + 5}"`,
        )
        const exact = describeSelection(
            { ...page, cells: cells(MAX_LISTED_CELLS) },
            null,
        )
        expect(exact).not.toContain("more cells")
    })

    it("says clearly when nothing is selected", () => {
        const text = describeSelection({ ...page, cells: [] }, null)
        expect(text).toBe(
            'Nothing is selected on page "Flow" (page_id="p1"). Ask the user to select the shapes they mean in the preview, or call get_diagram.',
        )
        expect(
            describeSelection(
                { pageId: null, pageName: null, cells: [] },
                null,
            ),
        ).toContain("Nothing is selected on the page on screen.")
    })

    it("names the external draw.io when the page cannot read the editor", () => {
        const unavailable: SelectionAnswer = {
            pageId: null,
            pageName: null,
            cells: [],
            unavailable: true,
        }
        expect(
            describeSelection(unavailable, "https://embed.diagrams.net"),
        ).toBe(
            "The preview loads draw.io from https://embed.diagrams.net (another origin), where the selection cannot be read. Ask the user which shapes they mean, or call get_diagram.",
        )
        // Same origin, but the bridge did not attach (a draw.io change)
        expect(describeSelection(unavailable, null)).toContain(
            "could not read the editor's selection",
        )
    })
})

describe("the page's selection answer", () => {
    it("takes the fields it knows and drops malformed cells", () => {
        expect(
            parseSelectionAnswer({
                pageId: "p1",
                pageName: "Flow",
                cells: [
                    {
                        id: "3",
                        label: "Login",
                        edge: false,
                        geometry: { x: 1, y: 2, width: 3, height: 4 },
                        parent: "box",
                        style: "ignored",
                    },
                    { id: "5", edge: true, source: "3", target: 4 },
                    { id: "", label: "no id" },
                    "not a cell",
                    { id: "8", geometry: { x: "1", y: 2 } },
                ],
            }),
        ).toEqual({
            pageId: "p1",
            pageName: "Flow",
            cells: [
                {
                    id: "3",
                    label: "Login",
                    edge: false,
                    geometry: { x: 1, y: 2, width: 3, height: 4 },
                    parent: "box",
                },
                { id: "5", label: "", edge: true, source: "3" },
                { id: "8", label: "", edge: false },
            ],
        })
    })

    it("keeps the unavailable mark and refuses other shapes", () => {
        expect(parseSelectionAnswer({ unavailable: true })).toEqual({
            pageId: null,
            pageName: null,
            cells: [],
            unavailable: true,
        })
        expect(parseSelectionAnswer({ cells: "3,4" })).toBeNull()
        expect(parseSelectionAnswer("3")).toBeNull()
        expect(parseSelectionAnswer(null)).toBeNull()
    })
})
