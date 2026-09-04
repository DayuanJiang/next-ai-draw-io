/**
 * The four non-architecture diagram kinds, in the real editor.
 *
 * The unit tests prove the engine computes the right coordinates. This proves draw.io
 * accepts what it emits: that the shapes render, the labels appear, and — the part no unit
 * test can check — that the styles the engine writes are ones the editor actually
 * understands. A `umlLifeline` with the wrong token set parses fine and draws nothing.
 */
import { expect, test } from "@playwright/test"
import * as pako from "pako"
import { sendMessage } from "./lib/fixtures"
import { createMockToolResponse } from "./lib/helpers"

/**
 * A cell's y, read from an EXPORTED document.
 *
 * draw.io reorders attributes when it serialises, so the export has `height` and `width`
 * before `x` and `y` rather than in the order the engine wrote them. Matching a fixed order
 * finds nothing, which reads as a layout failure when the layout is fine.
 */
function cellY(xml: string, id: string): number {
    const cell = xml.match(
        new RegExp(`<mxCell id="${id}"[\\s\\S]*?<\\/mxCell>`),
    )?.[0]
    const y = cell?.match(/<mxGeometry[^>]*\by="(-?[\d.]+)"/)?.[1]
    expect(y, `no y geometry for "${id}"`).toBeTruthy()
    return Number(y)
}

/** Undo draw.io's export compression: URI-encoded, raw-deflated, base64'd. */
function inflateDiagram(xml: string): string | null {
    if (xml.includes("<mxCell")) return xml
    const body = xml.match(/<diagram[^>]*>([^<]+)<\/diagram>/)?.[1]
    if (!body) return null
    try {
        const bin = Buffer.from(body, "base64")
        const out = pako.inflate(new Uint8Array(bin), { windowBits: -15 })
        return decodeURIComponent(new TextDecoder("utf-8").decode(out))
    } catch {
        return null
    }
}

/** Ask the editor for its current document rather than waiting for an autosave. */
async function exportXml(page: import("@playwright/test").Page) {
    const raw = await page.evaluate(
        () =>
            new Promise<string | null>((resolve) => {
                const iframe = document.querySelector(
                    "iframe",
                ) as HTMLIFrameElement
                const onMsg = (e: MessageEvent) => {
                    if (typeof e.data !== "string") return
                    try {
                        const m = JSON.parse(e.data)
                        if (m.event === "export" && m.xml) {
                            window.removeEventListener("message", onMsg)
                            resolve(m.xml as string)
                        }
                    } catch {
                        /* not our message */
                    }
                }
                window.addEventListener("message", onMsg)
                iframe.contentWindow?.postMessage(
                    JSON.stringify({
                        action: "export",
                        format: "xmlsvg",
                        xml: 1,
                    }),
                    "*",
                )
                setTimeout(() => {
                    window.removeEventListener("message", onMsg)
                    resolve(null)
                }, 10000)
            }),
    )
    expect(raw, "editor did not return the document").toBeTruthy()
    const xml = inflateDiagram(raw as string)
    expect(xml, "could not read the exported document").toBeTruthy()
    return xml as string
}

/** Serve one mocked tool call and open the app on it. */
async function runTool(
    page: import("@playwright/test").Page,
    tool: string,
    input: unknown,
    prompt: string,
) {
    await page.route("**/api/chat", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: createMockToolResponse(tool, input, "Drawing it."),
        })
    })
    await page.goto("/", { waitUntil: "networkidle" })
    await page.locator("iframe").waitFor({ state: "visible", timeout: 60000 })
    await page.waitForTimeout(6000)
    await sendMessage(page, prompt)
    return page.frameLocator("iframe")
}

test.describe("draw_graph", () => {
    test("renders a decision flowchart with the right shapes", async ({
        page,
    }) => {
        test.setTimeout(180000)
        const canvas = await runTool(
            page,
            "draw_graph",
            {
                title: "Order Approval",
                nodes: [
                    {
                        id: "start",
                        label: "Order received",
                        shape: "terminator",
                    },
                    {
                        id: "check",
                        label: "Amount over 1000",
                        shape: "decision",
                    },
                    { id: "mgr", label: "Manager approval" },
                    { id: "auto", label: "Auto approve" },
                    { id: "ship", label: "Ship order" },
                ],
                edges: [
                    { source: "start", target: "check" },
                    { source: "check", target: "mgr", label: "yes" },
                    { source: "check", target: "auto", label: "no" },
                    { source: "mgr", target: "ship" },
                    { source: "auto", target: "ship" },
                ],
            },
            "Draw the order approval flow",
        )

        for (const label of [
            "Order Approval",
            "Order received",
            "Amount over 1000",
            "Manager approval",
            "Auto approve",
            "Ship order",
            "yes",
        ])
            await expect(
                canvas.getByText(label, { exact: true }).first(),
                `"${label}" should be on the canvas`,
            ).toBeVisible({ timeout: 30000 })

        const xml = await exportXml(page)
        // The decision is a diamond and the start is a stadium, not two plain rectangles.
        expect(xml).toMatch(/id="check"[^>]*rhombus/)
        expect(xml).toMatch(/id="start"[^>]*arcSize=50/)
        // Both branches sit on the same row, which is the whole point of the layering.
        expect(cellY(xml, "mgr")).toBe(cellY(xml, "auto"))
    })
})

test.describe("swimlane pool", () => {
    test("renders lane bands with each step in its own lane", async ({
        page,
    }) => {
        test.setTimeout(180000)
        const canvas = await runTool(
            page,
            "restructure_diagram",
            {
                operations: [
                    {
                        op: "add_pool",
                        id: "p",
                        label: "Expense claim",
                        lanes: ["Employee", "Manager", "Finance"],
                        phases: ["Submit", "Review", "Pay"],
                    },
                    {
                        op: "add_box",
                        id: "fill",
                        parent: "p",
                        label: "Fill form",
                        lane: 0,
                        col: 0,
                    },
                    {
                        op: "add_box",
                        id: "rev",
                        parent: "p",
                        label: "Review claim",
                        lane: 1,
                        col: 1,
                    },
                    {
                        op: "add_box",
                        id: "pay",
                        parent: "p",
                        label: "Pay out",
                        lane: 2,
                        col: 2,
                    },
                    { op: "link", source: "fill", target: "rev" },
                    { op: "link", source: "rev", target: "pay" },
                ],
            },
            "Draw the expense approval swimlane",
        )

        for (const label of [
            "Expense claim",
            "Employee",
            "Manager",
            "Finance",
            "Submit",
            "Fill form",
            "Review claim",
            "Pay out",
        ])
            await expect(
                canvas.getByText(label, { exact: true }).first(),
                `"${label}" should be on the canvas`,
            ).toBeVisible({ timeout: 30000 })

        const xml = await exportXml(page)
        // A step is parented to its lane band, which is what records a role change when the
        // user drags it to another lane.
        expect(xml).toMatch(/id="fill"[^>]*parent="p__band0"/)
        expect(xml).toMatch(/id="pay"[^>]*parent="p__band2"/)
        expect(xml).toContain("dai_lanes=")
    })
})

test.describe("sequence diagram", () => {
    test("renders lifelines with messages in step order", async ({ page }) => {
        test.setTimeout(180000)
        const canvas = await runTool(
            page,
            "restructure_diagram",
            {
                operations: [
                    { op: "add_sequence", id: "s", label: "Login flow" },
                    { op: "add_box", id: "u", parent: "s", label: "User" },
                    { op: "add_box", id: "api", parent: "s", label: "API" },
                    { op: "add_box", id: "db", parent: "s", label: "Database" },
                    {
                        op: "link",
                        source: "u",
                        target: "api",
                        label: "log in",
                        step: 1,
                    },
                    {
                        op: "link",
                        source: "api",
                        target: "db",
                        label: "find user",
                        step: 2,
                    },
                    {
                        op: "link",
                        source: "db",
                        target: "api",
                        label: "record",
                        step: 3,
                    },
                    {
                        op: "link",
                        source: "api",
                        target: "u",
                        label: "token",
                        step: 4,
                    },
                ],
            },
            "Draw the login sequence",
        )

        for (const label of [
            "Login flow",
            "User",
            "API",
            "Database",
            "1. log in",
            "4. token",
        ])
            await expect(
                canvas.getByText(label, { exact: true }).first(),
                `"${label}" should be on the canvas`,
            ).toBeVisible({ timeout: 30000 })

        const xml = await exportXml(page)
        // draw.io kept the lifeline shape — a style it did not understand would come back
        // stripped or as a plain rectangle.
        expect(xml).toMatch(/id="u"[^>]*shape=umlLifeline/)
        expect((xml.match(/shape=umlLifeline/g) ?? []).length).toBe(3)
    })
})

test.describe("mind map and org chart", () => {
    test("renders a mind map with branches on both sides", async ({ page }) => {
        test.setTimeout(180000)
        const canvas = await runTool(
            page,
            "restructure_diagram",
            {
                operations: [
                    { op: "add_radial", id: "m", label: "", spread: "radial" },
                    {
                        op: "add_box",
                        id: "root",
                        parent: "m",
                        label: "Product Launch",
                    },
                    {
                        op: "add_box",
                        id: "eng",
                        parent: "m",
                        label: "Engineering",
                    },
                    {
                        op: "add_box",
                        id: "api",
                        parent: "m",
                        label: "API work",
                    },
                    {
                        op: "add_box",
                        id: "mkt",
                        parent: "m",
                        label: "Marketing",
                    },
                    { op: "add_box", id: "legal", parent: "m", label: "Legal" },
                    { op: "link", source: "root", target: "eng" },
                    { op: "link", source: "root", target: "mkt" },
                    { op: "link", source: "root", target: "legal" },
                    { op: "link", source: "eng", target: "api" },
                ],
            },
            "Draw a product launch mind map",
        )

        for (const label of [
            "Product Launch",
            "Engineering",
            "API work",
            "Marketing",
            "Legal",
        ])
            await expect(
                canvas.getByText(label, { exact: true }).first(),
                `"${label}" should be on the canvas`,
            ).toBeVisible({ timeout: 30000 })

        const xml = await exportXml(page)
        expect(xml).toContain("dai_spread=radial")
    })

    test("renders an org chart hanging downwards", async ({ page }) => {
        test.setTimeout(180000)
        const canvas = await runTool(
            page,
            "restructure_diagram",
            {
                operations: [
                    { op: "add_radial", id: "o", label: "", spread: "down" },
                    { op: "add_box", id: "ceo", parent: "o", label: "CEO" },
                    { op: "add_box", id: "cto", parent: "o", label: "CTO" },
                    {
                        op: "add_box",
                        id: "lead",
                        parent: "o",
                        label: "Platform Lead",
                    },
                    { op: "add_box", id: "cfo", parent: "o", label: "CFO" },
                    { op: "link", source: "ceo", target: "cto" },
                    { op: "link", source: "ceo", target: "cfo" },
                    { op: "link", source: "cto", target: "lead" },
                ],
            },
            "Draw the org chart",
        )

        for (const label of ["CEO", "CTO", "Platform Lead", "CFO"])
            await expect(
                canvas.getByText(label, { exact: true }).first(),
                `"${label}" should be on the canvas`,
            ).toBeVisible({ timeout: 30000 })

        const xml = await exportXml(page)
        expect(xml).toContain("dai_spread=down")
        // Each level strictly below the one above — a reporting line drawn any other way
        // reads as the wrong relationship. Geometry is parent-relative and all four share the
        // same parent, so the values are directly comparable.
        expect(cellY(xml, "ceo")).toBeLessThan(cellY(xml, "cto"))
        expect(cellY(xml, "cto")).toBeLessThan(cellY(xml, "lead"))
        expect(cellY(xml, "cto")).toBe(cellY(xml, "cfo"))
    })
})
