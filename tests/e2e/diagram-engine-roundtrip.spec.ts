/**
 * The closed loop, in a real browser: engine → draw.io → user drags something → engine
 * reads the structure back.
 *
 * The unit tests prove render and parse agree with each other. This proves they agree
 * with the actual editor: that the XML the engine writes renders, that a frame really
 * accepts a drop, and that the structure recovered afterwards matches what the user did
 * on screen.
 *
 * The engine runs in the test process (Playwright transpiles the spec, so the TypeScript
 * imports resolve); only XML strings cross into the page.
 */
import { expect, test } from "@playwright/test"
import { parseDiagram } from "../../lib/diagram-engine/parse"
import { renderDiagram } from "../../lib/diagram-engine/render"
import { type DiagramTree, findParent } from "../../lib/diagram-engine/types"

/** Two frames side by side; MOVER starts in the left one. */
function twoFrames(extraLeft: string[] = []): DiagramTree {
    return {
        roots: [
            {
                kind: "group",
                id: "root",
                gname: null,
                label: "Root",
                dir: "row",
                gap: 60,
                children: [
                    {
                        kind: "group",
                        id: "left",
                        gname: null,
                        label: "Left",
                        dir: "col",
                        gap: 20,
                        children: [
                            { kind: "box", id: "mover", label: "MOVER" },
                            ...extraLeft.map((id) => ({
                                kind: "box" as const,
                                id,
                                label: id.toUpperCase(),
                            })),
                        ],
                    },
                    {
                        kind: "group",
                        id: "right",
                        gname: null,
                        label: "Right",
                        dir: "col",
                        gap: 20,
                        children: [
                            { kind: "box", id: "anchor", label: "ANCHOR" },
                        ],
                    },
                ],
            },
        ],
        links: [],
        foreign: [],
    }
}

async function loadAndWatch(
    page: import("@playwright/test").Page,
    xml: string,
) {
    await page.evaluate(() => {
        const w = window as unknown as { __xml?: string[] }
        w.__xml = []
        window.addEventListener("message", (e: MessageEvent) => {
            if (typeof e.data !== "string") return
            try {
                const m = JSON.parse(e.data)
                if ((m.event === "autosave" || m.event === "save") && m.xml)
                    w.__xml?.push(m.xml)
            } catch {
                /* not our message */
            }
        })
    })
    await page.evaluate((x) => {
        const iframe = document.querySelector("iframe") as HTMLIFrameElement
        iframe.contentWindow?.postMessage(
            JSON.stringify({ action: "load", xml: x, autosave: 1 }),
            "*",
        )
    }, xml)
    await page.waitForTimeout(4000)
}

const lastXml = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
        const w = window as unknown as { __xml?: string[] }
        const a = w.__xml ?? []
        return a.length ? a[a.length - 1] : null
    })

const parentAttr = (xml: string, id: string) =>
    xml
        .match(new RegExp(`<mxCell[^>]*\\bid="${id}"[^>]*>`))?.[0]
        .match(/\bparent="([^"]*)"/)?.[1] ?? null

/** Drag the cell labelled `from` into the frame that holds the cell labelled `into`. */
async function dragInto(
    page: import("@playwright/test").Page,
    from: string,
    into: string,
) {
    const canvas = page.frameLocator("iframe")
    const src = canvas.getByText(from, { exact: true }).first()
    await src.waitFor({ state: "visible", timeout: 30000 })
    const dst = canvas.getByText(into, { exact: true }).first()
    await dst.waitFor({ state: "visible", timeout: 30000 })
    const sb = await src.boundingBox()
    const db = await dst.boundingBox()
    if (!sb || !db) throw new Error("cells not rendered")

    // Drop below the anchor: inside the target frame, but not on top of the anchor.
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await page.mouse.down()
    await page.mouse.move(sb.x + sb.width / 2 + 20, sb.y + 10, { steps: 8 })
    await page.mouse.move(db.x + db.width / 2, db.y + db.height + 30, {
        steps: 30,
    })
    await page.waitForTimeout(800)
    await page.mouse.up()
    await page.waitForTimeout(3000)
}

test.describe("diagram engine, end to end", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 60000 })
        await page.waitForTimeout(6000)
    })

    test("engine output renders, and a drop into a frame becomes structure", async ({
        page,
    }) => {
        test.setTimeout(180000)

        const { xml } = renderDiagram(twoFrames())
        expect(xml).toContain("container=1")
        await loadAndWatch(page, xml)

        await dragInto(page, "MOVER", "ANCHOR")

        const after = await lastXml(page)
        expect(after, "editor emitted no autosave after the drag").toBeTruthy()
        if (!after) return

        // draw.io reparented it, because the frame carries container=1.
        expect(parentAttr(after, "mover")).toBe("right")

        // ...and the engine reads the user's change back as structure. There is no
        // second copy of the state, so nothing to reconcile.
        const { tree, needsAdoption } = parseDiagram(after)
        expect(findParent(tree, "mover")?.id).toBe("right")
        expect(findParent(tree, "anchor")?.id).toBe("right")
        expect(needsAdoption).toBe(false) // markers survived the editor
    })

    test("a re-layout after the drag keeps the node in its new frame", async ({
        page,
    }) => {
        test.setTimeout(180000)

        const { xml } = renderDiagram(twoFrames(["stay"]))
        await loadAndWatch(page, xml)
        await dragInto(page, "MOVER", "ANCHOR")

        const after = await lastXml(page)
        expect(after).toBeTruthy()
        if (!after) return

        const afterDrag = parseDiagram(after).tree
        expect(findParent(afterDrag, "mover")?.id).toBe("right")

        // Re-lay-out from what the canvas says, then read it back: the user's move is
        // preserved rather than undone, and the node they did not touch stays put.
        const relaid = parseDiagram(renderDiagram(afterDrag).xml).tree
        expect(findParent(relaid, "mover")?.id).toBe("right")
        expect(findParent(relaid, "stay")?.id).toBe("left")
    })

    test("the re-laid-out diagram still renders in the editor", async ({
        page,
    }) => {
        test.setTimeout(180000)

        // Guards against the engine emitting XML that parses fine but the editor
        // rejects — geometry the wrong side of a parent, a forward reference, and so on.
        const first = renderDiagram(twoFrames(["stay"]))
        const relaid = renderDiagram(parseDiagram(first.xml).tree)

        await loadAndWatch(page, relaid.xml)
        const canvas = page.frameLocator("iframe")
        for (const label of ["MOVER", "STAY", "ANCHOR", "Left", "Right"]) {
            await expect(
                canvas.getByText(label, { exact: true }).first(),
            ).toBeVisible({ timeout: 20000 })
        }
    })
})
