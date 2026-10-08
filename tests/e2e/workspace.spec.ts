import type { Locator, Page, Route } from "@playwright/test"
import { FLOWCHART_XML } from "./fixtures/diagrams"
import {
    expect,
    getAttachmentInput,
    getChatInput,
    getIframe,
    getIframeContent,
    getSendButton,
    openDrawioFile,
    openSettingsTab,
    sendMessage,
    test,
    waitForComplete,
    waitForCompleteCount,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

/** An edit_diagram response that adds one node next to "Start" */
function createEditResponse() {
    const toolCallId = `call_edit_${Date.now()}`
    const newNode = `<mxCell id="review" value="Review Step" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="360" y="130" width="100" height="40" as="geometry"/></mxCell>`
    const events = [
        { type: "start", messageId: `msg_${Date.now()}` },
        { type: "tool-input-start", toolCallId, toolName: "edit_diagram" },
        {
            type: "tool-input-available",
            toolCallId,
            toolName: "edit_diagram",
            input: {
                operations: [
                    { operation: "add", cell_id: "review", new_xml: newNode },
                ],
            },
        },
        { type: "finish" },
    ]
    return (
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
        "data: [DONE]\n\n"
    )
}

/** First request draws the flowchart, later ones add a node */
function drawThenEdit(onRequest?: (body: any) => void) {
    let count = 0
    return async (route: Route) => {
        onRequest?.(route.request().postDataJSON())
        const body =
            count === 0
                ? createMockSSEResponse(FLOWCHART_XML, "Here is the flowchart.")
                : createEditResponse()
        count++
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body,
        })
    }
}

async function openApp(page: Page) {
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    // The cover goes away once draw.io has loaded and been styled
    await expect(page.locator('[data-testid="canvas-loading"]')).toHaveCount(
        0,
        {
            timeout: 30000,
        },
    )
}

// A page with a name and a background, and no shapes
const BLANK_SHEET =
    '<mxfile><diagram name="Sheet" id="s"><mxGraphModel background="#ffeecc"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'

const TWO_PAGE_FILE = `<mxfile>${["Old A", "Old B"]
    .map(
        (label, i) =>
            `<diagram name="P${i}" id="p${i}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="c${i}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram>`,
    )
    .join("")}</mxfile>`

/** When each saved chat was last saved, by title */
function sessionTimes(page: Page) {
    return page.evaluate(async () => {
        const db: IDBDatabase = await new Promise((resolve) => {
            const request = indexedDB.open("next-ai-drawio")
            request.onsuccess = () => resolve(request.result)
        })
        const sessions: any[] = await new Promise((resolve) => {
            const request = db
                .transaction("sessions")
                .objectStore("sessions")
                .getAll()
            request.onsuccess = () => resolve(request.result)
        })
        db.close()
        return Object.fromEntries(sessions.map((s) => [s.title, s.updatedAt]))
    })
}

/** Where an element is laid out (fails the test when it is not) */
async function boxOf(locator: Locator) {
    const box = await locator.boundingBox()
    if (!box) throw new Error("element is not laid out")
    return box
}

/** draw.io's own Undo button: draw.io sets "disabled" with nothing to undo */
function drawioUndo(page: Page) {
    return getIframeContent(page).locator('.geSimpleMainMenu a[title="Undo"]')
}

/** draw.io's own page tabs */
function drawioTabs(page: Page) {
    return getIframeContent(page).locator(".geTabContainer")
}

/** How wide the paper shows on screen, which changes with the zoom */
function paperWidth(page: Page) {
    return getIframeContent(page)
        .locator(".geBackgroundPage")
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().width))
}

/** Zooms with draw.io's own shortcut, the focus in an empty canvas corner */
async function zoomCanvas(page: Page, direction: "in" | "out") {
    await getIframeContent(page)
        .locator(".geDiagramContainer")
        .click({ position: { x: 20, y: 20 } })
    await page.keyboard.press(
        direction === "in" ? "ControlOrMeta+Equal" : "ControlOrMeta+Minus",
    )
}

async function drawAndEdit(page: Page) {
    await sendMessage(page, "Create a flowchart")
    await waitForComplete(page)
    await sendMessage(page, "Add a review step")
    await waitForCompleteCount(page, 2)
}

test.describe("Workspace", () => {
    test("start screen shows on an empty canvas and examples fill the input", async ({
        page,
    }) => {
        await openApp(page)
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
        await page.locator('[data-testid="example-cat"]').click()
        await expect(getChatInput(page)).toHaveValue("Draw a cat for me")
    })

    test("each AI change becomes a version card; the latest undoes and redoes it", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await drawAndEdit(page)

        const cards = page.locator('[data-testid="version-card"]')
        await expect(cards).toHaveCount(2)
        await expect(cards.nth(1)).toContainText("v2")
        // Only the added shape counts: the others kept their XML as saved
        await expect(cards.nth(1)).toContainText("Added 1 shape")
        await expect(cards.nth(1)).not.toContainText("changed")
        await expect(page.locator('[data-testid="version-thumb"]')).toHaveCount(
            2,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await page.locator('[data-testid="version-undo"]').click()
        await expect(canvas.getByText("Review Step")).toHaveCount(0)
        await expect(page.getByText("Change undone")).toBeVisible()

        await page.locator('[data-testid="version-undo"]').click()
        await expect(canvas.getByText("Review Step")).toBeVisible()
    })

    test("an older version card still shows and copies the AI's XML", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await drawAndEdit(page)
        const older = page.locator('[data-testid="version-card"]').first()
        await older.getByRole("button", { name: "Show XML" }).click()
        await expect(older).toContainText('value="Start"')
        await expect(
            older.getByRole("button", { name: "Copy response" }),
        ).toBeVisible()
        await older.getByRole("button", { name: "Hide XML" }).click()
        await expect(older).not.toContainText('value="Start"')
    })

    test("a renamed diagram keeps its name after reload", async ({ page }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)

        await page.locator('[data-testid="session-title"]').click()
        await page.locator('[data-testid="rename-session"]').click()
        const input = page.getByRole("textbox", { name: "Rename" })
        await input.fill("Order flow")
        await input.press("Enter")
        await page.keyboard.press("Escape")
        await expect(
            page.locator('[data-testid="session-title"]'),
        ).toContainText("Order flow")

        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(1500)
        await page.reload({ waitUntil: "networkidle" })
        await expect(
            page.locator('[data-testid="session-title"]'),
        ).toContainText("Order flow", { timeout: 15000 })
        await expect(page.locator('[data-testid="version-card"]')).toHaveCount(
            1,
        )
    })

    test("opening a .drawio file loads it into a new diagram", async ({
        page,
    }) => {
        await openApp(page)
        const file = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="From File" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
        const [chooser] = await Promise.all([
            page.waitForEvent("filechooser"),
            page
                .getByRole("button", { name: "Open .drawio file" })
                .first()
                .click(),
        ])
        await chooser.setFiles({
            name: "order-flow.drawio",
            mimeType: "application/xml",
            buffer: Buffer.from(file),
        })
        await expect(
            getIframeContent(page).getByText("From File"),
        ).toBeVisible()
        await expect(
            page.locator('[data-testid="session-title"]'),
        ).toContainText("order-flow")
    })

    test("a file with a comment or DOCTYPE before its root opens", async ({
        page,
    }) => {
        await openApp(page)
        await openDrawioFile(
            page,
            "commented.drawio",
            `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Architecture, v2 -->\n<!DOCTYPE mxfile>\n<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Commented" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`,
        )
        await expect(
            getIframeContent(page).getByText("Commented"),
        ).toBeVisible()
    })

    test("attachments do not go through the file opener", async ({ page }) => {
        await openApp(page)
        await getAttachmentInput(page).setInputFiles({
            name: "notes.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("hello"),
        })
        await expect(page.getByText("notes.txt")).toBeVisible()
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
    })

    test("an error shows its text and can be retried", async ({ page }) => {
        let calls = 0
        await page.route("**/api/chat", async (route) => {
            calls++
            if (calls === 1) {
                await route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "Model is overloaded" }),
                })
                return
            }
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(FLOWCHART_XML, "Here it is."),
            })
        })
        await openApp(page)
        await sendMessage(page, "Create a flowchart")

        const alert = page
            .getByRole("alert")
            .filter({ hasText: "Model is overloaded" })
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert).not.toContainText("{")
        await page.locator('[data-testid="retry-button"]').click()
        await waitForComplete(page)
        expect(calls).toBe(2)
    })

    test("a file opened inside a saved diagram stays on the canvas", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        // The auto-save gives the chat a session first
        await expect(page).toHaveURL(/session=/, { timeout: 10000 })
        const file = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="From File" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
        await openDrawioFile(page, "mine.drawio", file)
        await page.waitForTimeout(1500)
        await expect(
            getIframeContent(page).getByText("From File"),
        ).toBeVisible()
    })

    test("Ctrl+B in the canvas stays with draw.io", async ({ page }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await getIframeContent(page)
            .getByText("Process", { exact: true })
            .click()
        await page.keyboard.press("ControlOrMeta+b")
        await page.waitForTimeout(500)
        await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible()
        // ⌘⇧B outside the canvas stays with the browser too
        await page.locator('[data-testid="session-title"]').focus()
        await page.keyboard.press("ControlOrMeta+Shift+B")
        await page.waitForTimeout(500)
        await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible()
    })

    test("selected shapes are shown, sent, and attached again when picked again", async ({
        page,
    }) => {
        const bodies: any[] = []
        await page.route(
            "**/api/chat",
            drawThenEdit((body) => bodies.push(body)),
        )
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        const shape = getIframeContent(page).getByText("Process", {
            exact: true,
        })
        await shape.click()
        await expect(
            page.locator('[data-testid="selection-chip"]'),
        ).toContainText("Process")
        await expect(
            page.locator('[data-testid="selection-ask"]'),
        ).toBeVisible()
        await sendMessage(page, "Make this red")
        await waitForCompleteCount(page, 2)
        expect(bodies[1].selectedCells).toEqual([
            { id: "process", label: "Process" },
        ])
        // Click away, then pick the same shape
        await page.keyboard.press("Escape")
        await shape.click()
        await expect(
            page.locator('[data-testid="selection-chip"]'),
        ).toContainText("Process")
        await sendMessage(page, "Make it bigger")
        // (Its edit repeats the earlier one, so the retries that follow
        // are requests too)
        await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(3)
        expect(bodies[2].selectedCells).toEqual([
            { id: "process", label: "Process" },
        ])
    })

    test("restoring a version keeps the zoom", async ({ page }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await drawAndEdit(page)
        const initial = await paperWidth(page)
        await zoomCanvas(page, "out")
        await expect.poll(() => paperWidth(page)).not.toBe(initial)
        const before = await paperWidth(page)
        await page.locator('[data-testid="version-restore"]').first().click()
        await page.waitForTimeout(800)
        // (A zoom step changes it by about 15%)
        expect(Math.abs((await paperWidth(page)) - before)).toBeLessThan(3)
        await expect(page.getByText("Restored v1")).toBeVisible()
    })

    test("other diagrams can't be opened while an answer streams", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await page.waitForTimeout(1500)
        await page.locator('[data-testid="new-chat-button"]').click()
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
        // An answer that takes a while
        await page.unroute("**/api/chat")
        await page.route("**/api/chat", async (route) => {
            await new Promise((r) => setTimeout(r, 4000))
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(FLOWCHART_XML, "Second one."),
            })
        })
        await sendMessage(page, "Create another flowchart")
        await page.locator('[data-testid="session-title"]').click()
        const other = page.getByRole("button", { name: /Create a flowchart/ })
        await expect(other).toHaveAttribute("aria-disabled", "true")
        await other.click({ force: true })
        await waitForComplete(page)
        await expect(page.getByText("Second one.")).toBeVisible()
    })

    test("draw.io's shape library starts closed", async ({ page }) => {
        await openApp(page)
        await page.locator('[data-testid="draw-yourself"]').click()
        await page.waitForTimeout(800)
        const library = getIframeContent(page).locator(
            ".geSidebarContainer:not(.geFormatContainer)",
        )
        expect(
            await library.evaluate((el) => (el as HTMLElement).clientWidth),
        ).toBe(0)
    })

    test("draw.io's Insert menu offers auto layout, Mermaid and CSV import", async ({
        page,
    }) => {
        await openApp(page)
        await page.locator('[data-testid="draw-yourself"]').click()
        const canvas = getIframeContent(page)
        await canvas.locator('.geSimpleMainMenu a[title="Insert"]').click()
        const menus = canvas.locator(".mxPopupMenu")
        await expect(
            menus.first().getByText("Mermaid...", { exact: true }),
        ).toBeVisible()
        await menus.first().getByText("Layout", { exact: true }).click()
        await expect(
            menus.last().getByText("Vertical Tree...", { exact: true }),
        ).toBeVisible()
        await menus.first().getByText("Advanced", { exact: true }).click()
        await expect(
            menus.last().getByText("CSV...", { exact: true }),
        ).toBeVisible()
    })

    test("draw.io follows the app's dark mode, switched without a reload", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem("next-ai-draw-io-dark-mode", "true")
        })
        await openApp(page)
        // A mark on draw.io's window: a reload would make a new window
        const drawio = (mark = false) =>
            getIframe(page).evaluate((el, mark) => {
                const w = (el as HTMLIFrameElement).contentWindow as any
                if (mark) w.__naiMark = 1
                return { dark: w.Editor.isDarkMode(), mark: w.__naiMark }
            }, mark)
        expect((await drawio(true)).dark).toBe(true)
        await openSettingsTab(page, "general")
        const dialog = page.getByRole("dialog")
        await dialog.getByRole("radio", { name: "Light" }).click()
        await expect.poll(() => drawio()).toEqual({ dark: false, mark: 1 })
        await dialog.getByRole("radio", { name: "Dark" }).click()
        await expect.poll(() => drawio()).toEqual({ dark: true, mark: 1 })
    })

    test("the table around the sheet follows a theme switched either way", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            if (sessionStorage.getItem("nai-seeded")) return
            sessionStorage.setItem("nai-seeded", "1")
            localStorage.setItem("next-ai-draw-io-dark-mode", "false")
        })
        await openApp(page)
        await page.locator('[data-testid="draw-yourself"]').click()
        const table = () =>
            getIframeContent(page)
                .locator(".geDiagramContainer")
                .evaluate((el) => getComputedStyle(el).backgroundColor)
        const light = await table()
        await openSettingsTab(page, "general")
        const dialog = page.getByRole("dialog")
        await dialog.getByRole("radio", { name: "Dark" }).click()
        // draw.io's own dark table
        await expect.poll(table).toBe("rgb(27, 29, 30)")
        await dialog.getByRole("radio", { name: "Light" }).click()
        await expect.poll(table).toBe(light)
        await page.keyboard.press("Escape")
        // Started dark, switched to light
        await page.evaluate(() =>
            localStorage.setItem("next-ai-draw-io-dark-mode", "true"),
        )
        await page.reload({ waitUntil: "networkidle" })
        await expect(
            page.locator('[data-testid="canvas-loading"]'),
        ).toHaveCount(0, { timeout: 30000 })
        await expect.poll(table).toBe("rgb(27, 29, 30)")
        await openSettingsTab(page, "general")
        await page
            .getByRole("dialog")
            .getByRole("radio", { name: "Light" })
            .click()
        await expect.poll(table).toBe(light)
    })

    test("selecting shapes adds no more listeners to draw.io", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        // The editor, from the next call of one of its methods
        await getIframe(page).evaluate((el) => {
            const w = (el as HTMLIFrameElement).contentWindow as any
            const proto = w.EditorUi.prototype
            const original = proto.updateActionStates
            proto.updateActionStates = function (...args: unknown[]) {
                w.__ui = this
                return original.apply(this, args)
            }
        })
        const canvas = getIframeContent(page)
        // draw.io's own parts listen too
        const count = () =>
            getIframe(page).evaluate((el) => {
                const w = (el as HTMLIFrameElement).contentWindow as any
                return (w.__ui.eventListeners as unknown[]).filter(
                    (item) => item === "darkModeChanged",
                ).length
            })
        await canvas.getByText("Start", { exact: true }).click()
        const before = await count()
        for (const label of ["Process", "End", "Process", "Start"]) {
            await canvas.getByText(label, { exact: true }).click()
        }
        expect(await count()).toBe(before)
    })

    test("draw.io keeps the app's theme when the system's changes", async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: "light" })
        await page.addInitScript(() => {
            localStorage.setItem("next-ai-draw-io-dark-mode", "false")
        })
        await openApp(page)
        const drawioDark = () =>
            getIframe(page).evaluate((el) =>
                (
                    (el as HTMLIFrameElement).contentWindow as any
                ).Editor.isDarkMode(),
            )
        expect(await drawioDark()).toBe(false)
        await page.emulateMedia({ colorScheme: "dark" })
        await page.waitForTimeout(1000)
        expect(await drawioDark()).toBe(false)
        await expect(page.locator("html")).not.toHaveClass(/dark/)
    })

    test("a reloaded chat shows its paper in the middle of the canvas", async ({
        page,
    }) => {
        // Wide enough for draw.io to open its shape library on start
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(1500)
        await page.reload({ waitUntil: "networkidle" })
        await expect(
            page.locator('[data-testid="canvas-loading"]'),
        ).toHaveCount(0, { timeout: 30000 })
        await expect(
            getIframeContent(page).getByText("Process", { exact: true }),
        ).toBeVisible()
        await page.waitForTimeout(1000)
        const stage = await boxOf(page.locator('[data-testid="canvas-stage"]'))
        const paper = await boxOf(
            getIframeContent(page).locator(".geBackgroundPage").first(),
        )
        expect(
            Math.abs(paper.x + paper.width / 2 - (stage.x + stage.width / 2)),
        ).toBeLessThan(20)
    })

    test("the ask AI button stays off draw.io's menus and dialogs", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        const canvas = getIframeContent(page)
        await canvas.getByText("Process", { exact: true }).click()
        const ask = page.locator('[data-testid="selection-ask"]')
        await expect(ask).toBeVisible()
        await canvas.locator('.geSimpleMainMenu a[title="Insert"]').click()
        await expect(canvas.locator(".mxPopupMenu").first()).toBeVisible()
        await expect(ask).toBeHidden()
        // A click on the shape closes the menu and keeps it selected
        await canvas.getByText("Process", { exact: true }).click()
        await expect(canvas.locator(".mxPopupMenu")).toHaveCount(0)
        await expect(ask).toBeVisible()
        // The shape picker next to the selection (its arrows open it)
        await getIframe(page).evaluate((el) => {
            const w = (el as HTMLIFrameElement).contentWindow as any
            const proto = w.EditorUi.prototype
            const original = proto.updateActionStates
            proto.updateActionStates = function (...args: unknown[]) {
                w.__ui = this
                return original.apply(this, args)
            }
        })
        await canvas.getByText("Start", { exact: true }).click()
        await canvas.getByText("Process", { exact: true }).click()
        await expect(ask).toBeVisible()
        await getIframe(page).evaluate((el) => {
            const w = (el as HTMLIFrameElement).contentWindow as any
            w.__ui.showShapePicker(300, 200)
        })
        await expect(canvas.locator(".geShapePicker")).toBeVisible()
        await expect(ask).toBeHidden()
        await getIframe(page).evaluate((el) => {
            const w = (el as HTMLIFrameElement).contentWindow as any
            w.__ui.hideShapePicker()
        })
        await expect(ask).toBeVisible()
        // A dialog: Edit Style
        await page.keyboard.press("ControlOrMeta+e")
        await expect(canvas.locator(".geDialog").first()).toBeVisible()
        await expect(ask).toBeHidden()
    })

    test("with the chat panel hidden, draw.io's right-hand buttons can be clicked", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await page.getByRole("button", { name: "Hide chat panel" }).click()
        const show = page.locator('[data-testid="show-panel"]')
        await expect(show).toBeVisible()
        await page.waitForTimeout(600)
        const canvas = getIframeContent(page)
        const chip = await boxOf(show.locator(".."))
        for (const title of [
            "Diagram",
            "Format (⌘+⇧+P)",
            "Format (Ctrl+Shift+P)",
        ]) {
            const button = canvas.locator(
                `.geSimpleMainMenu a[title="${title}"]`,
            )
            if ((await button.count()) === 0) continue
            const box = await boxOf(button)
            const overlaps =
                box.x < chip.x + chip.width &&
                chip.x < box.x + box.width &&
                box.y < chip.y + chip.height &&
                chip.y < box.y + box.height
            expect(overlaps, title).toBe(false)
        }
        await canvas
            .locator('.geSimpleMainMenu a[title="Diagram"]')
            .click({ timeout: 3000 })
        await expect(canvas.locator(".mxPopupMenu").first()).toBeVisible()
    })

    test("resizing the window leaves draw.io's style panel closed", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        const formatWidth = () =>
            getIframeContent(page)
                .locator(".geFormatContainer")
                .evaluate((el) => (el as HTMLElement).offsetWidth)
        expect(await formatWidth()).toBe(0)
        // draw.io's own rule opens it when its window gets wide again
        await page.setViewportSize({ width: 1000, height: 800 })
        await page.waitForTimeout(600)
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.waitForTimeout(1500)
        expect(await formatWidth()).toBe(0)
    })

    test("crossing the phone width keeps draw.io and its undo history", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        // A mark on draw.io's window: a reload would make a new window
        const mark = (set: boolean) =>
            getIframe(page).evaluate((el, set) => {
                const w = (el as HTMLIFrameElement).contentWindow as any
                if (set) w.__naiMark = 1
                return w.__naiMark
            }, set)
        await mark(true)
        await page.setViewportSize({ width: 700, height: 800 })
        await page.waitForTimeout(800)
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.waitForTimeout(800)
        expect(await mark(false)).toBe(1)
        await expect(drawioUndo(page)).not.toHaveAttribute("disabled")
    })

    test("Ctrl+Z in the canvas undoes the AI change in one step; the card follows undo and redo", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await drawAndEdit(page)
        await expect(
            page.locator('[data-testid="version-card"] img'),
        ).toHaveCount(2)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(1500)
        const canvas = getIframeContent(page)
        await canvas
            .locator(".geDiagramContainer")
            .click({ position: { x: 10, y: 10 } })
        await page.keyboard.press("ControlOrMeta+z")
        await expect(canvas.getByText("Review Step")).toHaveCount(0)
        await expect(
            canvas.getByText("Process", { exact: true }).first(),
        ).toBeVisible()
        // The card says v2's change is undone, as its own Undo would
        const button = page
            .locator('[data-testid="version-card"]')
            .nth(1)
            .locator('[data-testid="version-undo"]')
        await expect(button).toHaveText("Redo change")
        // Redo in the canvas puts v2 back on it
        await page.keyboard.press("ControlOrMeta+Shift+z")
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await expect(button).toHaveText("Undo change")
        await page.keyboard.press("ControlOrMeta+z")
        await expect(button).toHaveText("Redo change")
        await button.click()
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await expect(button).toHaveText("Undo change")
    })

    test("past 20 versions the numbers stay; a compare open on the dropped one lets go", async ({
        page,
    }) => {
        const boxFile = (label: string) =>
            `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="b" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="400" y="300" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
        await page.route("**/api/chat", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 1500))
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(FLOWCHART_XML, "Flowchart."),
            })
        })
        await openApp(page)
        // A chat that already has 20 versions
        await page.evaluate(
            async ({ versions, diagramXml }) => {
                const db: IDBDatabase = await new Promise((resolve) => {
                    const request = indexedDB.open("next-ai-drawio")
                    request.onsuccess = () => resolve(request.result)
                })
                const now = Date.now()
                await new Promise((resolve) => {
                    const tx = db.transaction("sessions", "readwrite")
                    tx.objectStore("sessions").put({
                        id: "many",
                        title: "Many versions",
                        createdAt: now,
                        updatedAt: now,
                        messages: [
                            {
                                id: "u1",
                                role: "user",
                                parts: [{ type: "text", text: "Draw boxes" }],
                            },
                            {
                                id: "a1",
                                role: "assistant",
                                parts: [{ type: "text", text: "Boxes." }],
                            },
                        ],
                        xmlSnapshots: [],
                        diagramXml,
                        versions,
                    })
                    tx.oncomplete = resolve
                })
                db.close()
            },
            {
                versions: Array.from({ length: 20 }, (_, i) => ({
                    id: `v${i + 1}`,
                    number: i + 1,
                    xml: boxFile(`Box ${i + 1}`),
                    svg: "",
                    turnIndex: 0,
                    summary: {
                        shapesAdded: 0,
                        shapesRemoved: 0,
                        shapesChanged: 1,
                        edgesAdded: 0,
                        edgesRemoved: 0,
                        edgesChanged: 0,
                    },
                })),
                diagramXml: boxFile("Box 20"),
            },
        )
        await page.goto("/?session=many", { waitUntil: "networkidle" })
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Box 20")).toBeVisible({ timeout: 30000 })
        const thumbs = page.locator('[data-testid="version-thumb"]')
        await expect(thumbs).toHaveCount(20)

        // Compare v1 while the next answer is on its way
        await sendMessage(page, "Draw a flowchart")
        await thumbs.first().click()
        await expect(page.getByRole("dialog")).toBeVisible()
        await waitForComplete(page)
        await expect(page.getByRole("dialog")).toHaveCount(0)
        await expect(thumbs.first()).toContainText("v2")
        await expect(thumbs.last()).toContainText("v21")
        await expect(
            page.locator('[data-testid="version-card"]').last(),
        ).toContainText("v21")

        // The first Escape in the canvas is draw.io's again: it ends editing
        await canvas.getByText("Start", { exact: true }).dblclick()
        await expect(canvas.locator(".mxCellEditor")).toBeVisible()
        await page.keyboard.press("Escape")
        await expect(canvas.locator(".mxCellEditor:visible")).toHaveCount(0)
    })

    test("a drawing cut off by a dropped connection shows as failed, with Retry", async ({
        page,
    }) => {
        // The stream ends in the middle of the tool call
        const events = [
            { type: "start", messageId: "m1" },
            {
                type: "tool-input-start",
                toolCallId: "d1",
                toolName: "display_diagram",
            },
            {
                type: "tool-input-delta",
                toolCallId: "d1",
                inputTextDelta: '{"xml":"<mxCell id=\\"a\\"',
            },
        ]
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: events
                    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
                    .join(""),
            }),
        )
        await openApp(page)
        await sendMessage(page, "Draw")
        await expect(getSendButton(page)).toBeVisible({ timeout: 15000 })
        // Not "Stopped": the user did not stop it
        await expect(
            page.getByText("This attempt failed", { exact: true }),
        ).toBeVisible()
        await expect(page.getByText("Stopped", { exact: true })).toHaveCount(0)
        await expect(page.getByText("Drawing the diagram…")).toHaveCount(0)
        await expect(
            page.getByText("The answer ended before the diagram was finished."),
        ).toBeVisible()
        await expect(page.locator('[data-testid="retry-button"]')).toBeVisible()
    })

    test("a short window keeps the send button on screen with a long message", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await page.setViewportSize({ width: 1280, height: 320 })
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await getChatInput(page).fill(
            Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"),
        )
        const send = await boxOf(getSendButton(page))
        expect(send.y + send.height).toBeLessThanOrEqual(320)
    })

    test("settings put their sections on top in the phone layout", async ({
        page,
    }) => {
        // Below 768 px the app shows the phone layout, with the canvas hidden
        await page.setViewportSize({ width: 720, height: 800 })
        await page.goto("/", { waitUntil: "networkidle" })
        await page.locator('[data-testid="settings-button"]').first().click()
        const models = page.locator('[data-testid="settings-tab-models"]')
        const general = page.locator('[data-testid="settings-tab-general"]')
        await expect(models).toBeVisible()
        // Once fonts and the dialog's opening are done
        await expect
            .poll(async () =>
                Math.abs((await boxOf(models)).y - (await boxOf(general)).y),
            )
            .toBeLessThan(2)
        // From 768 px on they are beside the page, one under the other
        await page.setViewportSize({ width: 900, height: 800 })
        await expect
            .poll(
                async () => (await boxOf(general)).y - (await boxOf(models)).y,
            )
            .toBeGreaterThan(20)
    })

    test("New chat brings the start screen back", async ({ page }) => {
        await openApp(page)
        await page.locator('[data-testid="draw-yourself"]').click()
        await expect(page.locator('[data-testid="lobby-hero"]')).toHaveCount(0)
        await page.locator('[data-testid="new-chat-button"]').click()
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
    })

    test("Enter that picks an IME candidate does not end a rename", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await page.locator('[data-testid="session-title"]').click()
        await page.locator('[data-testid="rename-session"]').click()
        const input = page.getByRole("textbox", { name: "Rename" })
        await input.fill("流程")
        await input.dispatchEvent("keydown", {
            key: "Enter",
            isComposing: true,
        })
        await expect(input).toBeVisible()
        // Safari ends the composition first, then sends keyCode 229
        await input.dispatchEvent("keydown", { key: "Enter", keyCode: 229 })
        await expect(input).toBeVisible()
        await input.fill("流程图")
        await input.press("Enter")
        await expect(input).toHaveCount(0)
        await page.keyboard.press("Escape")
        await expect(
            page.locator('[data-testid="session-title"]'),
        ).toContainText("流程图")
    })

    test("the restore message's Undo goes away with the chat", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await drawAndEdit(page)
        await page.locator('[data-testid="version-thumb"]').first().click()
        await page.locator('[data-testid="compare-restore"]').click()
        const toast = page.getByText("Restored v1")
        await expect(toast).toBeVisible()
        await page.locator('[data-testid="new-chat-button"]').click()
        await expect(toast).toHaveCount(0)
    })

    test("a multi-page diagram's AI change can be undone from its card", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await openDrawioFile(page, "two.drawio", TWO_PAGE_FILE)
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Old A")).toBeVisible()
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        // Multi-page documents are loaded in full: the card is the way back
        await page.waitForTimeout(2000)
        await page.locator('[data-testid="version-undo"]').click()
        await expect(canvas.getByText("Old A")).toBeVisible()
        await expect(page.getByText("Change undone")).toBeVisible()
    })

    test("reopening a chat keeps its card's undo and does not save it again", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(2000)
        const updatedAt = () => sessionTimes(page)
        // Leaving the page saves the chat; opening it must not save again
        await page.reload({ waitUntil: "networkidle" })
        await expect(page.locator('[data-testid="version-undo"]')).toBeVisible({
            timeout: 15000,
        })
        const opened = await updatedAt()
        await page.waitForTimeout(3000)
        await expect(page.locator('[data-testid="version-undo"]')).toBeVisible()
        expect(await updatedAt()).toEqual(opened)
    })

    test("restoring from the compare dialog; a new answer takes its Undo away", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await drawAndEdit(page)
        await page.locator('[data-testid="version-thumb"]').first().click()
        await expect(page.getByRole("dialog")).toContainText("Version 1")
        await page.locator('[data-testid="compare-restore"]').click()
        await expect(
            getIframeContent(page).getByText("Review Step"),
        ).toHaveCount(0)
        const toast = page.getByText("Restored v1")
        await expect(toast).toBeVisible()
        await sendMessage(page, "Add a review step")
        await expect(toast).toHaveCount(0)
    })

    test("a broken file leaves the chat on screen", async ({ page }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await openDrawioFile(
            page,
            "cut.drawio",
            '<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Half" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>',
        )
        await expect(
            page.getByText("cut.drawio isn't a draw.io diagram."),
        ).toBeVisible()
        // A page that is neither a model nor draw.io's compressed form
        await openDrawioFile(
            page,
            "packed.drawio",
            '<mxfile><diagram id="p1" name="Broken">not-base64!</diagram></mxfile>',
        )
        await expect(
            page.getByText("packed.drawio isn't a draw.io diagram."),
        ).toBeVisible()
        await expect(page.getByText("Create a flowchart").first()).toBeVisible()
        await expect(page.locator('[data-testid="version-card"]')).toHaveCount(
            1,
        )
    })

    test("a file that is not a diagram leaves the start screen", async ({
        page,
    }) => {
        await openApp(page)
        const [chooser] = await Promise.all([
            page.waitForEvent("filechooser"),
            page
                .getByRole("button", { name: "Open .drawio file" })
                .first()
                .click(),
        ])
        await chooser.setFiles({
            name: "notes.xml",
            mimeType: "application/xml",
            buffer: Buffer.from("<notes><note>hi</note></notes>"),
        })
        await expect(
            page.getByText("notes.xml isn't a draw.io diagram."),
        ).toBeVisible()
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
    })

    test("draw.io loads once when the saved language is another", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem("next-ai-draw-io-locale", "ja")
        })
        // Requests for draw.io's page, also one dropped for a newer frame
        let loads = 0
        page.on("request", (request) => {
            if (new URL(request.url()).pathname.endsWith("/drawio/index.html"))
                loads++
        })
        await page.goto("/en", { waitUntil: "networkidle" })
        await expect(page).toHaveURL(/\/ja/)
        await expect(
            page.locator('[data-testid="canvas-loading"]'),
        ).toHaveCount(0, { timeout: 30000 })
        await page.waitForTimeout(1000)
        expect(loads).toBe(1)
    })

    test("in a small window the chat panel leaves the canvas room and draw.io's toolbar fits", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem("next-ai-draw-io-panel-width", "560")
        })
        await page.setViewportSize({ width: 800, height: 800 })
        await openApp(page)
        await page.locator('[data-testid="draw-yourself"]').click()
        const toolbar = getIframeContent(page).locator(".geSimpleMainMenu")
        await expect(toolbar).toBeVisible()
        await page.waitForTimeout(600)
        const panel = await boxOf(page.locator('[data-testid="chat-panel"]'))
        const stage = await boxOf(page.locator('[data-testid="canvas-stage"]'))
        expect(panel.width).toBeLessThanOrEqual(400)
        expect(stage.width).toBeGreaterThanOrEqual(370)
        // draw.io's toolbar fits the canvas, its diagram menu (the last
        // button) included; the chat panel has the export button
        const menu = await boxOf(toolbar.locator('a[title="Diagram"]'))
        expect(menu.x).toBeGreaterThanOrEqual(stage.x)
        expect(menu.x + menu.width).toBeLessThanOrEqual(stage.x + stage.width)
        await expect(
            page.locator('[data-testid="export-button"]'),
        ).toBeVisible()
    })

    test("the latest card keeps its undo when the AI writes default values", async ({
        page,
    }) => {
        // x="0" and a 0,0 label offset: draw.io leaves these out when it
        // saves the diagram again
        const xml = `<mxCell id="a" value="Origin" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell><mxCell id="b" value="Next" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="200" y="0" width="120" height="60" as="geometry"/></mxCell><mxCell id="e" value="go" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"><mxPoint x="0" y="0" as="offset"/></mxGeometry></mxCell>`
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(xml, "Here it is."),
            }),
        )
        await openApp(page)
        await sendMessage(page, "Draw two boxes")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(2000)
        await expect(page.locator('[data-testid="version-undo"]')).toBeVisible()
    })

    test("the latest card keeps its undo on a page with its own paper size", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        // A3 paper; the AI's diagram names no paper size, so the page keeps it
        await openDrawioFile(
            page,
            "a3.drawio",
            `<mxfile><diagram name="P" id="p"><mxGraphModel pageWidth="1169" pageHeight="1654"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Old" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`,
        )
        await expect(getIframeContent(page).getByText("Old")).toBeVisible()
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await page.waitForTimeout(2000)
        await expect(page.locator('[data-testid="version-undo"]')).toHaveText(
            "Undo change",
        )
    })

    test("a hand edit after a restore takes the restore message's Undo away", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await drawAndEdit(page)
        await page.locator('[data-testid="version-thumb"]').first().click()
        await page.locator('[data-testid="compare-restore"]').click()
        const toast = page.getByText("Restored v1")
        await expect(toast).toBeVisible()
        const canvas = getIframeContent(page)
        await canvas.getByText("Process", { exact: true }).click()
        await page.keyboard.press("Delete")
        await expect(canvas.getByText("Process", { exact: true })).toHaveCount(
            0,
        )
        await expect(toast).toHaveCount(0)
    })

    test("changing the language saves the chat and keeps it open", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        // Right after the answer: its auto-save may not have run yet
        await openSettingsTab(page, "general")
        await page.locator("#language-select").click()
        await page.getByRole("option", { name: "日本語", exact: true }).click()
        await expect(page).toHaveURL(/\/ja\?session=/, { timeout: 15000 })
        await expect(page.getByText("Create a flowchart").first()).toBeVisible({
            timeout: 15000,
        })
        await expect(page.locator('[data-testid="version-card"]')).toHaveCount(
            1,
        )
    })

    test("the language can't change while an answer runs", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 5000))
            await route
                .fulfill({
                    status: 200,
                    contentType: "text/event-stream",
                    body: createMockSSEResponse(FLOWCHART_XML, "Slow one."),
                })
                .catch(() => {})
        })
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await openSettingsTab(page, "general")
        await expect(page.locator("#language-select")).toBeDisabled()
    })

    test("opening a chat from the list does not save it again", async ({
        page,
    }) => {
        let n = 0
        await page.route("**/api/chat", (route) => {
            n++
            return route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(FLOWCHART_XML, `Answer ${n}.`),
            })
        })
        await openApp(page)
        await sendMessage(page, "First chat")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(1500)
        await page.locator('[data-testid="new-chat-button"]').click()
        await sendMessage(page, "Second chat")
        await waitForComplete(page)
        await page.waitForTimeout(2500)
        await page.locator('[data-testid="session-title"]').click()
        await page.getByRole("button", { name: /First chat/ }).click()
        await expect(page.getByText("Answer 1.")).toBeVisible()
        await page.waitForTimeout(500)
        const opened = await sessionTimes(page)
        await page.waitForTimeout(3000)
        expect(await sessionTimes(page)).toEqual(opened)
    })

    test("retrying the first message does not flash the start screen", async ({
        page,
    }) => {
        let calls = 0
        await page.route("**/api/chat", async (route) => {
            calls++
            if (calls === 1) {
                await route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "Model is overloaded" }),
                })
                return
            }
            await new Promise((resolve) => setTimeout(resolve, 800))
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(FLOWCHART_XML, "Here it is."),
            })
        })
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await expect(page.getByText("Model is overloaded").first()).toBeVisible(
            {
                timeout: 10000,
            },
        )
        // Counts every moment the start screen is in the page
        await page.evaluate(() => {
            const w = window as any
            w.__heroSeen = 0
            new MutationObserver(() => {
                if (document.querySelector('[data-testid="lobby-hero"]')) {
                    w.__heroSeen++
                }
            }).observe(document.body, { childList: true, subtree: true })
        })
        await page.locator('[data-testid="retry-button"]').click()
        await waitForComplete(page)
        expect(await page.evaluate(() => (window as any).__heroSeen)).toBe(0)
    })

    test("a retry stays with its chat when another one comes on screen during the export", async ({
        page,
    }) => {
        // draw.io's export replies wait until released
        await page.addInitScript(() => {
            const w = window as any
            const held: MessageEvent[] = []
            w.__releaseExports = () => {
                w.__holdExports = false
                for (const e of held.splice(0)) {
                    const copy = new MessageEvent("message", {
                        data: e.data,
                        origin: e.origin,
                        source: e.source,
                    })
                    ;(copy as any).__released = true
                    window.dispatchEvent(copy)
                }
            }
            window.addEventListener("message", (event) => {
                if (
                    w.__holdExports &&
                    !(event as any).__released &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                    held.push(event)
                }
            })
        })
        const prompts: string[] = []
        await page.route("**/api/chat", async (route) => {
            const body = route.request().postDataJSON()
            const last = body.messages.at(-1)
            prompts.push(last.parts.find((p: any) => p.type === "text").text)
            if (prompts.length === 2) {
                await route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "Model is overloaded" }),
                })
                return
            }
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(FLOWCHART_XML, "Answer for B."),
            })
        })
        await openApp(page)
        await sendMessage(page, "Chat B")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        const chatB = new URL(page.url()).searchParams.get("session")
        await page.waitForTimeout(1200)
        await page.locator('[data-testid="session-title"]').click()
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "New diagram" })
            .click()
        await sendMessage(page, "Chat A")
        await expect(page.locator('[data-testid="retry-button"]')).toBeVisible({
            timeout: 10000,
        })
        await page.waitForTimeout(1200)

        await page.evaluate(() => {
            ;(window as any).__holdExports = true
        })
        await page.locator('[data-testid="retry-button"]').click()
        // Chat B comes on screen through the URL (as browser back would)
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        await expect(page.getByText("Answer for B.")).toBeVisible()
        await page.evaluate(() => (window as any).__releaseExports())
        await page.waitForTimeout(1500)
        expect(prompts).toHaveLength(2)
        await expect(page.getByText("Answer for B.")).toBeVisible()
        await expect(page.getByText("Chat A", { exact: true })).toHaveCount(0)
    })

    test("a retry keeps what was drawn by hand after the error", async ({
        page,
    }) => {
        const bodies: any[] = []
        await page.route("**/api/chat", async (route) => {
            bodies.push(route.request().postDataJSON())
            if (bodies.length === 2) {
                await route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "Model is overloaded" }),
                })
                return
            }
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body:
                    bodies.length === 1
                        ? createMockSSEResponse(FLOWCHART_XML, "Flowchart.")
                        : createEditResponse(),
            })
        })
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await sendMessage(page, "Add a review step")
        await expect(page.locator('[data-testid="retry-button"]')).toBeVisible({
            timeout: 10000,
        })
        // A copy of "Start", made by hand
        const canvas = getIframeContent(page)
        await canvas.getByText("Start", { exact: true }).click()
        await page.keyboard.press("ControlOrMeta+d")
        await expect(canvas.getByText("Start", { exact: true })).toHaveCount(2)
        await page.waitForTimeout(1200)

        await page.locator('[data-testid="retry-button"]').click()
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await expect(canvas.getByText("Start", { exact: true })).toHaveCount(2)
        // The model was sent the canvas with the copy
        expect(bodies[2].xml.match(/value="Start"/g)).toHaveLength(2)
        await expect(page.locator('[data-testid="version-undo"]')).toHaveText(
            "Undo change",
        )
    })

    test("page settings draw.io keeps in place follow the AI's diagram", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        // A page shadow, which replacing the page in place would keep
        await openDrawioFile(
            page,
            "shadow.drawio",
            `<mxfile><diagram name="P" id="p"><mxGraphModel shadow="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Shady" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Shady")).toBeVisible()
        const shadowed = () =>
            canvas
                .locator(".geDiagramContainer svg g")
                .evaluateAll((els) =>
                    els.some((el) =>
                        (el as SVGElement).style.filter.includes("drop-shadow"),
                    ),
                )
        expect(await shadowed()).toBe(true)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(canvas.getByText("Process", { exact: true })).toBeVisible()
        await expect.poll(shadowed).toBe(false)
    })

    test("a restored version gets its page id back, for links to the page", async ({
        page,
    }) => {
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createEditResponse(),
            }),
        )
        await openApp(page)
        await openDrawioFile(
            page,
            "linked.drawio",
            `<mxfile><diagram name="Main" id="orig"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject label="Home" link="data:page/id,orig" id="a"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Home")).toBeVisible()
        await sendMessage(page, "Add a review step")
        await waitForComplete(page)
        await expect(canvas.getByText("Review Step")).toBeVisible()

        // Another page takes the place of the first one
        const tabs = drawioTabs(page)
        const main = tabs.locator(".gePageTab", { hasText: "Main" })
        await tabs.locator('[title="Insert Page"]').click()
        await main.click()
        // The menu button shows on the current page's tab
        await main.locator(".geButton").click()
        await canvas
            .locator(".mxPopupMenu")
            .last()
            .getByText("Remove Page", { exact: true })
            .click()
        await expect(main).toHaveCount(0)

        await page.locator('[data-testid="version-restore"]').click()
        await expect(canvas.getByText("Review Step")).toBeVisible()
        const savedPageId = () =>
            page.evaluate(async () => {
                const db: IDBDatabase = await new Promise((resolve) => {
                    const request = indexedDB.open("next-ai-drawio")
                    request.onsuccess = () => resolve(request.result)
                })
                const sessions: any[] = await new Promise((resolve) => {
                    const request = db
                        .transaction("sessions")
                        .objectStore("sessions")
                        .getAll()
                    request.onsuccess = () => resolve(request.result)
                })
                db.close()
                const xml = sessions[0]?.diagramXml ?? ""
                return new DOMParser()
                    .parseFromString(xml, "text/xml")
                    .querySelector("diagram")
                    ?.getAttribute("id")
            })
        await expect.poll(savedPageId, { timeout: 10000 }).toBe("orig")
    })

    test("Ctrl+Z after an AI drawing gives the page its id back", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await openDrawioFile(
            page,
            "linked.drawio",
            `<mxfile><diagram name="Main" id="orig"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject label="Home" link="data:page/id,orig" id="a"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Home")).toBeVisible()
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(canvas.getByText("Process", { exact: true })).toBeVisible()
        const savedPageId = () =>
            page.evaluate(async () => {
                const db: IDBDatabase = await new Promise((resolve) => {
                    const request = indexedDB.open("next-ai-drawio")
                    request.onsuccess = () => resolve(request.result)
                })
                const sessions: any[] = await new Promise((resolve) => {
                    const request = db
                        .transaction("sessions")
                        .objectStore("sessions")
                        .getAll()
                    request.onsuccess = () => resolve(request.result)
                })
                db.close()
                return new DOMParser()
                    .parseFromString(sessions[0]?.diagramXml ?? "", "text/xml")
                    .querySelector("diagram")
                    ?.getAttribute("id")
            })
        await expect.poll(savedPageId, { timeout: 10000 }).toBe("page-1")
        await canvas
            .locator(".geDiagramContainer")
            .click({ position: { x: 10, y: 10 } })
        await page.keyboard.press("ControlOrMeta+z")
        await expect(canvas.getByText("Home")).toBeVisible()
        await expect.poll(savedPageId, { timeout: 10000 }).toBe("orig")
        await page.keyboard.press("ControlOrMeta+Shift+z")
        await expect(canvas.getByText("Process", { exact: true })).toBeVisible()
        await expect.poll(savedPageId, { timeout: 10000 }).toBe("page-1")
    })

    test("page settings the AI writes in single quotes are applied too", async ({
        page,
    }) => {
        const shady = `<mxGraphModel shadow='1'><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Shady" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>`
        let count = 0
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body:
                    count++ === 0
                        ? createMockSSEResponse(FLOWCHART_XML, "Flowchart.")
                        : createMockSSEResponse(shady, "With a shadow."),
            }),
        )
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await sendMessage(page, "Redraw it with a shadow")
        await waitForCompleteCount(page, 2)
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Shady")).toBeVisible()
        await expect
            .poll(() =>
                canvas
                    .locator(".geDiagramContainer svg g")
                    .evaluateAll((els) =>
                        els.some((el) =>
                            (el as SVGElement).style.filter.includes(
                                "drop-shadow",
                            ),
                        ),
                    ),
            )
            .toBe(true)
    })

    test("an opened blank file is shown also from a chat with messages", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await openDrawioFile(page, "blank.drawio", BLANK_SHEET)
        await expect(drawioTabs(page)).toContainText("Sheet")
        await page.waitForTimeout(800)
        await expect(page.locator('[data-testid="lobby-hero"]')).toHaveCount(0)
        await expect(
            page.locator('[data-testid="session-title"]'),
        ).toContainText("blank")
    })

    test("an opened blank file is saved: a language switch and a reload bring it back", async ({
        page,
    }) => {
        await openApp(page)
        await openDrawioFile(page, "blank.drawio", BLANK_SHEET)
        const tabs = drawioTabs(page)
        await expect(tabs).toContainText("Sheet")
        // Right away, before the chat is saved on its own
        await openSettingsTab(page, "general")
        await page.locator("#language-select").click()
        await page.getByRole("option", { name: "日本語", exact: true }).click()
        await expect(page).toHaveURL(/\/ja\?session=/, { timeout: 15000 })
        const background = () =>
            getIframeContent(page)
                .locator(".geBackgroundPage")
                .evaluate((el) => getComputedStyle(el).backgroundColor)
        for (const step of ["switch", "reload"]) {
            if (step === "reload") {
                await page.reload({ waitUntil: "networkidle" })
            }
            await expect(tabs).toContainText("Sheet", { timeout: 30000 })
            await expect.poll(background).toBe("rgb(255, 238, 204)")
            await expect(
                page.locator('[data-testid="lobby-hero"]'),
            ).toHaveCount(0)
            await expect(
                page.locator('[data-testid="session-title"]'),
            ).toContainText("blank")
        }
    })

    test("a rename while the first save is being written is kept", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        // Hold the sessions store: the first save waits to be written
        await page.evaluate(async () => {
            const w = window as any
            const db: IDBDatabase = await new Promise((resolve) => {
                const request = indexedDB.open("next-ai-drawio")
                request.onsuccess = () => resolve(request.result)
            })
            const store = db
                .transaction("sessions", "readwrite")
                .objectStore("sessions")
            const keepBusy = () => {
                if (w.__release) return db.close()
                store.get("none").onsuccess = keepBusy
            }
            keepBusy()
        })
        await page.waitForTimeout(1500)
        await expect(page).not.toHaveURL(/session=/)
        await page.locator('[data-testid="session-title"]').click()
        await page.locator('[data-testid="rename-session"]').click()
        const input = page.getByRole("textbox", { name: "Rename" })
        await input.fill("Order flow")
        await input.press("Enter")
        await page.keyboard.press("Escape")
        await page.evaluate(() => {
            ;(window as any).__release = true
        })
        await expect(page).toHaveURL(/session=/, { timeout: 10000 })
        await expect
            .poll(() => sessionTimes(page).then((t) => Object.keys(t)))
            .toEqual(["Order flow"])
        await expect(
            page.locator('[data-testid="session-title"]'),
        ).toContainText("Order flow")
    })

    test("choosing a chat deleted in another tab keeps this chat's session in the URL", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(1200)
        await page.locator('[data-testid="session-title"]').click()
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "New diagram" })
            .click()
        await expect(getChatInput(page)).toBeFocused()
        // Another tab deletes the flowchart chat
        await page.evaluate(async () => {
            const db: IDBDatabase = await new Promise((resolve) => {
                const request = indexedDB.open("next-ai-drawio")
                request.onsuccess = () => resolve(request.result)
            })
            await new Promise((resolve) => {
                const tx = db.transaction("sessions", "readwrite")
                tx.objectStore("sessions").clear()
                tx.oncomplete = resolve
            })
            db.close()
        })
        await openDrawioFile(page, "mine.drawio", TWO_PAGE_FILE)
        await expect(getIframeContent(page).getByText("Old A")).toBeVisible()
        // Before this chat saves on its own: choosing the gone chat saves it
        await expect(page).not.toHaveURL(/session=/)
        await page.locator('[data-testid="session-title"]').click()
        await page.getByRole("button", { name: /Create a flowchart/ }).click()
        await expect(page).toHaveURL(/session=/, { timeout: 10000 })
        await page.locator('[data-testid="session-title"]').click()
        await expect(
            page.getByRole("button", { name: /Create a flowchart/ }),
        ).toHaveCount(0)
        await page.keyboard.press("Escape")
        await page.reload({ waitUntil: "networkidle" })
        await expect(getIframeContent(page).getByText("Old A")).toBeVisible({
            timeout: 30000,
        })
    })

    test("a title typed for an empty chat stays with that chat", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(1200)
        // A new chat, named before anything is in it
        await page.locator('[data-testid="session-title"]').click()
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "New diagram" })
            .click()
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
        // The new chat puts the focus in the composer
        await expect(getChatInput(page)).toBeFocused()
        const recent = page.getByRole("button", { name: "Recent diagrams" })
        await recent.click()
        await page.locator('[data-testid="rename-session"]').click()
        const input = page.getByRole("textbox", { name: "Rename" })
        await input.fill("Foo")
        await input.press("Enter")
        // Open the flowchart chat, then delete it
        await page.getByRole("button", { name: /Create a flowchart/ }).click()
        await expect(
            getIframeContent(page).getByText("Process", { exact: true }),
        ).toBeVisible()
        await page.locator('[data-testid="session-title"]').click()
        await page
            .getByRole("button", { name: /Create a flowchart/ })
            .getByRole("button", { name: "Delete this diagram?" })
            .click()
        await page.getByRole("button", { name: "Delete", exact: true }).click()
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
        // The empty chat on screen now has no title of its own; "Foo" was
        // kept for the chat it was typed in
        await recent.click()
        await expect(page.locator('[data-testid="rename-session"]')).toHaveText(
            "Untitled diagram",
        )
        await expect(page.getByRole("button", { name: /^Foo/ })).toBeVisible()
    })

    test("an opened file without shapes is shown, page settings included", async ({
        page,
    }) => {
        await openApp(page)
        const [chooser] = await Promise.all([
            page.waitForEvent("filechooser"),
            page
                .getByRole("button", { name: "Open .drawio file" })
                .first()
                .click(),
        ])
        await chooser.setFiles({
            name: "blank.drawio",
            mimeType: "application/xml",
            buffer: Buffer.from(
                '<mxfile><diagram name="Sheet" id="s"><mxGraphModel background="#ffeecc"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
            ),
        })
        await expect(page.locator('[data-testid="lobby-hero"]')).toHaveCount(0)
        await expect(drawioTabs(page)).toContainText("Sheet")
        await expect
            .poll(() =>
                getIframeContent(page)
                    .locator(".geBackgroundPage")
                    .evaluate((el) => getComputedStyle(el).backgroundColor),
            )
            .toBe("rgb(255, 238, 204)")
    })

    test("the canvas edge follows a panel narrowed by the window at once", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem("next-ai-draw-io-panel-width", "560")
        })
        await page.setViewportSize({ width: 1280, height: 800 })
        await openApp(page)
        await page.locator('[data-testid="draw-yourself"]').click()
        await page.waitForTimeout(800)
        // 900 px leaves the panel 500 px: the canvas edge moves with it
        await page.setViewportSize({ width: 900, height: 800 })
        await page.waitForTimeout(50)
        const panel = await boxOf(page.locator('[data-testid="chat-panel"]'))
        const stage = await boxOf(page.locator('[data-testid="canvas-stage"]'))
        expect(Math.abs(stage.x + stage.width - (panel.x - 12))).toBeLessThan(3)
    })

    test("closing the panel after dragging its edge keeps the view's middle", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        // Past the time a resize fits the new diagram again; a zoom by
        // the user keeps the view from then on
        await page.waitForTimeout(4500)
        await zoomCanvas(page, "out")
        await page.waitForTimeout(500)
        const handle = await boxOf(page.getByRole("separator"))
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 100)
        await page.mouse.down()
        await page.mouse.move(handle.x - 150, handle.y + 100, { steps: 8 })
        await page.mouse.up()
        await page.waitForTimeout(600)
        const offset = async () => {
            const stage = await boxOf(
                page.locator('[data-testid="canvas-stage"]'),
            )
            const shape = await boxOf(
                getIframeContent(page).getByText("Process", { exact: true }),
            )
            return shape.x + shape.width / 2 - (stage.x + stage.width / 2)
        }
        const before = await offset()
        await page.getByRole("button", { name: "Hide chat panel" }).click()
        await page.waitForTimeout(900)
        expect(Math.abs((await offset()) - before)).toBeLessThan(6)
    })

    test("compare explains a change in the order of shapes", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await page.waitForTimeout(1500)
        // Bring the first shape to the front: only the order changes
        await getIframeContent(page).getByText("Start", { exact: true }).click()
        await page.keyboard.press("ControlOrMeta+Shift+F")
        await page.waitForTimeout(1000)
        await page
            .locator('[data-testid="version-card"]')
            .getByRole("button", { name: "Compare" })
            .click()
        await expect(page.getByRole("dialog")).toContainText("their order")
        await expect(
            page.locator('[data-testid="compare-restore"]'),
        ).toBeEnabled()
    })

    test("a file name typed in the export dialog stays when the title comes", async ({
        page,
    }) => {
        await page.route("**/api/chat", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 2500))
            await route
                .fulfill({
                    status: 200,
                    contentType: "text/event-stream",
                    body: createMockSSEResponse(FLOWCHART_XML, "Here it is."),
                })
                .catch(() => {})
        })
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await page.locator('[data-testid="export-button"]').click()
        const name = page.getByRole("dialog").getByRole("textbox")
        await name.fill("my-arch")
        // The answer ends and the chat is saved: it gets its title now
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/, { timeout: 10000 })
        await page.waitForTimeout(1000)
        await expect(name).toHaveValue("my-arch")
    })
})

// ---------------------------------------------------------------------------
// Edge cases found in review
// ---------------------------------------------------------------------------

const sseOf = (events: object[], done = true) =>
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
    (done ? "data: [DONE]\n\n" : "")
const boxCell = (id: string, label: string, x: number, parent = "1") =>
    `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`

/**
 * Replies to /api/chat in order, each a list of chunks sent 800 ms apart.
 * With holdLast, the last reply never ends.
 */
async function slowReplies(page: Page, replies: string[][], holdLast = false) {
    await page.addInitScript(
        ({ replies, holdLast }) => {
            const realFetch = window.fetch
            let n = 0
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const index = n++
                const chunks = replies[index] ?? []
                const body = new ReadableStream({
                    async start(c) {
                        for (const chunk of chunks) {
                            c.enqueue(new TextEncoder().encode(chunk))
                            await new Promise((r) => setTimeout(r, 800))
                        }
                        if (!(holdLast && index === replies.length - 1)) {
                            c.close()
                        }
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        },
        { replies, holdLast },
    )
}

/** Puts a saved chat into the browser's storage */
async function seedSession(page: Page, session: object) {
    await page.evaluate(async (session) => {
        const db: IDBDatabase = await new Promise((resolve) => {
            const request = indexedDB.open("next-ai-drawio")
            request.onsuccess = () => resolve(request.result)
        })
        await new Promise((resolve) => {
            const tx = db.transaction("sessions", "readwrite")
            tx.objectStore("sessions").put(session)
            tx.oncomplete = resolve
        })
        db.close()
    }, session)
}

/** The diagram of a saved chat (the first one when no id is given) */
function savedDiagram(page: Page, id?: string) {
    return page.evaluate(async (id) => {
        const db: IDBDatabase = await new Promise((resolve) => {
            const request = indexedDB.open("next-ai-drawio")
            request.onsuccess = () => resolve(request.result)
        })
        const sessions: any[] = await new Promise((resolve) => {
            const request = db
                .transaction("sessions")
                .objectStore("sessions")
                .getAll()
            request.onsuccess = () => resolve(request.result)
        })
        db.close()
        const session = id ? sessions.find((s) => s.id === id) : sessions[0]
        return (session?.diagramXml ?? "") as string
    }, id)
}

/** Records the XML of draw.io's latest autosave */
async function watchAutosave(page: Page) {
    await page.addInitScript(() => {
        window.addEventListener("message", (e) => {
            if (
                typeof e.data === "string" &&
                e.data.includes('"event":"autosave"')
            ) {
                ;(window as any).__lastAutosave = JSON.parse(e.data).xml
            }
        })
    })
}

/** The x of a shape in draw.io's latest autosave */
function savedX(page: Page, id: string) {
    return page.evaluate((id) => {
        const xml: string = (window as any).__lastAutosave ?? ""
        const doc = new DOMParser().parseFromString(xml, "text/xml")
        const cell = Array.from(doc.getElementsByTagName("mxCell")).find(
            (c) => c.getAttribute("id") === id,
        )
        return (
            cell?.getElementsByTagName("mxGeometry")[0]?.getAttribute("x") ??
            null
        )
    }, id)
}

/** Whether a label on the canvas lies inside the canvas frame */
async function inView(page: Page, label: string) {
    const frame = await getIframe(page).boundingBox()
    const box = await getIframeContent(page)
        .getByText(label, { exact: true })
        .boundingBox()
    if (!frame || !box) return false
    return (
        box.x >= frame.x &&
        box.y >= frame.y &&
        box.x + box.width <= frame.x + frame.width &&
        box.y + box.height <= frame.y + frame.height
    )
}

const ONE_PIXEL_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
)

/** Records the text of each message sent to /api/chat */
async function recordPrompts(page: Page) {
    const prompts: string[] = []
    await page.route("**/api/chat", async (route) => {
        const last = route.request().postDataJSON().messages.at(-1)
        prompts.push(last.parts.find((p: any) => p.type === "text").text)
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: createMockSSEResponse(
                FLOWCHART_XML,
                `Answer ${prompts.length}.`,
            ),
        })
    })
    return prompts
}

/** Chat B is saved, then chat A is on screen with one message */
async function twoChats(page: Page) {
    await sendMessage(page, "Chat B")
    await waitForComplete(page)
    await expect(page).toHaveURL(/session=/)
    const chatB = new URL(page.url()).searchParams.get("session")
    await page.waitForTimeout(1200)
    await page.locator('[data-testid="session-title"]').click()
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "New diagram" })
        .click()
    // Its address goes first: a URL change while that one is still on the
    // way would replace it, and the page would never see a change
    await expect(page).not.toHaveURL(/session=/)
    await sendMessage(page, "Chat A one")
    await waitForCompleteCount(page, 1)
    await page.waitForTimeout(1200)
    return chatB
}

/** Streamed display_diagram deltas for this input, the last one held back */
function streamedDisplay(id: string, input: object) {
    const deltas = (JSON.stringify(input).match(/[\s\S]{1,30}/g) ?? []).map(
        (d) => ({
            type: "tool-input-delta",
            toolCallId: id,
            inputTextDelta: d,
        }),
    )
    return {
        head: sseOf(
            [
                { type: "start" },
                {
                    type: "tool-input-start",
                    toolCallId: id,
                    toolName: "display_diagram",
                },
                ...deltas.slice(0, -1),
            ],
            false,
        ),
        last: deltas.at(-1) as object,
    }
}

async function saveTemplate(page: Page) {
    await getChatInput(page).fill("Template prompt")
    await page.getByRole("button", { name: "Add", exact: true }).click()
    await page.getByText("Save this prompt").click()
    await page.getByRole("button", { name: "Save prompt" }).click()
    await page.waitForTimeout(500)
    await getChatInput(page).fill("")
}

/**
 * Answers by prompt: "Chat A two" streams some text and starts a drawing,
 * then pauses for a long time; every other prompt is answered at once
 */
async function answerWithPause(page: Page) {
    await page.addInitScript(() => {
        const sse = (events: object[]) =>
            events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
        const cell = (label: string) =>
            `<mxCell id="a" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>`
        const realFetch = window.fetch
        window.fetch = async (input, init) => {
            const url = input instanceof Request ? input.url : String(input)
            if (!url.endsWith("/api/chat")) return realFetch(input, init)
            const body = JSON.parse(String(init?.body ?? "{}"))
            const prompt =
                body.messages
                    ?.at(-1)
                    ?.parts?.find((p: any) => p.type === "text")?.text ?? ""
            const stream = new ReadableStream({
                async start(c) {
                    const send = (events: object[]) =>
                        c.enqueue(new TextEncoder().encode(sse(events)))
                    if (prompt !== "Chat A two") {
                        send([
                            { type: "start" },
                            { type: "text-start", id: "t" },
                            {
                                type: "text-delta",
                                id: "t",
                                delta: `Answer to ${prompt}.`,
                            },
                            { type: "text-end", id: "t" },
                            {
                                type: "tool-input-start",
                                toolCallId: `c-${prompt}`,
                                toolName: "display_diagram",
                            },
                            {
                                type: "tool-input-available",
                                toolCallId: `c-${prompt}`,
                                toolName: "display_diagram",
                                input: { xml: cell(prompt) },
                            },
                            { type: "finish" },
                        ])
                        c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
                        c.close()
                        return
                    }
                    send([
                        { type: "start" },
                        { type: "text-start", id: "t2" },
                        {
                            type: "text-delta",
                            id: "t2",
                            delta: "A is answering.",
                        },
                        { type: "text-end", id: "t2" },
                        {
                            type: "tool-input-start",
                            toolCallId: "d2",
                            toolName: "display_diagram",
                        },
                        {
                            type: "tool-input-delta",
                            toolCallId: "d2",
                            inputTextDelta: '{"xml":"<mxCell',
                        },
                    ])
                    await new Promise((r) => setTimeout(r, 60000))
                    c.close()
                },
            })
            return new Response(stream, {
                headers: { "content-type": "text/event-stream" },
            })
        }
    })
}

/** The text of every saved chat's messages */
function savedChats(page: Page) {
    return page.evaluate(async () => {
        const db: IDBDatabase = await new Promise((resolve) => {
            const request = indexedDB.open("next-ai-drawio")
            request.onsuccess = () => resolve(request.result)
        })
        const all: any[] = await new Promise((resolve) => {
            const request = db
                .transaction("sessions")
                .objectStore("sessions")
                .getAll()
            request.onsuccess = () => resolve(request.result)
        })
        db.close()
        return all.map((s) => ({
            id: s.id as string,
            texts: s.messages.map((m: any) =>
                m.parts
                    .filter((p: any) => p.type === "text")
                    .map((p: any) => p.text)
                    .join(" "),
            ) as string[],
        }))
    })
}

test.describe("Edge cases", () => {
    test("committing a streamed drawing sends draw.io's autosave no older diagram", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            w.__autosaves = []
            window.addEventListener("message", (e) => {
                if (
                    typeof e.data === "string" &&
                    e.data.includes('"event":"autosave"')
                ) {
                    const xml = JSON.parse(e.data).xml as string
                    w.__autosaves.push(xml.includes("NewOne") ? "new" : "old")
                }
            })
        })
        const input = {
            xml: boxCell("a", "OldOne", 40) + boxCell("b", "NewOne", 240),
        }
        const stream = streamedDisplay("d2", input)
        await slowReplies(page, [
            [createMockSSEResponse(boxCell("a", "OldOne", 40), "One.")],
            [
                stream.head,
                sseOf([
                    stream.last,
                    {
                        type: "tool-input-available",
                        toolCallId: "d2",
                        toolName: "display_diagram",
                        input,
                    },
                    { type: "finish" },
                ]),
            ],
        ])
        await openApp(page)
        await sendMessage(page, "One")
        await waitForComplete(page)
        await page.waitForTimeout(1500)
        await page.evaluate(() => {
            ;(window as any).__autosaves = []
        })
        await sendMessage(page, "Two")
        await expect(getIframeContent(page).getByText("NewOne")).toBeVisible()
        await page.waitForTimeout(3000)
        const seen: string[] = await page.evaluate(
            () => (window as any).__autosaves,
        )
        expect(seen).toContain("new")
        // Once the new diagram is on the canvas, no older one comes back
        expect(seen.slice(seen.indexOf("new"))).not.toContain("old")
    })

    test("a reply that just ends in the middle of a drawing undoes its preview", async ({
        page,
    }) => {
        const input = {
            xml: boxCell("b", "Beta", 240) + boxCell("c", "Gamma", 440),
        }
        const stream = streamedDisplay("d2", input)
        await slowReplies(page, [
            [createMockSSEResponse(boxCell("a", "Alpha", 40), "One.")],
            [stream.head],
        ])
        await openApp(page)
        await sendMessage(page, "One")
        await waitForComplete(page)
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
        await sendMessage(page, "Two")
        await expect(
            page.getByText("This attempt failed", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
        await expect(canvas.getByText("Beta", { exact: true })).toHaveCount(0)
    })

    test("an AI edit of a document with adaptive colors keeps the undo history", async ({
        page,
    }) => {
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createEditResponse(),
            }),
        )
        await openApp(page)
        await openDrawioFile(
            page,
            "adaptive.drawio",
            `<mxfile><diagram name="P" id="p"><mxGraphModel adaptiveColors="auto"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "Alpha", 40)}</root></mxGraphModel></diagram></mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Alpha")).toBeVisible()
        await sendMessage(page, "Add a review step")
        await waitForComplete(page)
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await expect(drawioUndo(page)).not.toHaveAttribute("disabled")
    })

    test("attachments in a short window keep the send button on screen", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await page.setViewportSize({ width: 900, height: 400 })
        await openApp(page)
        // The chat panel's composer, not the start screen's
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        const png = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "base64",
        )
        await getAttachmentInput(page).setInputFiles(
            Array.from({ length: 5 }, (_, i) => ({
                name: `img${i}.png`,
                mimeType: "image/png",
                buffer: png,
            })),
        )
        await getChatInput(page).fill(
            Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"),
        )
        await expect(
            page.locator('[data-testid="chat-panel"] img[alt="img4.png"]'),
        ).toBeAttached()
        const send = await boxOf(getSendButton(page))
        expect(send.y + send.height).toBeLessThanOrEqual(400)
    })

    test("a renamed empty chat still opens on the start screen", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await page.waitForTimeout(1200)
        await page.locator('[data-testid="session-title"]').click()
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "New diagram" })
            .click()
        await expect(getChatInput(page)).toBeFocused()
        await page.getByRole("button", { name: "Recent diagrams" }).click()
        await page.locator('[data-testid="rename-session"]').click()
        const input = page.getByRole("textbox", { name: "Rename" })
        await input.fill("Foo")
        await input.press("Enter")
        await page.keyboard.press("Escape")
        await expect(page).toHaveURL(/session=/, { timeout: 10000 })
        await page.reload({ waitUntil: "networkidle" })
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible({
            timeout: 30000,
        })
    })

    test("restoring a version keeps the zoom when the first layer is empty", async ({
        page,
    }) => {
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: sseOf([
                    { type: "start" },
                    {
                        type: "tool-input-start",
                        toolCallId: `e${Date.now()}`,
                        toolName: "edit_diagram",
                    },
                    {
                        type: "tool-input-available",
                        toolCallId: `e${Date.now()}`,
                        toolName: "edit_diagram",
                        input: {
                            operations: [
                                {
                                    operation: "add",
                                    cell_id: `n${Date.now()}`,
                                    new_xml: boxCell(
                                        `n${Date.now()}`,
                                        "Added",
                                        400,
                                        "L2",
                                    ),
                                },
                            ],
                        },
                    },
                    { type: "finish" },
                ]),
            }),
        )
        await openApp(page)
        await openDrawioFile(
            page,
            "layers.drawio",
            `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="L2" value="Top" parent="0"/>${boxCell("a", "OnTop", 40, "L2")}</root></mxGraphModel></diagram></mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("OnTop")).toBeVisible()
        await sendMessage(page, "Add one")
        await waitForComplete(page)
        await sendMessage(page, "Add another")
        await waitForCompleteCount(page, 2)
        // Above 100%, where fitting the view would bring it back
        const initial = await paperWidth(page)
        await zoomCanvas(page, "in")
        await expect.poll(() => paperWidth(page)).toBeGreaterThan(initial)
        const zoomed = await paperWidth(page)
        await page.locator('[data-testid="version-restore"]').first().click()
        await page.waitForTimeout(1000)
        expect(Math.abs((await paperWidth(page)) - zoomed)).toBeLessThan(3)
    })

    test("an editable SVG with a prefixed root opens", async ({ page }) => {
        await openApp(page)
        const file = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "Prefixed", 40)}</root></mxGraphModel></diagram></mxfile>`
        const escaped = file
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
        await page
            .locator('input[type="file"][accept^=".drawio"]')
            .first()
            .setInputFiles({
                name: "prefixed.drawio.svg",
                mimeType: "image/svg+xml",
                buffer: Buffer.from(
                    `<svg:svg xmlns:svg="http://www.w3.org/2000/svg" content="${escaped}"></svg:svg>`,
                ),
            })
        await expect(getIframeContent(page).getByText("Prefixed")).toBeVisible()
    })

    test("an editable SVG whose DOCTYPE defines an entity opens", async ({
        page,
    }) => {
        await openApp(page)
        const file = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="&team;" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
        // Escaped for the attribute, the entity reference left as it is
        const escaped = file
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
        await page
            .locator('input[type="file"][accept^=".drawio"]')
            .first()
            .setInputFiles({
                name: "entity.drawio.svg",
                mimeType: "image/svg+xml",
                buffer: Buffer.from(
                    `<?xml version="1.0"?>\n<!DOCTYPE svg [<!ENTITY team "Alpha">]>\n<svg xmlns="http://www.w3.org/2000/svg" content="${escaped}"></svg>`,
                ),
            })
        await expect(getIframeContent(page).getByText("Alpha")).toBeVisible()
    })

    test("the same file variables in another order keep the undo history", async ({
        page,
    }) => {
        const file = (vars: string, label: string) =>
            `<mxfile vars="${vars}"><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", label, 40)}</root></mxGraphModel></diagram></mxfile>`
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    file(
                        "{&quot;a,b&quot;:&quot;c&quot;,&quot;a&quot;:&quot;b,c&quot;}",
                        "After",
                    ),
                    "Done.",
                ),
            }),
        )
        await openApp(page)
        await openDrawioFile(
            page,
            "vars.drawio",
            file(
                "{&quot;a&quot;:&quot;b,c&quot;,&quot;a,b&quot;:&quot;c&quot;}",
                "Before",
            ),
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Before")).toBeVisible()
        await sendMessage(page, "Rename it")
        await waitForComplete(page)
        await expect(canvas.getByText("After")).toBeVisible()
        await expect(drawioUndo(page)).not.toHaveAttribute("disabled")
    })

    test("a blank file with its own paper size reopens on its canvas", async ({
        page,
    }) => {
        await openApp(page)
        await openDrawioFile(
            page,
            "a3.drawio",
            '<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel pageWidth="1169" pageHeight="1654"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
        )
        await expect(
            page.locator('[data-testid="session-title"]'),
        ).toContainText("a3")
        await expect(page).toHaveURL(/session=/, { timeout: 10000 })
        await page.reload({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
        await page.waitForTimeout(1500)
        await expect(page.locator('[data-testid="lobby-hero"]')).toHaveCount(0)
    })

    test("a file whose comment mentions <svg> still opens", async ({
        page,
    }) => {
        await openApp(page)
        await openDrawioFile(
            page,
            "note.drawio",
            `<!-- exported from <svg> -->\n<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "Noted", 40)}</root></mxGraphModel></diagram></mxfile>`,
        )
        await expect(getIframeContent(page).getByText("Noted")).toBeVisible()
    })

    test("a shape library call saved unfinished does not keep loading", async ({
        page,
    }) => {
        await openApp(page)
        // Saved while the call ran (the tab was hidden mid-answer)
        await page.evaluate(async () => {
            const db: IDBDatabase = await new Promise((resolve) => {
                const request = indexedDB.open("next-ai-drawio")
                request.onsuccess = () => resolve(request.result)
            })
            await new Promise((resolve) => {
                const tx = db.transaction("sessions", "readwrite")
                tx.objectStore("sessions").put({
                    id: "lib",
                    title: "AWS please",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    messages: [
                        {
                            id: "u1",
                            role: "user",
                            parts: [{ type: "text", text: "AWS please" }],
                        },
                        {
                            id: "a1",
                            role: "assistant",
                            parts: [
                                {
                                    type: "tool-get_shape_library",
                                    toolCallId: "lib1",
                                    state: "input-available",
                                    input: { library: "aws4" },
                                },
                            ],
                        },
                    ],
                    xmlSnapshots: [],
                    diagramXml: "",
                    versions: [],
                })
                tx.oncomplete = resolve
            })
            db.close()
        })
        await page.goto("/?session=lib", { waitUntil: "networkidle" })
        await expect(page.getByText("AWS please").first()).toBeVisible({
            timeout: 30000,
        })
        await expect(page.getByText("Stopped", { exact: true })).toBeVisible()
        await expect(page.getByText("Loading a shape library…")).toHaveCount(0)
    })

    test("a document whose page name has an ampersand can be sent", async ({
        page,
    }) => {
        const bodies: any[] = []
        await page.route("**/api/chat", (route) => {
            bodies.push(route.request().postDataJSON())
            return route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(FLOWCHART_XML, "Done."),
            })
        })
        await openApp(page)
        await openDrawioFile(
            page,
            "amp.drawio",
            `<mxfile><diagram name="R &amp; D" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "Lab", 40)}</root></mxGraphModel></diagram></mxfile>`,
        )
        await expect(
            getIframeContent(page).getByText("Lab", { exact: true }),
        ).toBeVisible()
        await sendMessage(page, "Tidy it up")
        await expect.poll(() => bodies.length, { timeout: 15000 }).toBe(1)
        expect(bodies[0].xml).toContain('value="Lab"')
    })

    test("variables of the AI's file are applied", async ({ page }) => {
        const file = (team: string) =>
            `<mxfile vars="{&quot;team&quot;:&quot;${team}&quot;}"><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject label="Team %team%" placeholders="1" id="v"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="160" height="60" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>`
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(file("New"), "Renamed."),
            }),
        )
        await openApp(page)
        await openDrawioFile(page, "vars.drawio", file("Old"))
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Team Old")).toBeVisible()
        await sendMessage(page, "Rename the team")
        await waitForComplete(page)
        await expect(canvas.getByText("Team New")).toBeVisible()
    })

    test("without browser storage, another language starts with no old versions", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            Object.defineProperty(window, "indexedDB", {
                value: null,
                configurable: true,
            })
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await openSettingsTab(page, "general")
        await page.locator("#language-select").click()
        await page.getByRole("option", { name: "日本語", exact: true }).click()
        await expect(page).toHaveURL(/\/ja/, { timeout: 15000 })
        await page.keyboard.press("Escape")
        await page.getByRole("button", { name: /白紙のキャンバス/ }).click()
        await page.waitForTimeout(800)
        await expect(page.locator('[data-testid="version-thumb"]')).toHaveCount(
            0,
        )
    })

    test("an edit sent while another message is prepared is not lost", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.addEventListener("message", (event) => {
                if (
                    (window as any).__dropExports &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                }
            })
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await page.evaluate(() => {
            ;(window as any).__dropExports = true
        })
        // The next message waits for its diagram export
        await sendMessage(page, "Second")
        await page.getByText("First", { exact: true }).hover()
        await page.getByRole("button", { name: "Edit message" }).click()
        const editor = page.locator("textarea").filter({ hasText: "First" })
        await editor.fill("First, edited")
        await editor.press("ControlOrMeta+Enter")
        // Not sent now, so the edit stays open with its text
        await expect(
            page.locator("textarea").filter({ hasText: "First, edited" }),
        ).toBeVisible()
    })

    test("a message stays with its chat when another comes on screen during its export", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            const held: MessageEvent[] = []
            w.__releaseExports = () => {
                w.__holdExports = false
                for (const e of held.splice(0)) {
                    const copy = new MessageEvent("message", {
                        data: e.data,
                        origin: e.origin,
                        source: e.source,
                    })
                    ;(copy as any).__released = true
                    window.dispatchEvent(copy)
                }
            }
            window.addEventListener("message", (event) => {
                if (
                    w.__holdExports &&
                    !(event as any).__released &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                    held.push(event)
                }
            })
        })
        const prompts: string[] = []
        await page.route("**/api/chat", async (route) => {
            const last = route.request().postDataJSON().messages.at(-1)
            prompts.push(last.parts.find((p: any) => p.type === "text").text)
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    FLOWCHART_XML,
                    `Answer ${prompts.length}.`,
                ),
            })
        })
        await openApp(page)
        await sendMessage(page, "Chat B")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        const chatB = new URL(page.url()).searchParams.get("session")
        await page.waitForTimeout(1200)
        await page.locator('[data-testid="session-title"]').click()
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "New diagram" })
            .click()
        await sendMessage(page, "Chat A one")
        await waitForCompleteCount(page, 1)
        await page.waitForTimeout(1200)
        await page.evaluate(() => {
            ;(window as any).__holdExports = true
        })
        await sendMessage(page, "Chat A two")
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        await expect(page.getByText("Answer 1.")).toBeVisible()
        // Chat B gets a link attached meanwhile
        await page.route("**/api/parse-url", (route) =>
            route.fulfill({
                status: 200,
                json: { title: "Spec", content: "text", charCount: 4 },
            }),
        )
        await page.getByRole("button", { name: "Add", exact: true }).click()
        await page.getByText("Extract from URL").click()
        await page
            .getByPlaceholder("https://example.com/article")
            .fill("https://example.com/spec")
        await page.getByRole("button", { name: "Extract", exact: true }).click()
        const link = page
            .locator('[data-testid="chat-panel"]')
            .getByText("Spec")
        await expect(link.first()).toBeVisible()
        await page.evaluate(() => (window as any).__releaseExports())
        await page.waitForTimeout(1500)
        expect(prompts).toEqual(["Chat B", "Chat A one"])
        // Not sent; chat B's link stays as it was
        await expect(link.first()).toBeVisible()
    })

    test("a link to a chat that can't be read for a moment keeps its URL", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        const id = new URL(page.url()).searchParams.get("session")
        await page.waitForTimeout(1200)
        // Reading this session fails while this page is open (storage busy)
        await page.addInitScript((id) => {
            const get = IDBObjectStore.prototype.get
            IDBObjectStore.prototype.get = function (...args: any[]) {
                if (args[0] === id) {
                    throw new DOMException("busy", "InvalidStateError")
                }
                return get.apply(this, args as any)
            }
        }, id)
        await page.reload({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
        await page.waitForTimeout(1500)
        expect(new URL(page.url()).searchParams.get("session")).toBe(id)
    })

    test("a rename after another tab deleted the chat is kept", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(1200)
        // Another tab deletes it
        await page.evaluate(async () => {
            const db: IDBDatabase = await new Promise((resolve) => {
                const request = indexedDB.open("next-ai-drawio")
                request.onsuccess = () => resolve(request.result)
            })
            await new Promise((resolve) => {
                const tx = db.transaction("sessions", "readwrite")
                tx.objectStore("sessions").clear()
                tx.oncomplete = resolve
            })
            db.close()
        })
        await page.locator('[data-testid="session-title"]').click()
        await page.locator('[data-testid="rename-session"]').click()
        const input = page.getByRole("textbox", { name: "Rename" })
        await input.fill("Order flow")
        await input.press("Enter")
        await page.keyboard.press("Escape")
        await sendMessage(page, "Add a review step")
        await waitForCompleteCount(page, 2)
        await expect
            .poll(() => sessionTimes(page).then((t) => Object.keys(t)), {
                timeout: 10000,
            })
            .toEqual(["Order flow"])
    })

    test("the chat list finds untitled chats by the name it shows", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await page.waitForTimeout(1200)
        // Saved with the default title, which the list shows translated
        await page.evaluate(async () => {
            const db: IDBDatabase = await new Promise((resolve) => {
                const request = indexedDB.open("next-ai-drawio")
                request.onsuccess = () => resolve(request.result)
            })
            const sessions: any[] = await new Promise((resolve) => {
                const request = db
                    .transaction("sessions")
                    .objectStore("sessions")
                    .getAll()
                request.onsuccess = () => resolve(request.result)
            })
            await new Promise((resolve) => {
                const tx = db.transaction("sessions", "readwrite")
                tx.objectStore("sessions").put({
                    ...sessions[0],
                    id: "untitled",
                    title: "New Chat",
                })
                tx.oncomplete = resolve
            })
            db.close()
        })
        await page.reload({ waitUntil: "networkidle" })
        await page.locator('[data-testid="session-title"]').click()
        await page.getByPlaceholder("Search diagrams…").fill("Untitled")
        await expect(
            page.getByRole("button", { name: /Untitled diagram/ }),
        ).toBeVisible()
    })

    test("compare closes when another chat with the same old version ids comes on screen", async ({
        page,
    }) => {
        const legacy = (id: string, label: string) => ({
            id,
            title: `Chat ${id}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: `u-${id}`,
                    role: "user",
                    parts: [{ type: "text", text: `Draw ${label}` }],
                },
            ],
            xmlSnapshots: [],
            diagramXml: `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", label, 40)}</root></mxGraphModel></diagram></mxfile>`,
            diagramHistory: [
                { svg: "", xml: `<mxGraphModel><root/></mxGraphModel>` },
                { svg: "", xml: `<mxGraphModel><root/></mxGraphModel>` },
            ],
        })
        await openApp(page)
        await page.evaluate(
            async (sessions) => {
                const db: IDBDatabase = await new Promise((resolve) => {
                    const request = indexedDB.open("next-ai-drawio")
                    request.onsuccess = () => resolve(request.result)
                })
                await new Promise((resolve) => {
                    const tx = db.transaction("sessions", "readwrite")
                    for (const s of sessions) tx.objectStore("sessions").put(s)
                    tx.oncomplete = resolve
                })
                db.close()
            },
            [legacy("A", "AlphaA"), legacy("B", "BetaB")],
        )
        await page.goto("/?session=A", { waitUntil: "networkidle" })
        await expect(getIframeContent(page).getByText("AlphaA")).toBeVisible({
            timeout: 30000,
        })
        await page.locator('[data-testid="version-thumb"]').first().click()
        await expect(page.getByRole("dialog")).toBeVisible()
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=B")
        })
        await expect(getIframeContent(page).getByText("BetaB")).toBeVisible()
        await expect(page.getByRole("dialog")).toHaveCount(0)
    })

    test("the text of an automatic retry shows", async ({ page }) => {
        // A shape with the root cell's id fails, so the app asks again
        const bad = boxCell("1", "Bad", 40, "0")
        const call = (id: string, xml: string) => [
            {
                type: "tool-input-start",
                toolCallId: id,
                toolName: "display_diagram",
            },
            {
                type: "tool-input-available",
                toolCallId: id,
                toolName: "display_diagram",
                input: { xml },
            },
        ]
        const text = (id: string, delta: string) => [
            { type: "text-start", id },
            { type: "text-delta", id, delta },
            { type: "text-end", id },
        ]
        const replies = [
            sseOf([
                { type: "start", messageId: "m1" },
                { type: "start-step" },
                ...call("d1", bad),
                ...text("t1", "First words."),
                { type: "finish-step" },
                { type: "finish" },
            ]),
            sseOf([
                { type: "start", messageId: "m1" },
                { type: "start-step" },
                ...text("t2", "Second words."),
                ...call("d2", boxCell("a", "Alpha", 40)),
                { type: "finish-step" },
                { type: "finish" },
            ]),
        ]
        let n = 0
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body:
                    replies[n++] ??
                    sseOf([{ type: "start" }, { type: "finish" }]),
            }),
        )
        await openApp(page)
        await sendMessage(page, "Draw")
        await expect(getIframeContent(page).getByText("Alpha")).toBeVisible({
            timeout: 15000,
        })
        await expect(page.getByText("First words.")).toBeVisible()
        await expect(page.getByText("Second words.")).toBeVisible()
    })

    test("a message stays with its chat when another comes on screen while its image is read", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            const held: (() => void)[] = []
            const real = FileReader.prototype.readAsDataURL
            FileReader.prototype.readAsDataURL = function (blob: Blob) {
                if (!w.__holdReads) return real.call(this, blob)
                held.push(() => real.call(this, blob))
            }
            w.__releaseReads = () => {
                w.__holdReads = false
                for (const go of held.splice(0)) go()
            }
        })
        const prompts = await recordPrompts(page)
        await openApp(page)
        const chatB = await twoChats(page)
        await getAttachmentInput(page).setInputFiles({
            name: "img.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })
        await page.waitForTimeout(500)
        await page.evaluate(() => {
            ;(window as any).__holdReads = true
        })
        await sendMessage(page, "Chat A two")
        await page.waitForTimeout(300)
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        await expect(page.getByText("Answer 1.")).toBeVisible()
        await page.waitForTimeout(800)
        await page.evaluate(() => (window as any).__releaseReads())
        await page.waitForTimeout(2500)
        expect(prompts).toEqual(["Chat B", "Chat A one"])
    })

    test("a send that failed to export keeps the selected shapes for the next try", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.addEventListener("message", (event) => {
                if (
                    (window as any).__dropExports &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                }
            })
        })
        const bodies: any[] = []
        await page.route(
            "**/api/chat",
            drawThenEdit((body) => bodies.push(body)),
        )
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await getIframeContent(page)
            .getByText("Process", { exact: true })
            .click()
        const chip = page.locator('[data-testid="selection-chip"]')
        await expect(chip).toContainText("Process")
        await page.evaluate(() => {
            ;(window as any).__dropExports = true
        })
        await sendMessage(page, "Make this red")
        // The export times out and the message comes back, its shape too
        await expect(getChatInput(page)).toHaveValue("Make this red", {
            timeout: 20000,
        })
        await expect(chip).toContainText("Process")
        await page.evaluate(() => {
            ;(window as any).__dropExports = false
        })
        await sendMessage(page, "Make this red")
        await expect.poll(() => bodies.length, { timeout: 15000 }).toBe(2)
        expect(bodies[1].selectedCells).toEqual([
            { id: "process", label: "Process" },
        ])
    })

    test("a file whose pages share an id opens with both pages", async ({
        page,
    }) => {
        await openApp(page)
        const pageXml = (attrs: string, label: string) =>
            `<diagram ${attrs}><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("x", label, 40)}</root></mxGraphModel></diagram>`
        // The same id twice; and a page without one, which draw.io numbers
        // by its place ("1") like the page before it
        await openDrawioFile(
            page,
            "dup.drawio",
            `<mxfile>${pageXml('id="dup" name="A"', "PageA")}${pageXml('id="dup" name="B"', "PageB")}</mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("PageA", { exact: true })).toBeVisible()
        await openDrawioFile(
            page,
            "noid.drawio",
            `<mxfile>${pageXml('id="1" name="C"', "PageC")}${pageXml('name="D"', "PageD")}</mxfile>`,
        )
        await expect(canvas.getByText("PageC", { exact: true })).toBeVisible()
        const tabs = drawioTabs(page)
        await expect(tabs.getByText("C", { exact: true })).toBeVisible()
        await expect(tabs.getByText("D", { exact: true })).toBeVisible()
    })

    test("an image that can't be read stays in the composer and sending goes on", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            const real = FileReader.prototype.readAsDataURL
            FileReader.prototype.readAsDataURL = function (blob: Blob) {
                if (!w.__failReads) return real.call(this, blob)
                setTimeout(() => {
                    Object.defineProperty(this, "error", {
                        value: new DOMException("gone", "NotReadableError"),
                    })
                    this.onerror?.(new ProgressEvent("error") as any)
                }, 50)
            }
        })
        const prompts = await recordPrompts(page)
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await getAttachmentInput(page).setInputFiles({
            name: "img.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })
        await page.waitForTimeout(500)
        await page.evaluate(() => {
            ;(window as any).__failReads = true
        })
        await sendMessage(page, "Second")
        await expect(
            page
                .getByRole("region", { name: /Notifications/ })
                .getByText("Failed to read file: img.png"),
        ).toBeVisible()
        await expect(getChatInput(page)).toHaveValue("Second")
        await page.evaluate(() => {
            ;(window as any).__failReads = false
        })
        // The file can be read again: the message goes out
        await sendMessage(page, "Second")
        await expect.poll(() => prompts.length, { timeout: 15000 }).toBe(2)
        expect(prompts[1]).toBe("Second")
    })

    test("undoing an AI change that added file variables removes them", async ({
        page,
    }) => {
        const file = (vars: string) =>
            `<mxfile${vars}><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject label="Team %team%" placeholders="1" id="v"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="160" height="60" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>`
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    file(' vars="{&quot;team&quot;:&quot;New&quot;}"'),
                    "Named.",
                ),
            }),
        )
        await openApp(page)
        await openDrawioFile(page, "vars.drawio", file(""))
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Team %team%")).toBeVisible()
        await sendMessage(page, "Name the team")
        await waitForComplete(page)
        await expect(canvas.getByText("Team New")).toBeVisible()
        await page.waitForTimeout(1500)
        await page.locator('[data-testid="version-undo"]').click()
        await expect(page.getByText("Change undone")).toBeVisible()
        await expect(canvas.getByText("Team %team%")).toBeVisible()
        await expect(canvas.getByText("Team New")).toHaveCount(0)
    })

    test("an AI edit of a file with variables keeps the undo history", async ({
        page,
    }) => {
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createEditResponse(),
            }),
        )
        await openApp(page)
        await openDrawioFile(
            page,
            "vars.drawio",
            `<mxfile vars="{&quot;team&quot;:&quot;Blue&quot;}"><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject label="Team %team%" placeholders="1" id="v"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="160" height="60" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Team Blue")).toBeVisible()
        await page.waitForTimeout(1000)
        await sendMessage(page, "Add a review step")
        await waitForComplete(page)
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await expect(canvas.getByText("Team Blue")).toBeVisible()
        await expect(drawioUndo(page)).not.toHaveAttribute("disabled")
    })

    test("the latest card keeps its undo when the AI writes 10.0 as grid size", async ({
        page,
    }) => {
        const xml = `<mxGraphModel gridSize="10.0" pageScale="1.0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "Alpha", 40)}</root></mxGraphModel>`
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(xml, "Here it is."),
            }),
        )
        await openApp(page)
        await sendMessage(page, "Draw")
        await waitForComplete(page)
        await page.waitForTimeout(2500)
        await expect(page.locator('[data-testid="version-undo"]')).toHaveText(
            "Undo change",
        )
    })

    test("a first message from the start screen shows its answer, also after Ctrl+B there", async ({
        page,
    }) => {
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    boxCell("a", "Alpha", 40),
                    "Here it is.",
                ),
            }),
        )
        await openApp(page)
        await getChatInput(page).click()
        await page.keyboard.press("ControlOrMeta+b")
        await sendMessage(page, "Draw")
        await expect(getIframeContent(page).getByText("Alpha")).toBeVisible({
            timeout: 15000,
        })
        await expect(page.getByText("Here it is.")).toBeVisible()
    })

    test("Enter on an attached link's toggle in a sent message opens it", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawThenEdit())
        await page.route("**/api/parse-url", (route) =>
            route.fulfill({
                status: 200,
                json: {
                    title: "Spec",
                    content: "The spec body text",
                    charCount: 18,
                },
            }),
        )
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await page.getByRole("button", { name: "Add", exact: true }).click()
        await page.getByText("Extract from URL").click()
        await page
            .getByPlaceholder("https://example.com/article")
            .fill("https://example.com/spec")
        await page.getByRole("button", { name: "Extract", exact: true }).click()
        await page.waitForTimeout(800)
        await sendMessage(page, "Second")
        await waitForCompleteCount(page, 2)
        const toggle = page
            .locator('[data-testid="chat-panel"]')
            .getByRole("button", { name: /example\.com|Spec/ })
            .last()
        await toggle.focus()
        await page.keyboard.press("Enter")
        await expect(page.getByText("The spec body text")).toBeVisible()
        await expect(
            page.locator("textarea").filter({ hasText: "Second" }),
        ).toHaveCount(0)
    })

    test("selecting text or following a link in a sent message leaves it closed", async ({
        page,
    }) => {
        // The link is followed in the browser; here it stays on the page
        await page.addInitScript(() => {
            document.addEventListener(
                "click",
                (e) => {
                    if ((e.target as Element).closest?.("a")) e.preventDefault()
                },
                true,
            )
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(
            page,
            "Follow [the spec](https://example.com/spec) closely",
        )
        await waitForComplete(page)
        await page.getByRole("link", { name: "the spec" }).click()
        await page.waitForTimeout(300)
        const editor = page.locator("textarea").filter({ hasText: "the spec" })
        await expect(editor).toHaveCount(0)
        // Text selected with the mouse, to copy it
        const words = page.getByText("closely", { exact: false }).first()
        const box = await boxOf(words)
        await page.mouse.move(box.x + 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {
            steps: 8,
        })
        await page.mouse.up()
        await page.waitForTimeout(300)
        await expect(editor).toHaveCount(0)
    })

    test("a call saved before versions existed shows and copies its XML", async ({
        page,
    }) => {
        await openApp(page)
        await seedSession(page, {
            id: "old",
            title: "Old chat",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "u1",
                    role: "user",
                    parts: [{ type: "text", text: "Old chat" }],
                },
                {
                    id: "a1",
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-display_diagram",
                            toolCallId: "old1",
                            state: "output-available",
                            input: { xml: boxCell("a", "Alpha", 40) },
                            output: "Successfully displayed the diagram.",
                        },
                    ],
                },
            ],
            xmlSnapshots: [],
            diagramXml: "",
            versions: [],
        })
        await page.goto("/?session=old", { waitUntil: "networkidle" })
        const row = page.locator('[data-testid="tool-row"]')
        await expect(row).toBeVisible({ timeout: 30000 })
        await row.getByRole("button").first().click()
        await expect(row).toContainText('value="Alpha"')
        await expect(
            row.getByRole("button", { name: "Copy response" }),
        ).toBeVisible()
    })

    test("a drawing on an empty canvas with an extra layer is fitted when done", async ({
        page,
    }) => {
        const near = boxCell("a", "NearOne", 40)
        const far = `<mxCell id="b" value="FarOne" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="2600" y="1600" width="120" height="60" as="geometry"/></mxCell>`
        const json = JSON.stringify({ xml: near + far })
        const cut = json.indexOf('<mxCell id=\\"b\\"')
        const delta = (inputTextDelta: string) => ({
            type: "tool-input-delta",
            toolCallId: "d1",
            inputTextDelta,
        })
        await slowReplies(page, [
            [
                sseOf(
                    [
                        { type: "start" },
                        {
                            type: "tool-input-start",
                            toolCallId: "d1",
                            toolName: "display_diagram",
                        },
                    ],
                    false,
                ),
                // The first preview shows only the near shape
                sseOf([delta(json.slice(0, cut))], false),
                sseOf([delta(json.slice(cut))], false),
                sseOf([
                    {
                        type: "tool-input-available",
                        toolCallId: "d1",
                        toolName: "display_diagram",
                        input: { xml: near + far },
                    },
                    { type: "finish" },
                ]),
            ],
        ])
        await openApp(page)
        await openDrawioFile(
            page,
            "layers.drawio",
            '<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="L2" value="Notes" parent="0"/></root></mxGraphModel></diagram></mxfile>',
        )
        await page.waitForTimeout(1000)
        await sendMessage(page, "Draw")
        await waitForComplete(page)
        await page.waitForTimeout(1500)
        expect(await inView(page, "FarOne")).toBe(true)
    })

    test("a reply that just ends mid-drawing can be retried", async ({
        page,
    }) => {
        const stream = streamedDisplay("d2", {
            xml: boxCell("b", "Beta", 240) + boxCell("c", "Gamma", 440),
        })
        await slowReplies(page, [
            [createMockSSEResponse(boxCell("a", "Alpha", 40), "One.")],
            [stream.head],
            [createMockSSEResponse(boxCell("d", "Delta", 40), "Again.")],
        ])
        await openApp(page)
        await sendMessage(page, "One")
        await waitForComplete(page)
        await sendMessage(page, "Two")
        await expect(
            page.getByText("This attempt failed", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        await page.locator('[data-testid="retry-button"]').click()
        await expect(
            getIframeContent(page).getByText("Delta", { exact: true }),
        ).toBeVisible()
    })

    test("a chat saved while a drawing streams keeps the diagram before it", async ({
        page,
    }) => {
        const stream = streamedDisplay("d2", {
            xml: boxCell("b", "Beta", 240) + boxCell("c", "Gamma", 440),
        })
        await slowReplies(
            page,
            [
                [createMockSSEResponse(boxCell("a", "Alpha", 40), "One.")],
                [stream.head],
            ],
            true,
        )
        await openApp(page)
        await sendMessage(page, "One")
        await waitForComplete(page)
        await page.waitForTimeout(1500)
        await sendMessage(page, "Two")
        await expect(
            getIframeContent(page).getByText("Beta", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        // The tab is hidden mid-answer
        await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
                value: "hidden",
                configurable: true,
            })
            document.dispatchEvent(new Event("visibilitychange"))
        })
        await page.waitForTimeout(1500)
        const saved = await savedDiagram(page)
        expect(saved).toContain("Alpha")
        expect(saved).not.toContain("Beta")
    })

    test("a streamed edit shows each finished change before the call ends", async ({
        page,
    }) => {
        const newXml =
            '<mxCell id="a" value="Omega" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'
        const input = {
            operations: [
                { operation: "update", cell_id: "a", new_xml: newXml },
            ],
        }
        const json = JSON.stringify(input)
        const split = json.indexOf("Omega") + 2
        const end = json.length - 4
        const delta = (inputTextDelta: string) => ({
            type: "tool-input-delta",
            toolCallId: "e1",
            inputTextDelta,
        })
        await slowReplies(page, [
            [createMockSSEResponse(boxCell("a", "Alpha", 40), "One.")],
            [
                sseOf(
                    [
                        { type: "start" },
                        {
                            type: "tool-input-start",
                            toolCallId: "e1",
                            toolName: "edit_diagram",
                        },
                    ],
                    false,
                ),
                sseOf([delta(json.slice(0, split))], false),
                // The operation's XML is complete; the call is not
                sseOf([delta(json.slice(split, end))], false),
                ": wait\n\n",
                ": wait\n\n",
                ": wait\n\n",
                ": wait\n\n",
                sseOf([
                    delta(json.slice(end)),
                    {
                        type: "tool-input-available",
                        toolCallId: "e1",
                        toolName: "edit_diagram",
                        input,
                    },
                    { type: "finish" },
                ]),
            ],
        ])
        await openApp(page)
        await sendMessage(page, "One")
        await waitForComplete(page)
        await sendMessage(page, "Rename it")
        await expect(page.getByText("Changing the diagram…")).toBeVisible({
            timeout: 10000,
        })
        await expect(
            getIframeContent(page).getByText("Omega", { exact: true }),
        ).toBeVisible({ timeout: 2500 })
        await expect(page.getByText("Changing the diagram…")).toBeVisible()
    })

    test("editing a message whose diagram wasn't saved says so", async ({
        page,
    }) => {
        await openApp(page)
        await seedSession(page, {
            id: "nosnap",
            title: "No snapshot",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "u1",
                    role: "user",
                    parts: [{ type: "text", text: "No snapshot" }],
                },
                {
                    id: "a1",
                    role: "assistant",
                    parts: [{ type: "text", text: "Done." }],
                },
            ],
            xmlSnapshots: [],
            diagramXml: "",
            versions: [],
        })
        await page.goto("/?session=nosnap", { waitUntil: "networkidle" })
        await expect(page.getByText("Done.")).toBeVisible({ timeout: 30000 })
        await page.getByText("No snapshot", { exact: true }).last().hover()
        await page.getByRole("button", { name: "Edit message" }).click()
        const editor = page
            .locator("textarea")
            .filter({ hasText: "No snapshot" })
        await editor.fill("No snapshot, edited")
        await editor.press("ControlOrMeta+Enter")
        await expect(
            page.getByText(
                "This message can't be sent again: the diagram from when it was sent wasn't saved.",
            ),
        ).toBeVisible()
        await expect(
            page.locator("textarea").filter({ hasText: "No snapshot, edited" }),
        ).toBeVisible()
    })

    test("a saved prompt sent while a link is still read keeps the draft", async ({
        page,
    }) => {
        let releaseUrl: () => void = () => {}
        await page.route("**/api/parse-url", async (route) => {
            await new Promise<void>((resolve) => {
                releaseUrl = resolve
            })
            await route.fulfill({
                status: 200,
                json: { title: "Spec", content: "text", charCount: 4 },
            })
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await getChatInput(page).fill("Template prompt")
        await page.getByRole("button", { name: "Add", exact: true }).click()
        await page.getByText("Save this prompt").click()
        await page.getByRole("button", { name: "Save prompt" }).click()
        await page.waitForTimeout(500)
        // A draft, and a link still being read
        await getChatInput(page).fill("My draft")
        await page.getByRole("button", { name: "Add", exact: true }).click()
        await page.getByText("Extract from URL").click()
        await page
            .getByPlaceholder("https://example.com/article")
            .fill("https://example.com/spec")
        await page.getByRole("button", { name: "Extract", exact: true }).click()
        await page.waitForTimeout(300)
        await page.keyboard.press("Escape")
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await page.getByText("Template prompt").first().click()
        await page.getByRole("button", { name: "Send prompt" }).click()
        await expect(
            page.getByText(
                "Attachments are still being read. Send again when they are ready.",
            ),
        ).toBeVisible()
        await expect(getChatInput(page)).toHaveValue("My draft")
        releaseUrl()
    })

    test("a hand move made before an AI change is undone after it", async ({
        page,
    }) => {
        await watchAutosave(page)
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        const canvas = getIframeContent(page)
        await expect.poll(() => savedX(page, "start")).not.toBeNull()
        const x0 = await savedX(page, "start")
        await canvas.getByText("Start", { exact: true }).click()
        await page.keyboard.press("Shift+ArrowRight")
        await expect.poll(() => savedX(page, "start")).not.toBe(x0)
        const x1 = await savedX(page, "start")
        await page.waitForTimeout(1200)
        await sendMessage(page, "Add a review step")
        await waitForCompleteCount(page, 2)
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await page.waitForTimeout(1500)
        await canvas
            .locator(".geDiagramContainer")
            .click({ position: { x: 10, y: 10 } })
        await page.keyboard.press("ControlOrMeta+z")
        await expect(canvas.getByText("Review Step")).toHaveCount(0)
        await expect.poll(() => savedX(page, "start")).toBe(x1)
        await page.keyboard.press("ControlOrMeta+z")
        await expect.poll(() => savedX(page, "start")).toBe(x0)
        await expect(canvas.getByText("Start", { exact: true })).toHaveCount(1)
    })

    test("undo and redo across an AI change keep a later hand move", async ({
        page,
    }) => {
        await watchAutosave(page)
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await drawAndEdit(page)
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await page.waitForTimeout(1500)
        await expect.poll(() => savedX(page, "start")).not.toBeNull()
        const x0 = await savedX(page, "start")
        await canvas.getByText("Start", { exact: true }).click()
        await page.keyboard.press("Shift+ArrowRight")
        await expect.poll(() => savedX(page, "start")).not.toBe(x0)
        const x1 = await savedX(page, "start")
        await canvas
            .locator(".geDiagramContainer")
            .click({ position: { x: 10, y: 10 } })
        await page.keyboard.press("ControlOrMeta+z")
        await expect.poll(() => savedX(page, "start")).toBe(x0)
        await page.keyboard.press("ControlOrMeta+z")
        await expect(canvas.getByText("Review Step")).toHaveCount(0)
        await page.keyboard.press("ControlOrMeta+Shift+z")
        await expect(canvas.getByText("Review Step")).toBeVisible()
        await page.keyboard.press("ControlOrMeta+Shift+z")
        await expect.poll(() => savedX(page, "start")).toBe(x1)
    })

    test("a new AI drawing over a file with variables keeps them and its undo", async ({
        page,
    }) => {
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    '<UserObject label="Lead %team%" placeholders="1" id="w"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="300" y="40" width="160" height="60" as="geometry"/></mxCell></UserObject>',
                    "Drawn.",
                ),
            }),
        )
        await openApp(page)
        await openDrawioFile(
            page,
            "vars.drawio",
            `<mxfile vars="{&quot;team&quot;:&quot;Blue&quot;}"><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject label="Team %team%" placeholders="1" id="v"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="160" height="60" as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Team Blue")).toBeVisible()
        await page.waitForTimeout(1000)
        await sendMessage(page, "Draw it again")
        await waitForComplete(page)
        await expect(canvas.getByText("Lead Blue")).toBeVisible()
        await expect(drawioUndo(page)).not.toHaveAttribute("disabled")
    })

    test("Stop right as a drawing call starts shows it as stopped, never failed", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            w.__sawFailed = false
            new MutationObserver(() => {
                if (document.body?.innerText.includes("This attempt failed")) {
                    w.__sawFailed = true
                }
            }).observe(document, {
                subtree: true,
                childList: true,
                characterData: true,
            })
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const realFetch = window.fetch
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const body = new ReadableStream({
                    async start(c) {
                        const send = (events: object[]) =>
                            c.enqueue(new TextEncoder().encode(sse(events)))
                        send([
                            { type: "start" },
                            { type: "text-start", id: "t1" },
                            {
                                type: "text-delta",
                                id: "t1",
                                delta: "Let me draw.",
                            },
                        ])
                        await new Promise((r) => setTimeout(r, 1500))
                        send([
                            { type: "text-end", id: "t1" },
                            {
                                type: "tool-input-start",
                                toolCallId: "d1",
                                toolName: "display_diagram",
                            },
                            {
                                type: "tool-input-delta",
                                toolCallId: "d1",
                                inputTextDelta: '{"xml":"<mxCell',
                            },
                        ])
                        // Stop before the next render shows the call
                        setTimeout(() => {
                            ;(
                                document.querySelector(
                                    'button[aria-label^="Stop"]',
                                ) as HTMLButtonElement | null
                            )?.click()
                        }, 20)
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        await openApp(page)
        await sendMessage(page, "Draw")
        await expect(page.getByText("Let me draw.")).toBeVisible({
            timeout: 15000,
        })
        await expect(page.getByText("Stopped", { exact: true })).toBeVisible()
        await page.waitForTimeout(1000)
        expect(await page.evaluate(() => (window as any).__sawFailed)).toBe(
            false,
        )
    })

    test("a chat put on screen while another one draws saves its own diagram", async ({
        page,
    }) => {
        const stream = streamedDisplay("d3", {
            xml: boxCell("p", "PrevOne", 240) + boxCell("q", "QueueOne", 440),
        })
        await slowReplies(
            page,
            [
                [createMockSSEResponse(boxCell("a", "BeeOne", 40), "B.")],
                [createMockSSEResponse(boxCell("a", "AyOne", 40), "A.")],
                [stream.head],
            ],
            true,
        )
        await openApp(page)
        const chatB = await twoChats(page)
        await sendMessage(page, "Chat A two")
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("PrevOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        await expect(canvas.getByText("BeeOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(1000)
        await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
                value: "hidden",
                configurable: true,
            })
            document.dispatchEvent(new Event("visibilitychange"))
        })
        await page.waitForTimeout(1500)
        const saved = await savedDiagram(page, chatB ?? undefined)
        expect(saved).toContain("BeeOne")
        expect(saved).not.toContain("AyOne")
    })

    test("a reply of the chat left that ends late adds nothing to the chat on screen", async ({
        page,
    }) => {
        await slowReplies(page, [
            [createMockSSEResponse(boxCell("a", "BeeOne", 40), "B.")],
            [createMockSSEResponse(boxCell("a", "AyOne", 40), "A.")],
            [
                sseOf(
                    [
                        { type: "start" },
                        {
                            type: "tool-input-start",
                            toolCallId: "d3",
                            toolName: "display_diagram",
                        },
                    ],
                    false,
                ),
                ": wait\n\n",
                ": wait\n\n",
                ": wait\n\n",
                ": wait\n\n",
            ],
        ])
        await openApp(page)
        const chatB = await twoChats(page)
        await sendMessage(page, "Chat A two")
        await expect(page.getByText("Drawing the diagram…")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        await expect(page.getByText("B.", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        // A's reply ends a few seconds later
        await page.waitForTimeout(4500)
        await expect(
            page.getByText("The answer ended before the diagram was finished."),
        ).toHaveCount(0)
    })

    test("shapes taken off a message while its image is read stay off", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            const held: (() => void)[] = []
            const real = FileReader.prototype.readAsDataURL
            FileReader.prototype.readAsDataURL = function (blob: Blob) {
                if (!w.__holdReads) return real.call(this, blob)
                held.push(() => {
                    Object.defineProperty(this, "error", {
                        value: new DOMException("gone", "NotReadableError"),
                    })
                    this.onerror?.(new ProgressEvent("error") as any)
                })
            }
            w.__failReads = () => {
                w.__holdReads = false
                for (const go of held.splice(0)) go()
            }
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await getIframeContent(page)
            .getByText("Process", { exact: true })
            .click()
        const chip = page.locator('[data-testid="selection-chip"]')
        await expect(chip).toContainText("Process")
        await getAttachmentInput(page).setInputFiles({
            name: "img.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })
        await page.waitForTimeout(500)
        await page.evaluate(() => {
            ;(window as any).__holdReads = true
        })
        await sendMessage(page, "Make this red")
        await page.waitForTimeout(300)
        // The user takes the shapes off while the image is read
        await chip.getByRole("button").click()
        await expect(chip).toHaveCount(0)
        await page.evaluate(() => (window as any).__failReads())
        await expect(
            page
                .getByRole("region", { name: /Notifications/ })
                .getByText("Failed to read file: img.png"),
        ).toBeVisible()
        await page.waitForTimeout(500)
        await expect(chip).toHaveCount(0)
    })

    test("a saved prompt sent while the diagram exports does not lose the message", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.addEventListener("message", (event) => {
                if (
                    (window as any).__dropExports &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                }
            })
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await getChatInput(page).fill("Template prompt")
        await page.getByRole("button", { name: "Add", exact: true }).click()
        await page.getByText("Save this prompt").click()
        await page.getByRole("button", { name: "Save prompt" }).click()
        await page.waitForTimeout(500)
        await page.evaluate(() => {
            ;(window as any).__dropExports = true
        })
        await sendMessage(page, "My message")
        await page.waitForTimeout(300)
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await page.getByText("Template prompt").first().click()
        // The export times out: the message comes back
        await expect(getChatInput(page)).toHaveValue("My message", {
            timeout: 20000,
        })
    })

    test("a reply of the chat left that ends late starts no request in the chat on screen", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const realFetch = window.fetch
            ;(window as any).__requests = 0
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const n = ++(window as any).__requests
                const body = new ReadableStream({
                    async start(c) {
                        if (n > 1) {
                            c.enqueue(
                                new TextEncoder().encode(
                                    sse([
                                        { type: "start" },
                                        { type: "finish" },
                                    ]),
                                ),
                            )
                            c.close()
                            return
                        }
                        c.enqueue(
                            new TextEncoder().encode(
                                sse([
                                    { type: "start" },
                                    {
                                        type: "tool-input-start",
                                        toolCallId: "d9",
                                        toolName: "display_diagram",
                                    },
                                ]),
                            ),
                        )
                        await new Promise((r) => setTimeout(r, 5000))
                        c.close()
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        // Chat B's last answer ended with a failed drawing (retries used up)
        await seedSession(page, {
            id: "berr",
            title: "Chat B",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "bu",
                    role: "user",
                    parts: [{ type: "text", text: "Chat B" }],
                },
                {
                    id: "ba",
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-display_diagram",
                            toolCallId: "b1",
                            state: "output-error",
                            input: { xml: "<mxCell" },
                            errorText: "XML validation failed",
                        },
                    ],
                },
            ],
            xmlSnapshots: [[0, doc]],
            diagramXml: doc,
            versions: [],
        })
        await sendMessage(page, "Chat A one")
        await expect(page.getByText("Drawing the diagram…")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=berr")
        })
        await expect(
            getIframeContent(page).getByText("BeeOne", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        // A's reply ends meanwhile
        await page.waitForTimeout(7000)
        expect(await page.evaluate(() => (window as any).__requests)).toBe(1)
    })

    test("shapes taken off while an image is read stay off after the export fails", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            const held: (() => void)[] = []
            const real = FileReader.prototype.readAsDataURL
            FileReader.prototype.readAsDataURL = function (blob: Blob) {
                if (!w.__holdReads) return real.call(this, blob)
                held.push(() => real.call(this, blob))
            }
            w.__releaseReads = () => {
                w.__holdReads = false
                for (const go of held.splice(0)) go()
            }
            window.addEventListener("message", (event) => {
                if (
                    w.__dropExports &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                }
            })
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await getIframeContent(page)
            .getByText("Process", { exact: true })
            .click()
        const chip = page.locator('[data-testid="selection-chip"]')
        await expect(chip).toContainText("Process")
        await getAttachmentInput(page).setInputFiles({
            name: "img.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })
        await page.waitForTimeout(500)
        await page.evaluate(() => {
            ;(window as any).__holdReads = true
            ;(window as any).__dropExports = true
        })
        await sendMessage(page, "Make this red")
        await page.waitForTimeout(300)
        await chip.getByRole("button").click()
        await expect(chip).toHaveCount(0)
        await page.evaluate(() => (window as any).__releaseReads())
        // The export times out and the message comes back, without them
        await expect(getChatInput(page)).toHaveValue("Make this red", {
            timeout: 20000,
        })
        await page.waitForTimeout(500)
        await expect(chip).toHaveCount(0)
    })

    test("page ids: written ones keep their pages, ones draw.io can't take are replaced", async ({
        page,
    }) => {
        const pageXml = (attrs: string, label: string) =>
            `<diagram ${attrs}><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("x", label, 40)}</root></mxGraphModel></diagram>`
        const savedIds = () =>
            savedDiagram(page).then((xml) =>
                Array.from(xml.matchAll(/<diagram\b([^>]*)>/g), ([, attrs]) => {
                    const name = /\bname="([^"]*)"/.exec(attrs)?.[1]
                    const id = /\bid="([^"]*)"/.exec(attrs)?.[1]
                    return `${name}=${id}`
                }),
            )
        await openApp(page)
        // Page A has no id, so draw.io would number it "0", B's id
        await openDrawioFile(
            page,
            "ids.drawio",
            `<mxfile>${pageXml('name="A"', "PageA")}${pageXml('name="B" id="0"', "PageB")}</mxfile>`,
        )
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("PageA", { exact: true })).toBeVisible()
        await expect.poll(savedIds).toContain("B=0")
        await openDrawioFile(
            page,
            "ctor.drawio",
            `<mxfile>${pageXml('name="C" id="constructor"', "PageC")}${pageXml('name="D" id="constructor"', "PageD")}</mxfile>`,
        )
        await expect(canvas.getByText("PageC", { exact: true })).toBeVisible()
    })

    test("Stop in one chat does not label another chat's cut off drawing", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const realFetch = window.fetch
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const body = new ReadableStream({
                    start(c) {
                        c.enqueue(
                            new TextEncoder().encode(
                                sse([
                                    { type: "start" },
                                    { type: "text-start", id: "t1" },
                                    {
                                        type: "text-delta",
                                        id: "t1",
                                        delta: "Thinking about it.",
                                    },
                                ]),
                            ),
                        )
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        // Chat B was saved while a drawing streamed (its tab was closed)
        await seedSession(page, {
            id: "bcut",
            title: "Chat B",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "bu",
                    role: "user",
                    parts: [{ type: "text", text: "Chat B" }],
                },
                {
                    id: "ba",
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-display_diagram",
                            toolCallId: "b1",
                            state: "input-streaming",
                            input: { xml: "<mxCell" },
                        },
                    ],
                },
            ],
            xmlSnapshots: [[0, doc]],
            diagramXml: doc,
            versions: [],
        })
        await sendMessage(page, "Chat A one")
        await expect(page.getByText("Thinking about it.")).toBeVisible({
            timeout: 15000,
        })
        await page.getByRole("button", { name: "Stop" }).click()
        await page.waitForTimeout(1500)
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=bcut")
        })
        await expect(
            getIframeContent(page).getByText("BeeOne", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        await expect(
            page.getByText("This attempt failed", { exact: true }),
        ).toBeVisible()
    })

    test("a drawing of the chat left that ends late leaves the canvas on screen as it was", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const cell = (id: string, label: string, x: number) =>
                `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`
            const realFetch = window.fetch
            let n = 0
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const i = n++
                const body = new ReadableStream({
                    async start(c) {
                        const send = (events: object[]) =>
                            c.enqueue(new TextEncoder().encode(sse(events)))
                        if (i < 2) {
                            send([
                                { type: "start" },
                                {
                                    type: "tool-input-start",
                                    toolCallId: `x${i}`,
                                    toolName: "display_diagram",
                                },
                                {
                                    type: "tool-input-available",
                                    toolCallId: `x${i}`,
                                    toolName: "display_diagram",
                                    input: {
                                        xml: cell(
                                            "a",
                                            i === 0 ? "BeeOne" : "AyOne",
                                            40,
                                        ),
                                    },
                                },
                                { type: "finish" },
                            ])
                            c.close()
                            return
                        }
                        send([
                            { type: "start" },
                            {
                                type: "tool-input-start",
                                toolCallId: "d3",
                                toolName: "display_diagram",
                            },
                        ])
                        // The chat is left meanwhile; then the drawing streams on
                        await new Promise((r) => setTimeout(r, 4000))
                        const json = JSON.stringify({
                            xml:
                                cell("p", "PrevOne", 240) +
                                cell("q", "QueueOne", 440),
                        })
                        send([
                            {
                                type: "tool-input-delta",
                                toolCallId: "d3",
                                inputTextDelta: json.slice(0, json.length - 30),
                            },
                        ])
                        await new Promise((r) => setTimeout(r, 2000))
                        c.close()
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        await openApp(page)
        const chatB = await twoChats(page)
        await sendMessage(page, "Chat A two")
        await expect(page.getByText("Drawing the diagram…")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("BeeOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(8000)
        await expect(canvas.getByText("PrevOne", { exact: true })).toHaveCount(
            0,
        )
        await expect(canvas.getByText("BeeOne", { exact: true })).toBeVisible()
    })

    test("a saved prompt sent while a message is prepared says why nothing happens", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.addEventListener("message", (event) => {
                if (
                    (window as any).__dropExports &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                }
            })
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await getChatInput(page).fill("Template prompt")
        await page.getByRole("button", { name: "Add", exact: true }).click()
        await page.getByText("Save this prompt").click()
        await page.getByRole("button", { name: "Save prompt" }).click()
        await page.waitForTimeout(500)
        await page.evaluate(() => {
            ;(window as any).__dropExports = true
        })
        await sendMessage(page, "My message")
        await page.waitForTimeout(300)
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await page.getByText("Template prompt").first().click()
        await expect(
            page
                .getByRole("region", { name: /Notifications/ })
                .getByText(
                    "The last message is still being sent. Try again in a moment.",
                ),
        ).toBeVisible()
    })

    test("an example drawn into a blank file with variables keeps its undo", async ({
        page,
    }) => {
        await openApp(page)
        await openDrawioFile(
            page,
            "vars.drawio",
            '<mxfile vars="{&quot;team&quot;:&quot;Blue&quot;}"><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
        )
        await page.waitForTimeout(1000)
        // The cached example's prompt: drawn without a request
        await sendMessage(page, "Draw a cat for me")
        await waitForComplete(page)
        await page.waitForTimeout(1000)
        await expect(drawioUndo(page)).not.toHaveAttribute("disabled")
    })

    test("shapes deselected while the message exports can be picked again for the next one", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            const held: MessageEvent[] = []
            w.__releaseExports = () => {
                w.__holdExports = false
                for (const e of held.splice(0)) {
                    const copy = new MessageEvent("message", {
                        data: e.data,
                        origin: e.origin,
                        source: e.source,
                    })
                    ;(copy as any).__released = true
                    window.dispatchEvent(copy)
                }
            }
            window.addEventListener("message", (event) => {
                if (
                    w.__holdExports &&
                    !(event as any).__released &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                    held.push(event)
                }
            })
        })
        const bodies: any[] = []
        await page.route(
            "**/api/chat",
            drawThenEdit((body) => bodies.push(body)),
        )
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        const canvas = getIframeContent(page)
        const shape = canvas.getByText("Process", { exact: true })
        const chip = page.locator('[data-testid="selection-chip"]')
        await shape.click()
        await expect(chip).toContainText("Process")
        await page.evaluate(() => {
            ;(window as any).__holdExports = true
        })
        await sendMessage(page, "Make this red")
        // Deselected while the diagram exports
        await canvas
            .locator(".geDiagramContainer")
            .click({ position: { x: 10, y: 10 } })
        await expect(chip).toHaveCount(0)
        await page.evaluate(() => (window as any).__releaseExports())
        await waitForCompleteCount(page, 2)
        // Picked again for a follow-up
        await shape.click()
        await expect(chip).toContainText("Process")
    })

    test("Enter while the last message is still being sent says so; a saved prompt then is not counted", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.addEventListener("message", (event) => {
                if (
                    (window as any).__dropExports &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                }
            })
        })
        await page.route("**/api/chat", drawThenEdit())
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await getChatInput(page).fill("Template prompt")
        await page.getByRole("button", { name: "Add", exact: true }).click()
        await page.getByText("Save this prompt").click()
        await page.getByRole("button", { name: "Save prompt" }).click()
        await page.waitForTimeout(500)
        await page.evaluate(() => {
            ;(window as any).__dropExports = true
        })
        await sendMessage(page, "My message")
        await page.waitForTimeout(300)
        const notice = page
            .getByRole("region", { name: /Notifications/ })
            .getByText(
                "The last message is still being sent. Try again in a moment.",
            )
        await sendMessage(page, "More words")
        await expect(notice).toBeVisible()
        await expect(getChatInput(page)).toHaveValue("More words")
        await getChatInput(page).fill("")
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await page.getByText("Template prompt").first().click()
        await page.waitForTimeout(500)
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await expect(
            page.getByRole("dialog").getByText("Not used yet"),
        ).toBeVisible()
    })

    test("a saved prompt whose own send fails is not counted as used", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            window.addEventListener("message", (event) => {
                if (
                    (window as any).__dropExports &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                }
            })
        })
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(boxCell("a", "Alpha", 40), "Here."),
            }),
        )
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await saveTemplate(page)
        await page.evaluate(() => {
            ;(window as any).__dropExports = true
        })
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await page.getByText("Template prompt").first().click()
        // Its export times out: the prompt comes back to the input
        await expect(getChatInput(page)).toHaveValue("Template prompt", {
            timeout: 20000,
        })
        await page.waitForTimeout(500)
        await getChatInput(page).fill("")
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await expect(
            page.getByRole("dialog").getByText("Not used yet"),
        ).toBeVisible()
    })

    test("a saved prompt clicked as the last message goes out does not start a second answer", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            const held: MessageEvent[] = []
            w.__releaseExports = () => {
                w.__holdExports = false
                for (const e of held.splice(0)) {
                    const copy = new MessageEvent("message", {
                        data: e.data,
                        origin: e.origin,
                        source: e.source,
                    })
                    ;(copy as any).__released = true
                    window.dispatchEvent(copy)
                }
            }
            window.addEventListener("message", (event) => {
                if (
                    w.__holdExports &&
                    !(event as any).__released &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                    held.push(event)
                }
            })
            // Keeps the saved prompts' store busy, so the panel's click count waits
            w.__blockTemplates = () =>
                new Promise<void>((started) => {
                    const request = indexedDB.open("next-ai-drawio-templates")
                    request.onsuccess = () => {
                        const db = request.result
                        const tx = db.transaction("templates", "readwrite")
                        const store = tx.objectStore("templates")
                        w.__blocking = true
                        const spin = () => {
                            if (!w.__blocking) return
                            store.get("none").onsuccess = spin
                        }
                        spin()
                        started()
                    }
                })
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const realFetch = window.fetch
            w.__requests = 0
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const n = ++w.__requests
                const body = new ReadableStream({
                    async start(c) {
                        c.enqueue(
                            new TextEncoder().encode(
                                sse([
                                    { type: "start" },
                                    { type: "text-start", id: `t${n}` },
                                    {
                                        type: "text-delta",
                                        id: `t${n}`,
                                        delta: `Answer ${n}.`,
                                    },
                                ]),
                            ),
                        )
                        await new Promise((r) =>
                            setTimeout(r, n === 1 ? 100 : 6000),
                        )
                        c.enqueue(
                            new TextEncoder().encode(
                                sse([
                                    { type: "text-end", id: `t${n}` },
                                    { type: "finish" },
                                ]) + "data: [DONE]\n\n",
                            ),
                        )
                        c.close()
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        await openApp(page)
        await sendMessage(page, "First")
        await expect(page.getByText("Answer 1.")).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(1000)
        await saveTemplate(page)
        await page.evaluate(() => {
            ;(window as any).__holdExports = true
        })
        await sendMessage(page, "Second")
        await page.waitForTimeout(300)
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await expect(page.getByText("Template prompt").first()).toBeVisible()
        await page.evaluate(() => (window as any).__blockTemplates())
        await page.getByText("Template prompt").first().click()
        await page.waitForTimeout(300)
        // The second message goes out and its answer starts; then the store frees up
        await page.evaluate(() => (window as any).__releaseExports())
        await expect(page.getByText("Answer 2.")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate(() => {
            ;(window as any).__blocking = false
        })
        await page.waitForTimeout(2500)
        const requests = await page.evaluate(() => (window as any).__requests)
        expect(requests).toBe(2)
    })

    test("going back to another language's page mid-drawing sends nothing more", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const realFetch = window.fetch
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const count =
                    Number(localStorage.getItem("__chatRequests") ?? "0") + 1
                localStorage.setItem("__chatRequests", String(count))
                const body = new ReadableStream({
                    start(c) {
                        c.enqueue(
                            new TextEncoder().encode(
                                sse([
                                    { type: "start" },
                                    {
                                        type: "tool-input-start",
                                        toolCallId: `d${count}`,
                                        toolName: "display_diagram",
                                    },
                                    {
                                        type: "tool-input-delta",
                                        toolCallId: `d${count}`,
                                        inputTextDelta: '{"xml":"<mxCell',
                                    },
                                ]),
                            ),
                        )
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        await openApp(page)
        await openSettingsTab(page, "general")
        await page.locator("#language-select").click()
        await page.getByRole("option", { name: "日本語", exact: true }).click()
        await expect(page).toHaveURL(/\/ja/, { timeout: 15000 })
        await page.keyboard.press("Escape")
        await expect(
            page.locator('[data-testid="canvas-loading"]'),
        ).toHaveCount(0, { timeout: 30000 })
        await sendMessage(page, "Draw")
        await expect
            .poll(() =>
                page.evaluate(() => localStorage.getItem("__chatRequests")),
            )
            .toBe("1")
        await page.waitForTimeout(1000)
        await page.goBack()
        await page.waitForTimeout(5000)
        const count = await page.evaluate(() =>
            localStorage.getItem("__chatRequests"),
        )
        expect(count).toBe("1")
    })

    test("a saved prompt picked while an answer comes in says why it is not sent", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            const held: MessageEvent[] = []
            w.__releaseExports = () => {
                w.__holdExports = false
                for (const e of held.splice(0)) {
                    const copy = new MessageEvent("message", {
                        data: e.data,
                        origin: e.origin,
                        source: e.source,
                    })
                    ;(copy as any).__released = true
                    window.dispatchEvent(copy)
                }
            }
            window.addEventListener("message", (event) => {
                if (
                    w.__holdExports &&
                    !(event as any).__released &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                    held.push(event)
                }
            })
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const realFetch = window.fetch
            let n = 0
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const i = ++n
                const body = new ReadableStream({
                    async start(c) {
                        c.enqueue(
                            new TextEncoder().encode(
                                sse([
                                    { type: "start" },
                                    { type: "text-start", id: `t${i}` },
                                    {
                                        type: "text-delta",
                                        id: `t${i}`,
                                        delta: `Answer ${i}.`,
                                    },
                                ]),
                            ),
                        )
                        await new Promise((r) =>
                            setTimeout(r, i === 1 ? 100 : 8000),
                        )
                        c.enqueue(
                            new TextEncoder().encode(
                                sse([
                                    { type: "text-end", id: `t${i}` },
                                    { type: "finish" },
                                ]) + "data: [DONE]\n\n",
                            ),
                        )
                        c.close()
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        await openApp(page)
        await sendMessage(page, "First")
        await expect(page.getByText("Answer 1.")).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(1000)
        await saveTemplate(page)
        await page.evaluate(() => {
            ;(window as any).__holdExports = true
        })
        await sendMessage(page, "Second")
        await page.waitForTimeout(300)
        // The list is open when the answer starts
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await expect(page.getByText("Template prompt").first()).toBeVisible()
        await page.evaluate(() => (window as any).__releaseExports())
        await expect(page.getByText("Answer 2.")).toBeVisible({
            timeout: 15000,
        })
        await page.getByText("Template prompt").first().click()
        await expect(
            page
                .getByRole("region", { name: /Notifications/ })
                .getByText(
                    "An answer is still coming. Send again when it is done.",
                ),
        ).toBeVisible()
    })

    test("a saved prompt goes out at once, also while its click count waits for storage", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const w = window as any
            // Keeps the saved prompts' store busy, so its counts wait
            w.__blockTemplates = () =>
                new Promise<void>((started) => {
                    const request = indexedDB.open("next-ai-drawio-templates")
                    request.onsuccess = () => {
                        const tx = request.result.transaction(
                            "templates",
                            "readwrite",
                        )
                        const store = tx.objectStore("templates")
                        w.__blocking = true
                        const spin = () => {
                            if (!w.__blocking) return
                            store.get("none").onsuccess = spin
                        }
                        spin()
                        started()
                    }
                })
        })
        const prompts = await recordPrompts(page)
        await openApp(page)
        await sendMessage(page, "First")
        await waitForComplete(page)
        await saveTemplate(page)
        await page.getByRole("button", { name: "Saved prompts" }).click()
        await expect(page.getByText("Template prompt").first()).toBeVisible()
        await page.evaluate(() => (window as any).__blockTemplates())
        await page.getByText("Template prompt").first().click()
        await expect.poll(() => prompts.length, { timeout: 10000 }).toBe(2)
        expect(prompts[1]).toBe("Template prompt")
        await page.evaluate(() => {
            ;(window as any).__blocking = false
        })
    })

    test("a chat opened from its link shows its cut off drawing as failed", async ({
        page,
    }) => {
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        await seedSession(page, {
            id: "cut",
            title: "Cut chat",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "cu",
                    role: "user",
                    parts: [{ type: "text", text: "Cut chat" }],
                },
                {
                    id: "ca",
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-display_diagram",
                            toolCallId: "c1",
                            state: "input-streaming",
                            input: { xml: "<mxCell" },
                        },
                    ],
                },
            ],
            xmlSnapshots: [[0, doc]],
            diagramXml: doc,
            versions: [],
        })
        await page.goto("/?session=cut", { waitUntil: "networkidle" })
        await expect(
            getIframeContent(page).getByText("BeeOne", { exact: true }),
        ).toBeVisible({ timeout: 30000 })
        await expect(
            page.getByText("This attempt failed", { exact: true }),
        ).toBeVisible()
    })

    test("an answer left by browser back stops and is not written into the chat on screen", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const cell = (id: string, label: string, x: number) =>
                `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`
            const realFetch = window.fetch
            let n = 0
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const i = n++
                const body = new ReadableStream({
                    async start(c) {
                        const send = (events: object[]) =>
                            c.enqueue(new TextEncoder().encode(sse(events)))
                        if (i < 2) {
                            send([
                                { type: "start" },
                                {
                                    type: "tool-input-start",
                                    toolCallId: `x${i}`,
                                    toolName: "display_diagram",
                                },
                                {
                                    type: "tool-input-available",
                                    toolCallId: `x${i}`,
                                    toolName: "display_diagram",
                                    input: {
                                        xml: cell(
                                            "a",
                                            i === 0 ? "BeeOne" : "AyOne",
                                            40,
                                        ),
                                    },
                                },
                                { type: "finish" },
                            ])
                            c.close()
                            return
                        }
                        send([
                            { type: "start" },
                            { type: "text-start", id: "t3" },
                            {
                                type: "text-delta",
                                id: "t3",
                                delta: "Drawing it now.",
                            },
                            {
                                type: "tool-input-start",
                                toolCallId: "d3",
                                toolName: "display_diagram",
                            },
                        ])
                        // The chat is left meanwhile; then the answer goes on
                        await new Promise((r) => setTimeout(r, 4000))
                        const json = JSON.stringify({
                            xml:
                                cell("p", "PrevOne", 240) +
                                cell("q", "QueueOne", 440),
                        })
                        send([
                            {
                                type: "tool-input-delta",
                                toolCallId: "d3",
                                inputTextDelta: json.slice(0, json.length - 30),
                            },
                        ])
                        await new Promise((r) => setTimeout(r, 2000))
                        c.close()
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        await openApp(page)
        const chatB = await twoChats(page)
        await sendMessage(page, "Chat A two")
        await expect(page.getByText("Drawing it now.")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("BeeOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        // Chat B is ready for a new message at once
        await expect(getSendButton(page)).toBeVisible()
        await page.waitForTimeout(7000)
        const panel = page.locator('[data-testid="chat-panel"]')
        await expect(panel.getByText("Drawing it now.")).toHaveCount(0)
        await expect(canvas.getByText("PrevOne", { exact: true })).toHaveCount(
            0,
        )
        // Saved as it was: its own two messages
        await page.evaluate(() => {
            Object.defineProperty(document, "visibilityState", {
                value: "hidden",
                configurable: true,
            })
            document.dispatchEvent(new Event("visibilitychange"))
        })
        await page.waitForTimeout(1500)
        const saved = await page.evaluate(async (id) => {
            const db: IDBDatabase = await new Promise((resolve) => {
                const request = indexedDB.open("next-ai-drawio")
                request.onsuccess = () => resolve(request.result)
            })
            const session: any = await new Promise((resolve) => {
                const request = db
                    .transaction("sessions")
                    .objectStore("sessions")
                    .get(id as string)
                request.onsuccess = () => resolve(request.result)
            })
            db.close()
            return session.messages.length as number
        }, chatB)
        expect(saved).toBe(2)
    })

    test("two drawings in one reply, the first loaded in full, end with the second on the canvas", async ({
        page,
    }) => {
        const first = `<mxGraphModel math="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("a", "FirstOne", 40)}</root></mxGraphModel>`
        const body = sseOf([
            { type: "start" },
            {
                type: "tool-input-start",
                toolCallId: "d1",
                toolName: "display_diagram",
            },
            {
                type: "tool-input-available",
                toolCallId: "d1",
                toolName: "display_diagram",
                input: { xml: first },
            },
            {
                type: "tool-input-start",
                toolCallId: "d2",
                toolName: "display_diagram",
            },
            {
                type: "tool-input-available",
                toolCallId: "d2",
                toolName: "display_diagram",
                input: { xml: boxCell("b", "SecondOne", 240) },
            },
            { type: "finish" },
        ])
        let n = 0
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body:
                    n++ === 0
                        ? body
                        : sseOf([{ type: "start" }, { type: "finish" }]),
            }),
        )
        await openApp(page)
        await sendMessage(page, "Draw")
        await waitForComplete(page)
        await page.waitForTimeout(2000)
        const canvas = getIframeContent(page)
        // The last call's diagram is the one on the canvas
        await expect(
            canvas.getByText("SecondOne", { exact: true }),
        ).toBeVisible()
        await expect(canvas.getByText("FirstOne", { exact: true })).toHaveCount(
            0,
        )
    })

    test("after leaving an answering chat by browser back, hand edits in the chat on screen are saved", async ({
        page,
    }) => {
        await watchAutosave(page)
        await page.addInitScript(() => {
            const sse = (events: object[]) =>
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            const cell = (id: string, label: string, x: number) =>
                `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`
            const realFetch = window.fetch
            let n = 0
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const i = n++
                const body = new ReadableStream({
                    async start(c) {
                        const send = (events: object[]) =>
                            c.enqueue(new TextEncoder().encode(sse(events)))
                        if (i < 2) {
                            send([
                                { type: "start" },
                                {
                                    type: "tool-input-start",
                                    toolCallId: `x${i}`,
                                    toolName: "display_diagram",
                                },
                                {
                                    type: "tool-input-available",
                                    toolCallId: `x${i}`,
                                    toolName: "display_diagram",
                                    input: {
                                        xml: cell(
                                            "start",
                                            i === 0 ? "BeeOne" : "AyOne",
                                            40,
                                        ),
                                    },
                                },
                                { type: "finish" },
                            ])
                            c.close()
                            return
                        }
                        // An edit streams on and on
                        send([
                            { type: "start" },
                            {
                                type: "tool-input-start",
                                toolCallId: "e3",
                                toolName: "edit_diagram",
                            },
                            {
                                type: "tool-input-delta",
                                toolCallId: "e3",
                                inputTextDelta:
                                    '{"operations":[{"operation":"update","cell_id":"start","new_xml":"',
                            },
                        ])
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        await openApp(page)
        const chatB = await twoChats(page)
        await sendMessage(page, "Chat A two")
        await expect(page.getByText("Changing the diagram…")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("BeeOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(1500)
        // A hand move in chat B
        await expect.poll(() => savedX(page, "start")).not.toBeNull()
        const x0 = await savedX(page, "start")
        await canvas.getByText("BeeOne", { exact: true }).click()
        await page.keyboard.press("Shift+ArrowRight")
        await expect.poll(() => savedX(page, "start")).not.toBe(x0)
        const x1 = await savedX(page, "start")
        await page.waitForTimeout(2500)
        const saved = await savedDiagram(page, chatB ?? undefined)
        const savedXValue =
            /<mxCell id="start"[\s\S]*?<mxGeometry[^>]*\bx="([^"]*)"/.exec(
                saved,
            )?.[1]
        expect(savedXValue).toBe(x1)
    })

    test("a chat left by browser back mid-answer keeps its last message and the answer so far", async ({
        page,
    }) => {
        await answerWithPause(page)
        await openApp(page)
        const chatB = await twoChats(page)
        await expect(page).toHaveURL(/session=/)
        const chatA = new URL(page.url()).searchParams.get("session")
        await sendMessage(page, "Chat A two")
        await expect(page.getByText("A is answering.")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Chat B", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await expect(page).toHaveURL(new RegExp(`session=${chatB}`))
        // Back to chat A
        await page.waitForTimeout(1000)
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatA)
        const panel = page.locator('[data-testid="chat-panel"]')
        await expect(panel.getByText("Chat A two")).toBeVisible({
            timeout: 15000,
        })
        await expect(panel.getByText("A is answering.")).toBeVisible()
        // Its unfinished drawing was stopped by leaving
        await expect(panel.getByText("Stopped", { exact: true })).toBeVisible()
        await expect(
            panel.getByText("This attempt failed", { exact: true }),
        ).toHaveCount(0)
    })

    test("a new chat left by browser back during its first answer is saved", async ({
        page,
    }) => {
        await answerWithPause(page)
        await openApp(page)
        await sendMessage(page, "Chat B")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        const chatB = new URL(page.url()).searchParams.get("session")
        await page.waitForTimeout(1200)
        await page.locator('[data-testid="session-title"]').click()
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "New diagram" })
            .click()
        await expect(page).not.toHaveURL(/session=/)
        await sendMessage(page, "Chat A two")
        await expect(page.getByText("A is answering.")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatB)
        await expect(
            getIframeContent(page).getByText("Chat B", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        await page.waitForTimeout(1500)
        // The address stays the one gone back to
        await expect(page).toHaveURL(new RegExp(`session=${chatB}`))
        const chats = await savedChats(page)
        const chatA = chats.find((c) => c.texts.includes("Chat A two"))
        expect(chatA?.texts).toEqual(["Chat A two", "A is answering."])
        expect(chats.find((c) => c.id === chatB)?.texts).toEqual([
            "Chat B",
            "Answer to Chat B.",
        ])
    })

    test("a drawing already on the canvas of a chat left by browser back is saved as done", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                "next-ai-draw-io-vlm-validation-enabled",
                "true",
            )
        })
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(boxCell("a", "AyOne", 40), "A."),
            }),
        )
        // The screenshot check never answers: the call waits for it
        await page.route("**/api/validate-diagram", () => {})
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("b", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        await seedSession(page, {
            id: "bee",
            title: "Chat B",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "bu",
                    role: "user",
                    parts: [{ type: "text", text: "Chat B" }],
                },
                {
                    id: "ba",
                    role: "assistant",
                    parts: [{ type: "text", text: "B." }],
                },
            ],
            xmlSnapshots: [[0, doc]],
            diagramXml: doc,
            versions: [],
        })
        await sendMessage(page, "Chat A two")
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("AyOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(500)
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=bee")
        })
        await expect(canvas.getByText("BeeOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(1000)
        const chatA = (await savedChats(page)).find((c) =>
            c.texts.includes("Chat A two"),
        )
        expect(chatA).toBeTruthy()
        await page.evaluate((id) => {
            ;(window as any).next.router.replace(`?session=${id}`)
        }, chatA?.id)
        await expect(canvas.getByText("AyOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        const panel = page.locator('[data-testid="chat-panel"]')
        await expect(panel.locator('[data-testid="version-card"]')).toHaveCount(
            1,
        )
        await expect(panel.getByText("Stopped", { exact: true })).toHaveCount(0)
    })

    test("at the chat limit, saving a chat left by browser back keeps the chat gone back to", async ({
        page,
    }) => {
        await answerWithPause(page)
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("b", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        // 50 saved chats; the one gone back to is the oldest
        await page.evaluate(
            async ({ doc }) => {
                const db: IDBDatabase = await new Promise((resolve) => {
                    const request = indexedDB.open("next-ai-drawio")
                    request.onsuccess = () => resolve(request.result)
                })
                await new Promise((resolve) => {
                    const tx = db.transaction("sessions", "readwrite")
                    const store = tx.objectStore("sessions")
                    for (let i = 0; i < 50; i++) {
                        store.put({
                            id: i === 0 ? "oldest" : `chat-${i}`,
                            title: `Chat ${i}`,
                            createdAt: 1000 + i,
                            updatedAt: 1000 + i,
                            messages: [
                                {
                                    id: `u${i}`,
                                    role: "user",
                                    parts: [
                                        { type: "text", text: `Chat ${i}` },
                                    ],
                                },
                            ],
                            xmlSnapshots: [],
                            diagramXml: doc,
                            versions: [],
                        })
                    }
                    tx.oncomplete = resolve
                })
                db.close()
            },
            { doc },
        )
        await sendMessage(page, "Chat A two")
        await expect(page.getByText("A is answering.")).toBeVisible({
            timeout: 15000,
        })
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=oldest")
        })
        await expect(
            getIframeContent(page).getByText("BeeOne", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        // Kept from the start, not saved again after being deleted
        expect((await savedChats(page)).map((c) => c.id)).toContain("oldest")
        await page.waitForTimeout(1500)
        const ids = (await savedChats(page)).map((c) => c.id)
        expect(ids).toContain("oldest")
        expect(ids).toHaveLength(50)
    })

    test("a chat left by browser back while a cut off drawing waits for its continuation keeps the diagram from before it", async ({
        page,
    }) => {
        // Cut off in the middle of its second shape
        const cut = `${boxCell("p", "PartOne", 240)}<mxCell id="q" value="Cut" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="440"`
        const deltas = (
            JSON.stringify({ xml: cut }).match(/[\s\S]{1,30}/g) ?? []
        ).map((d) => ({
            type: "tool-input-delta",
            toolCallId: "cut",
            inputTextDelta: d,
        }))
        await slowReplies(
            page,
            [
                [createMockSSEResponse(boxCell("a", "AyOne", 40), "A.")],
                [
                    sseOf(
                        [
                            { type: "start" },
                            {
                                type: "tool-input-start",
                                toolCallId: "cut",
                                toolName: "display_diagram",
                            },
                            ...deltas,
                        ],
                        false,
                    ),
                    sseOf([
                        {
                            type: "tool-input-available",
                            toolCallId: "cut",
                            toolName: "display_diagram",
                            input: { xml: cut },
                        },
                        { type: "finish" },
                    ]),
                ],
                // The continuation never comes
                [sseOf([{ type: "start" }], false)],
            ],
            true,
        )
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("b", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        await seedSession(page, {
            id: "bee",
            title: "Chat B",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "bu",
                    role: "user",
                    parts: [{ type: "text", text: "Chat B" }],
                },
            ],
            xmlSnapshots: [],
            diagramXml: doc,
            versions: [],
        })
        await sendMessage(page, "Chat A one")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        const chatA = new URL(page.url()).searchParams.get("session")
        await page.waitForTimeout(1200)
        await sendMessage(page, "Chat A two")
        const canvas = getIframeContent(page)
        // The half drawn preview stays while the continuation is asked for
        await expect(canvas.getByText("PartOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(1500)
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=bee")
        })
        await expect(canvas.getByText("BeeOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await page.waitForTimeout(1000)
        const saved = await savedDiagram(page, chatA ?? undefined)
        expect(saved).toContain("AyOne")
        expect(saved).not.toContain("PartOne")
    })

    test("a chat gone back to while another answer streams is not saved again", async ({
        page,
    }) => {
        // Text keeps streaming: the chat's messages update all the time
        await page.addInitScript(() => {
            const realFetch = window.fetch
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const sse = (e: object) =>
                    new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)
                const body = new ReadableStream({
                    async start(c) {
                        c.enqueue(sse({ type: "start" }))
                        c.enqueue(sse({ type: "text-start", id: "t" }))
                        for (let i = 0; i < 600; i++) {
                            c.enqueue(
                                sse({
                                    type: "text-delta",
                                    id: "t",
                                    delta: `w${i} `,
                                }),
                            )
                            await new Promise((r) => setTimeout(r, 40))
                        }
                        c.close()
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("b", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        await seedSession(page, {
            id: "bee",
            title: "Chat B",
            createdAt: 1000,
            updatedAt: 1000,
            messages: [
                {
                    id: "bu",
                    role: "user",
                    parts: [{ type: "text", text: "Chat B" }],
                },
            ],
            xmlSnapshots: [],
            diagramXml: doc,
            versions: [],
        })
        await sendMessage(page, "Chat A")
        await expect(page.getByText(/w10 /)).toBeVisible({ timeout: 15000 })
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=bee")
        })
        await expect(
            getIframeContent(page).getByText("BeeOne", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        await page.waitForTimeout(3000)
        const updatedAt = await page.evaluate(async () => {
            const db: IDBDatabase = await new Promise((resolve) => {
                const request = indexedDB.open("next-ai-drawio")
                request.onsuccess = () => resolve(request.result)
            })
            const session: any = await new Promise((resolve) => {
                const request = db
                    .transaction("sessions")
                    .objectStore("sessions")
                    .get("bee")
                request.onsuccess = () => resolve(request.result)
            })
            db.close()
            return session?.updatedAt
        })
        expect(updatedAt).toBe(1000)
    })

    test("a chat gone back to while a file is being opened stays locked until the file is open", async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const real = Blob.prototype.text
            Blob.prototype.text = async function () {
                if ((window as any).__slowText) {
                    await new Promise((r) => setTimeout(r, 4000))
                }
                return real.call(this)
            }
        })
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("b", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        await seedSession(page, {
            id: "bee",
            title: "Chat B",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "bu",
                    role: "user",
                    parts: [{ type: "text", text: "Chat B" }],
                },
            ],
            xmlSnapshots: [],
            diagramXml: doc,
            versions: [],
        })
        await page.evaluate(() => {
            ;(window as any).__slowText = true
        })
        await openDrawioFile(
            page,
            "slow.drawio",
            `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("f", "FromFile", 40)}</root></mxGraphModel></diagram></mxfile>`,
        )
        await page.waitForTimeout(300)
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=bee")
        })
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("BeeOne", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        // The file is still being read: nothing can be sent yet
        await expect(getChatInput(page)).toBeDisabled()
        await expect(canvas.getByText("FromFile", { exact: true })).toBeVisible(
            {
                timeout: 15000,
            },
        )
        await expect(getChatInput(page)).toBeEnabled()
    })

    test("at the chat limit, the oldest chat opened from the list while the new chat waits for its save is kept", async ({
        page,
    }) => {
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(boxCell("a", "AyOne", 40), "A."),
            }),
        )
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("b", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        // 50 saved chats; the one opened from the list is the oldest
        await page.evaluate(
            async ({ doc }) => {
                const db: IDBDatabase = await new Promise((resolve) => {
                    const request = indexedDB.open("next-ai-drawio")
                    request.onsuccess = () => resolve(request.result)
                })
                await new Promise((resolve) => {
                    const tx = db.transaction("sessions", "readwrite")
                    const store = tx.objectStore("sessions")
                    for (let i = 0; i < 50; i++) {
                        store.put({
                            id: i === 0 ? "oldest" : `chat-${i}`,
                            title: i === 0 ? "The oldest" : `Chat ${i}`,
                            createdAt: 1000 + i,
                            updatedAt: 1000 + i,
                            messages: [
                                {
                                    id: `u${i}`,
                                    role: "user",
                                    parts: [
                                        { type: "text", text: `Chat ${i}` },
                                    ],
                                },
                            ],
                            xmlSnapshots: [],
                            diagramXml: doc,
                            versions: [],
                        })
                    }
                    tx.oncomplete = resolve
                })
                db.close()
            },
            { doc },
        )
        await page.reload({ waitUntil: "networkidle" })
        await expect(
            page.locator('[data-testid="canvas-loading"]'),
        ).toHaveCount(0, { timeout: 30000 })
        const oldest = page
            .getByRole("dialog")
            .getByRole("button", { name: /The oldest/ })
        await sendMessage(page, "Chat A")
        await waitForComplete(page)
        // Within the auto-save's wait: opening it saves this chat first
        await page.locator('[data-testid="session-title"]').click()
        await oldest.click()
        await expect(
            getIframeContent(page).getByText("BeeOne", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        expect((await savedChats(page)).map((c) => c.id)).toContain("oldest")
    })

    test("typing goes on in the composer after browser back to another chat", async ({
        page,
    }) => {
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(boxCell("a", "AyOne", 40), "A."),
            }),
        )
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("b", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        await seedSession(page, {
            id: "bee",
            title: "Chat B",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [
                {
                    id: "bu",
                    role: "user",
                    parts: [{ type: "text", text: "Chat B" }],
                },
            ],
            xmlSnapshots: [],
            diagramXml: doc,
            versions: [],
        })
        await sendMessage(page, "Chat A")
        await waitForComplete(page)
        await page.waitForTimeout(1500)
        const input = getChatInput(page)
        await input.click()
        await page.keyboard.type("Make it ")
        await page.evaluate(() => {
            ;(window as any).next.router.replace("?session=bee")
        })
        await expect(
            getIframeContent(page).getByText("BeeOne", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        await page.keyboard.type("blue")
        await expect(input).toHaveValue(/blue/)
    })

    test("at the chat limit, an auto-save that goes first keeps the oldest chat opened from the list", async ({
        page,
    }) => {
        // Thumbnails wait (at most 3 s): the click's save waits for one, the
        // auto-save of a new chat takes none and goes first
        await page.addInitScript(() => {
            const w = window as any
            const held: MessageEvent[] = []
            w.__holdExports = true
            w.__releaseExports = () => {
                w.__holdExports = false
                for (const e of held.splice(0)) {
                    const copy = new MessageEvent("message", {
                        data: e.data,
                        origin: e.origin,
                        source: e.source,
                    })
                    ;(copy as any).__released = true
                    window.dispatchEvent(copy)
                }
            }
            window.addEventListener("message", (event) => {
                if (
                    w.__holdExports &&
                    !(event as any).__released &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"') &&
                    event.data.includes('"message":"thumbnail-')
                ) {
                    event.stopImmediatePropagation()
                    held.push(event)
                }
            })
        })
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(boxCell("a", "AyOne", 40), "A."),
            }),
        )
        const doc = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${boxCell("b", "BeeOne", 40)}</root></mxGraphModel></diagram></mxfile>`
        await openApp(page)
        await page.evaluate(
            async ({ doc }) => {
                const db: IDBDatabase = await new Promise((resolve) => {
                    const request = indexedDB.open("next-ai-drawio")
                    request.onsuccess = () => resolve(request.result)
                })
                await new Promise((resolve) => {
                    const tx = db.transaction("sessions", "readwrite")
                    const store = tx.objectStore("sessions")
                    for (let i = 0; i < 50; i++) {
                        store.put({
                            id: i === 0 ? "oldest" : `chat-${i}`,
                            title: i === 0 ? "The oldest" : `Chat ${i}`,
                            createdAt: 1000 + i,
                            updatedAt: 1000 + i,
                            messages: [
                                {
                                    id: `u${i}`,
                                    role: "user",
                                    parts: [
                                        { type: "text", text: `Chat ${i}` },
                                    ],
                                },
                            ],
                            xmlSnapshots: [],
                            diagramXml: doc,
                            versions: [],
                        })
                    }
                    tx.oncomplete = resolve
                })
                db.close()
            },
            { doc },
        )
        await page.reload({ waitUntil: "networkidle" })
        await expect(
            page.locator('[data-testid="canvas-loading"]'),
        ).toHaveCount(0, { timeout: 30000 })
        await sendMessage(page, "Chat A")
        await waitForComplete(page)
        await page.locator('[data-testid="session-title"]').click()
        await page
            .getByRole("dialog")
            .getByRole("button", { name: /The oldest/ })
            .click()
        // The auto-save runs meanwhile
        await page.waitForTimeout(1500)
        await page.evaluate(() => (window as any).__releaseExports())
        await expect(
            getIframeContent(page).getByText("BeeOne", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        expect((await savedChats(page)).map((c) => c.id)).toContain("oldest")
    })
})
