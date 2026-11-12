/**
 * The canvas shell as start_session opens it by default: the built server
 * (dist/index.js, or the copy MCP_SERVER_ENTRY names: CI installs the packed
 * tarball in an empty directory) runs over stdio as an MCP client would
 * start it, and headless Chromium opens the URL it returns.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { expect, type FrameLocator, type Page, test } from "@playwright/test"

const pkg = join(dirname(fileURLToPath(import.meta.url)), "../..")

let client: Client
let dataDir: string
let shellUrl: string

test.beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "mcp-shell-e2e-"))
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [process.env.MCP_SERVER_ENTRY ?? join(pkg, "dist/index.js")],
        env: {
            ...process.env,
            DRAWIO_DATA_DIR: dataDir,
            // Away from the web app's dev server and other test runs
            PORT: String(6100 + Math.floor(Math.random() * 400)),
            BROWSER: "none",
        },
        stderr: "pipe",
    })
    client = new Client({ name: "shell-e2e", version: "0.0.1" })
    await client.connect(transport)
    const result = await client.callTool({
        name: "start_session",
        arguments: {},
    })
    const text = (result.content as { type: string; text?: string }[])
        .map((c) => c.text ?? "")
        .join("\n")
    const match = text.match(/Browser URL: (\S+)/)
    if (!match) throw new Error(`start_session gave no URL:\n${text}`)
    shellUrl = match[1]
})

test.afterAll(async () => {
    await client?.close()
    rmSync(dataDir, { recursive: true, force: true })
})

test("start_session opens the shell, which loads the bundled draw.io", async ({
    page,
}) => {
    expect(shellUrl).toMatch(/^http:\/\/localhost:\d+\/shell\/\?mcp=mcp-/)
    const errors: string[] = []
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text())
    })
    page.on("pageerror", (error) => errors.push(error.message))

    await page.goto(shellUrl)
    const iframe = page.locator("iframe[title='draw.io']")
    await expect(iframe).toHaveAttribute(
        "src",
        /^http:\/\/localhost:\d+\/drawio\/index\.html\?embed=1&proto=json&configure=1&/,
    )
    // The cover goes once draw.io sent "init" and loaded the first document
    await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
        timeout: 60_000,
    })
    const frame = page.frameLocator("iframe[title='draw.io']")
    await expect(frame.locator(".geDiagramContainer")).toBeVisible()

    // The shell's own texts and state: the first poll connects it
    await expect(page.getByTestId("shell-status")).toHaveText(
        "Connected to the MCP server",
    )
    // The session id's random part, until the diagram is in a file
    await expect(page.getByTestId("shell-session")).toHaveText(
        shellUrl.split("-").pop() ?? "",
    )
    expect(errors).toEqual([])
})

// --- The sync with the server (shell/use-mcp-sync.ts) ---

// Each test draws labels of its own: the previous test's diagram is on the
// canvas when a test starts, and a label shared with it would be visible
// before the test's own write arrives
const box = (id: string, label: string, x: number) =>
    `<mxCell id="${id}" value="${label}" x="${x}" y="40" w="120" h="60"/>`

const toolText = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args })
    return (result.content as { type: string; text?: string }[])
        .map((c) => c.text ?? "")
        .join("\n")
}

/** The shell with the bundled draw.io ready and in step with the server */
async function openShell(page: Page) {
    await page.goto(shellUrl)
    await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
        timeout: 60_000,
    })
    await expect(page.getByTestId("shell-status")).toHaveAttribute(
        "data-status",
        "connected",
    )
    return page.frameLocator("iframe[title='draw.io']")
}

test("an edit is marked on the canvas, and one Ctrl+Z takes it back for the server too", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", {
        xml: `${box("2", "Node A", 40)}\n${box("3", "Node B", 240)}`,
    })
    await expect(frame.getByText("Node A")).toBeVisible({ timeout: 10_000 })
    await toolText("edit_diagram", {
        operations: [
            { operation: "add", cell_id: "5", new_xml: box("5", "Gamma", 440) },
        ],
    })
    await expect(frame.getByText("Gamma")).toBeVisible({ timeout: 10_000 })
    // The editor bridge outlines the changed shape (editor-bridge.ts
    // HIGHLIGHT_OUTLINE); the write went on the canvas in place
    await expect(frame.locator('[stroke="#a86b00"]')).toHaveCount(1)

    await frame
        .locator(".geDiagramContainer")
        .click({ position: { x: 10, y: 10 } })
    await page.keyboard.press("Control+z")
    await expect(frame.getByText("Gamma")).toHaveCount(0)
    await expect(frame.getByText("Node A")).toBeVisible()
    // The undo is pushed: the server's diagram has no Gamma (get_diagram
    // also names the removed cell in its notes, so look at the XML)
    await expect
        .poll(async () => (await toolText("get_diagram")).includes('id="5"'), {
            timeout: 10_000,
        })
        .toBe(false)
    expect(await toolText("get_diagram")).toContain('value="Node A"')
})

test("a change made in the editor is pushed, and get_diagram returns it", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", { xml: box("2", "Solo", 40) })
    await expect(frame.getByText("Solo")).toBeVisible({ timeout: 10_000 })
    // draw.io keeps no global editor; in embed mode Draw.loadPlugin hands
    // it to the callback at once
    await frame.locator("body").evaluate((body) => {
        const w = body.ownerDocument.defaultView as any
        w.Draw.loadPlugin((ui: any) => {
            const graph = ui.editor.graph
            graph.getModel().beginUpdate()
            try {
                graph.insertVertex(
                    graph.getDefaultParent(),
                    "manual-1",
                    "Manual",
                    40,
                    200,
                    120,
                    60,
                    "rounded=1;",
                )
            } finally {
                graph.getModel().endUpdate()
            }
        })
    })
    await expect(frame.getByText("Manual")).toBeVisible()
    await expect
        .poll(
            async () =>
                (await toolText("get_diagram")).includes('id="manual-1"'),
            { timeout: 10_000 },
        )
        .toBe(true)
})

test("exporting another page shows it for a moment, then the user's page comes back", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", { xml: box("2", "First page", 40) })
    await expect(frame.getByText("First page")).toBeVisible({ timeout: 10_000 })
    await toolText("add_page", {
        name: "Second",
        xml: `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="s1" value="OnSecond" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>`,
    })
    await expect(frame.getByText("Second", { exact: true })).toBeVisible({
        timeout: 10_000,
    })
    // The preview follows the page the agent changed; the user goes back
    const activeTab = frame.locator(".geTabContainer .geActivePage")
    await expect(activeTab).toHaveText("Second", { timeout: 10_000 })
    await frame
        .locator(".geTabContainer")
        .getByText("Page-1", { exact: true })
        .click()
    await expect(activeTab).toHaveText("Page-1")
    // SVG has no page option in draw.io: the server sends a one-page
    // projection, which the shell shows only for the export
    const file = join(dataDir, "second.svg")
    const text = await toolText("export_diagram", {
        path: file,
        page_name: "Second",
    })
    expect(text).toContain("exported successfully")
    expect(readFileSync(file, "utf8")).toContain("OnSecond")
    await expect(frame.getByText("First page")).toBeVisible({ timeout: 10_000 })
    await expect(activeTab).toHaveText("Page-1")
    // The projection was never pushed as the document
    const xml = await toolText("get_diagram")
    expect(xml).toContain('value="First page"')
    expect(xml).toContain('name="Second"')
    // Without a selector the result names the page that was on screen
    const onScreen = await toolText("export_diagram", {
        path: join(dataDir, "on-screen.png"),
    })
    expect(onScreen).toContain(
        'showing page "Page-1", the one on screen; the diagram has 2 pages, pass page_index to export another',
    )
})

test("a .drawio.svg path with format svg still gets a file load_diagram can open", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", { xml: box("2", "Editable", 40) })
    await expect(frame.getByText("Editable")).toBeVisible({ timeout: 10_000 })
    const file = join(dataDir, "editable.drawio.svg")
    const text = await toolText("export_diagram", { path: file, format: "svg" })
    expect(text).toContain("Format: drawio.svg")
    expect(text).toContain("Embedded diagram: Pages (1)")
    // A plain SVG under this name was refused: "no embedded diagram"
    expect(await toolText("load_diagram", { path: file })).toContain(
        `Diagram loaded from ${file}`,
    )
})

test("a screenshot of another page leaves the page on screen alone", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", { xml: box("2", "Front page", 40) })
    await expect(frame.getByText("Front page")).toBeVisible({ timeout: 10_000 })
    await toolText("add_page", {
        name: "Backside",
        xml: `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="b1" value="OnBack" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>`,
    })
    const tabs = frame.locator(".geTabContainer")
    await expect(tabs.getByText("Backside", { exact: true })).toBeVisible({
        timeout: 10_000,
    })
    const activeTab = tabs.locator(".geActivePage")
    // The preview follows the page the agent changed; the user goes back
    await expect(activeTab).toHaveText("Backside", { timeout: 10_000 })
    await tabs.getByText("Page-1", { exact: true }).click()
    await expect(activeTab).toHaveText("Page-1")
    // The page on screen, as the editor reports it to the server
    const before = await toolText("get_selection")
    expect(before).toContain('page "Page-1"')

    // PNG: draw.io renders the other page by its id, off screen; the shell
    // never shows it as a projection, so the page on screen does not change
    const png = async (args: Record<string, unknown>) => {
        const result = await client.callTool({
            name: "screenshot_diagram",
            arguments: args,
        })
        const image = (
            result.content as {
                type: string
                data?: string
                mimeType?: string
            }[]
        ).find((c) => c.type === "image")
        expect(result.isError ?? false).toBe(false)
        expect(image?.mimeType).toBe("image/png")
        expect(image?.data?.length ?? 0).toBeGreaterThan(1000)
        return image?.data ?? ""
    }
    const back = await png({ page_name: "Backside" })
    await expect(activeTab).toHaveText("Page-1")
    await expect(frame.getByText("Front page")).toBeVisible()
    expect(await toolText("get_selection")).toContain('page "Page-1"')
    // Another picture than the page on screen
    expect(await png({})).not.toBe(back)
    // The text beside the picture says what to do when the client passes
    // the model no picture
    const text = await toolText("screenshot_diagram", { page_name: "Backside" })
    expect(text).toContain(
        'Screenshot of page name="Backside". If no image came with this result,',
    )
    expect(text).toContain("do not take more screenshots")
})

test("get_selection reports the cells selected in the editor", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", {
        xml: `${box("2", "Pick me", 40)}\n${box("3", "Leave me", 240)}\n<mxCell id="4" value="link" source="2" target="3"/>`,
    })
    await expect(frame.getByText("Pick me")).toBeVisible({ timeout: 10_000 })
    const nothing = await toolText("get_selection")
    expect(nothing).toContain("Nothing is selected")
    expect(nothing).toContain('page "Page-1"')

    // Select a shape and the edge in the editor, as a click would
    await frame.locator("body").evaluate((body) => {
        const w = body.ownerDocument.defaultView as any
        w.Draw.loadPlugin((ui: any) => {
            const graph = ui.editor.graph
            graph.setSelectionCells([
                graph.model.getCell("2"),
                graph.model.getCell("4"),
            ])
        })
    })
    const text = await toolText("get_selection")
    expect(text).toContain('2 cells selected on page "Page-1"')
    expect(text).toContain('id="2" shape "Pick me" at x=40 y=40 w=120 h=60')
    expect(text).toContain('id="4" edge "link" from "2" to "3"')
    expect(text).not.toContain('id="3"')

    // A shape in a container is reported with it, also after the user
    // entered the container (Ctrl+Shift+End), where it is the default parent
    await toolText("create_new_diagram", {
        xml: `<mxCell id="box" value="Box" style="swimlane;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="300" height="200" as="geometry"/></mxCell>\n<mxCell id="kid" value="Kid" style="rounded=1;" vertex="1" parent="box"><mxGeometry x="20" y="30" width="120" height="60" as="geometry"/></mxCell>`,
    })
    await expect(frame.getByText("Kid")).toBeVisible({ timeout: 10_000 })
    await frame.locator("body").evaluate((body) => {
        const w = body.ownerDocument.defaultView as any
        w.Draw.loadPlugin((ui: any) => {
            const graph = ui.editor.graph
            graph.enterGroup(graph.model.getCell("box"))
            graph.setSelectionCell(graph.model.getCell("kid"))
        })
    })
    const inside = await toolText("get_selection")
    expect(inside).toContain(
        'id="kid" shape "Kid" at x=20 y=30 w=120 h=60 inside "box"',
    )
    await frame.locator("body").evaluate((body) => {
        const w = body.ownerDocument.defaultView as any
        w.Draw.loadPlugin((ui: any) => ui.editor.graph.exitGroup())
    })
})

test("the download button saves the diagram as a file", async ({ page }) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", { xml: box("2", "Keep me", 40) })
    await expect(frame.getByText("Keep me")).toBeVisible({ timeout: 10_000 })
    await page.getByTestId("download").click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // The dialog's utility classes are in the shell's stylesheet (shell.css
    // names the shared component with @source): the formats in two columns
    const columns = await dialog
        .getByRole("radiogroup")
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    expect(columns.split(" ")).toHaveLength(2)
    // .drawio is the default format
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Export" }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(
        /^diagram-\d{4}-\d{2}-\d{2}\.drawio$/,
    )
    // draw.io's own export of the document (compressed pages, as the web
    // app saves them; load_diagram opens them)
    const saved = readFileSync(await file.path(), "utf8")
    expect(saved).toMatch(/^<mxfile\b/)
    expect(saved).toContain('name="Page-1"')
})

test("the download waits for a page export's projection, and saves every page", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", { xml: box("2", "Stay here", 40) })
    await expect(frame.getByText("Stay here")).toBeVisible({ timeout: 10_000 })
    await toolText("add_page", {
        name: "Elsewhere",
        xml: `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="e1" value="OnElsewhere" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>`,
    })
    await expect(
        frame
            .locator(".geTabContainer")
            .getByText("Elsewhere", { exact: true }),
    ).toBeVisible({ timeout: 10_000 })
    // The preview follows the page the agent changed; the user goes back,
    // so OnElsewhere shows again only as the export's projection
    const activeTab = frame.locator(".geTabContainer .geActivePage")
    await expect(activeTab).toHaveText("Elsewhere", { timeout: 10_000 })
    await frame
        .locator(".geTabContainer")
        .getByText("Page-1", { exact: true })
        .click()
    await expect(activeTab).toHaveText("Page-1")
    await expect(frame.getByText("OnElsewhere")).toHaveCount(0)
    await page.getByTestId("download").click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    // The export's result is held up for 2 s: the one-page projection of
    // the other page is surely still on the canvas when Export is clicked
    await page.route("**/api/state", async (route) => {
        const request = route.request()
        if (
            request.method() === "POST" &&
            (request.postData() ?? "").includes('"exportData"')
        ) {
            await new Promise((r) => setTimeout(r, 2000))
        }
        await route.continue()
    })
    const exported = toolText("export_diagram", {
        path: join(dataDir, "elsewhere.svg"),
        page_name: "Elsewhere",
    })
    await expect(frame.getByText("OnElsewhere")).toBeVisible({
        timeout: 10_000,
    })
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Export" }).click()
    // Saved once the user's document is back: both pages, not the projection
    const saved = readFileSync(await (await download).path(), "utf8")
    expect(saved.match(/<diagram\b/g)).toHaveLength(2)
    expect(saved).toContain('name="Page-1"')
    expect(saved).toContain('name="Elsewhere"')
    expect(await exported).toContain("exported successfully")
})

/** A shape added in the editor, as the user would draw one */
const addByHand = (frame: FrameLocator, id: string, label: string) =>
    frame.locator("body").evaluate(
        (body, cell) => {
            const w = body.ownerDocument.defaultView as any
            w.Draw.loadPlugin((ui: any) => {
                const graph = ui.editor.graph
                graph.getModel().beginUpdate()
                try {
                    graph.insertVertex(
                        graph.getDefaultParent(),
                        cell.id,
                        cell.label,
                        40,
                        200,
                        120,
                        60,
                        "rounded=1;",
                    )
                } finally {
                    graph.getModel().endUpdate()
                }
            })
        },
        { id, label },
    )

/** The server's document, read as the page polls it: get_diagram would ask
 * the tab for its canvas first */
const serverXml = (page: Page) =>
    page.evaluate(async () => {
        const config = (window as any).__MCP_CONFIG__
        const r = await fetch(`/api/state?sessionId=${config.sessionId}`, {
            headers: { "X-Drawio-Token": config.token },
        })
        return String((await r.json()).xml)
    })

test("a hand edit whose save failed is sent again once the server answers", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", { xml: box("2", "Retry me", 40) })
    await expect(frame.getByText("Retry me")).toBeVisible({ timeout: 10_000 })
    // The connection drops for the edit's POST only, as a tunnel or a proxy
    // in front of a remote preview does; the polls get through
    let dropped = 0
    await page.route("**/api/state", async (route) => {
        const request = route.request()
        if (
            request.method() === "POST" &&
            dropped === 0 &&
            (request.postData() ?? "").includes('"source":"edit"')
        ) {
            dropped++
            await route.abort("connectionfailed")
            return
        }
        await route.continue()
    })
    await addByHand(frame, "retry-1", "Sent again")
    await expect(frame.getByText("Sent again")).toBeVisible()
    await expect.poll(() => dropped).toBe(1)
    // The next poll gets through, and the edit follows it
    await expect
        .poll(async () => (await serverXml(page)).includes('id="retry-1"'), {
            timeout: 10_000,
        })
        .toBe(true)
    // The notice about the unreachable server is gone again
    await expect(page.getByTestId("shell-status")).toHaveAttribute(
        "data-status",
        "connected",
    )
    await expect(page.getByText(/only in this tab/)).toHaveCount(0)
})

test("the notice stays and the browser asks before the page is left while an edit is not saved", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", { xml: box("2", "Stay or go", 40) })
    await expect(frame.getByText("Stay or go")).toBeVisible({ timeout: 10_000 })
    // The server cannot be reached any more (the MCP client was closed)
    await page.route("**/api/**", (route) => route.abort("connectionrefused"))
    // Chrome asks only on a page the user has clicked on
    await page.getByText("Next AI Draw.io").click()
    await addByHand(frame, "unsent-1", "Not saved yet")
    const notice = page.getByText(/only in this tab/)
    await expect(notice).toBeVisible()
    await expect(page.getByTestId("shell-status")).toHaveAttribute(
        "data-status",
        "offline",
    )
    const asked = page.waitForEvent("dialog")
    await page.evaluate(() => {
        setTimeout(() => location.reload(), 0)
    })
    const dialog = await asked
    expect(dialog.type()).toBe("beforeunload")
    await dialog.dismiss()
    // The user stayed: the edit is on the canvas, and the notice is still
    // up after the 8 s other notices get
    await page.waitForTimeout(8500)
    await expect(frame.getByText("Not saved yet")).toBeVisible()
    await expect(notice).toBeVisible()
    // The server answers again: the edit is saved and the notice goes
    await page.unroute("**/api/**")
    await expect
        .poll(async () => (await serverXml(page)).includes('id="unsent-1"'), {
            timeout: 10_000,
        })
        .toBe(true)
    await expect(notice).toHaveCount(0)
})

test("the cells the user selected stay selected when the AI changes the page", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", {
        xml: `${box("2", "Mine one", 40)}\n${box("3", "Mine two", 240)}\n${box("4", "Not mine", 440)}`,
    })
    await expect(frame.getByText("Mine two")).toBeVisible({ timeout: 10_000 })
    await frame.locator("body").evaluate((body) => {
        const w = body.ownerDocument.defaultView as any
        w.Draw.loadPlugin((ui: any) => {
            const graph = ui.editor.graph
            graph.setSelectionCells([
                graph.model.getCell("2"),
                graph.model.getCell("3"),
            ])
        })
    })
    expect(await toolText("get_selection")).toContain("2 cells selected")
    // "Make these green": the write replaces the page's cells in place
    await toolText("edit_diagram", {
        operations: ["2", "3"].map((id) => ({
            operation: "update",
            cell_id: id,
            new_xml: `<mxCell id="${id}" value="Green ${id}" style="rounded=1;fillColor=#d5e8d4;" x="${id === "2" ? 40 : 240}" y="40" w="120" h="60"/>`,
        })),
    })
    await expect(frame.getByText("Green 3")).toBeVisible({ timeout: 10_000 })
    // What the AI changed is still outlined, and the user's selection is
    // the same two cells: "now make them bigger" finds them
    await expect(frame.locator('[stroke="#a86b00"]')).toHaveCount(2)
    const selection = await toolText("get_selection")
    expect(selection).toContain('2 cells selected on page "Page-1"')
    expect(selection).toContain('id="2" shape "Green 2"')
    expect(selection).toContain('id="3" shape "Green 3"')
})

test("an AI write waits while the user types a label, and the label is kept in History", async ({
    page,
}) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", {
        xml: `${box("2", "Type here", 40)}\n${box("3", "AI target", 240)}`,
    })
    await expect(frame.getByText("Type here")).toBeVisible({ timeout: 10_000 })
    await frame.getByText("Type here", { exact: true }).dblclick()
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type("Half typed")
    const labelEditor = frame.locator(".mxCellEditor")
    await expect(labelEditor).toHaveCount(1)
    await toolText("edit_diagram", {
        operations: [
            {
                operation: "update",
                cell_id: "3",
                new_xml: box("3", "AI wrote", 240),
            },
        ],
    })
    // The next poll brings the write: it is not loaded over the label
    // being typed
    await page.waitForTimeout(2600)
    await expect(labelEditor).toHaveCount(1)
    await expect(frame.getByText("AI wrote")).toHaveCount(0)
    await page.keyboard.type(" label")
    await frame
        .locator(".geDiagramContainer")
        .click({ position: { x: 400, y: 400 } })
    // The finished label lost against the write: the page says so, the
    // write is on the canvas and the label is in History
    await expect(
        page.getByText(/Your last change was saved in History/),
    ).toBeVisible({ timeout: 10_000 })
    await expect(frame.getByText("AI wrote")).toBeVisible({ timeout: 10_000 })
    const kept = await page.evaluate(async () => {
        const config = (window as any).__MCP_CONFIG__
        const r = await fetch(`/api/history?sessionId=${config.sessionId}`, {
            headers: { "X-Drawio-Token": config.token },
        })
        const entries: { xml: string }[] = (await r.json()).entries
        return entries.some((e) => e.xml.includes("Half typed label"))
    })
    expect(kept).toBe(true)
    // No key went to the editor as a shortcut: the two layers, two shapes
    expect((await serverXml(page)).match(/<mxCell /g)).toHaveLength(4)
})

// --- Version cards from the server's History (shell/node-versions-source.ts) ---

test("the version cards follow the server's History; undo, redo and restore go through it", async ({
    page,
}) => {
    // A session of its own, so History holds only this test's versions
    const started = await toolText("start_session")
    const url = started.match(/Browser URL: (\S+)/)?.[1]
    if (!url) throw new Error(`start_session gave no URL:\n${started}`)
    await page.goto(url)
    await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
        timeout: 60_000,
    })
    await expect(page.getByTestId("shell-status")).toHaveAttribute(
        "data-status",
        "connected",
    )
    const frame = page.frameLocator("iframe[title='draw.io']")
    const cards = page.getByTestId("version-card")
    const latestCard = cards.last()
    const getDiagram = () => toolText("get_diagram")

    // Three writes, three cards; the newest can be undone
    await toolText("create_new_diagram", { xml: box("a", "Card A", 40) })
    await expect(frame.getByText("Card A")).toBeVisible({ timeout: 10_000 })
    await expect(cards).toHaveCount(1, { timeout: 10_000 })
    await expect(cards.first()).toContainText("Drew the diagram")
    await toolText("edit_diagram", {
        operations: [
            {
                operation: "add",
                cell_id: "b",
                new_xml: box("b", "Card B", 240),
            },
        ],
    })
    await expect(frame.getByText("Card B")).toBeVisible({ timeout: 10_000 })
    await toolText("edit_diagram", {
        operations: [
            {
                operation: "add",
                cell_id: "c",
                new_xml: box("c", "Card C", 440),
            },
        ],
    })
    await expect(frame.getByText("Card C")).toBeVisible({ timeout: 10_000 })
    await expect(cards).toHaveCount(3, { timeout: 10_000 })
    await expect(latestCard).toContainText("Changed the diagram")
    await expect(latestCard.getByTestId("version-undo")).toHaveText(
        /Undo change/,
    )

    // Undo: the server restores the version before; the card says so
    await latestCard.getByTestId("version-undo").click()
    await expect(frame.getByText("Card C")).toHaveCount(0, { timeout: 10_000 })
    await expect(frame.getByText("Card B")).toBeVisible()
    await expect(latestCard).toContainText("Change undone")
    await expect(latestCard.getByTestId("version-undo")).toHaveText(
        /Redo change/,
    )
    // A restore adds a History entry, not a card
    await expect(cards).toHaveCount(3)
    await expect
        .poll(async () => (await getDiagram()).includes('id="c"'), {
            timeout: 10_000,
        })
        .toBe(false)

    // Redo: the newest version is back on the canvas and the server
    await latestCard.getByTestId("version-undo").click()
    await expect(frame.getByText("Card C")).toBeVisible({ timeout: 10_000 })
    await expect(latestCard).toContainText("Changed the diagram")
    await expect(latestCard.getByTestId("version-undo")).toHaveText(
        /Undo change/,
    )
    await expect
        .poll(async () => (await getDiagram()).includes('id="c"'), {
            timeout: 10_000,
        })
        .toBe(true)

    // A hand edit: no version is on the canvas, so the newest card offers
    // a restore, not an undo
    await frame.locator("body").evaluate((body) => {
        const w = body.ownerDocument.defaultView as any
        w.Draw.loadPlugin((ui: any) => {
            const graph = ui.editor.graph
            graph.getModel().beginUpdate()
            try {
                graph.insertVertex(
                    graph.getDefaultParent(),
                    "manual-card",
                    "By hand",
                    40,
                    200,
                    120,
                    60,
                    "rounded=1;",
                )
            } finally {
                graph.getModel().endUpdate()
            }
        })
    })
    await expect
        .poll(async () => (await getDiagram()).includes('id="manual-card"'), {
            timeout: 10_000,
        })
        .toBe(true)
    await expect(latestCard.getByTestId("version-restore")).toBeVisible()
    await expect(cards).toHaveCount(3)

    // Restoring the first version keeps the hand edit as a version of its
    // own, and get_diagram agrees with the canvas
    await cards.first().getByTestId("version-restore").click()
    await expect(frame.getByText("Card B")).toHaveCount(0, { timeout: 10_000 })
    await expect(frame.getByText("By hand")).toHaveCount(0)
    await expect(frame.getByText("Card A")).toBeVisible()
    await expect(cards).toHaveCount(4, { timeout: 10_000 })
    await expect(cards.nth(3)).toContainText("Changed by hand")
    // The first version is on the canvas: its restore button rests
    await expect(cards.first().getByTestId("version-restore")).toBeDisabled()
    await expect
        .poll(getDiagram, { timeout: 10_000 })
        .toContain('value="Card A"')
    const xml = await getDiagram()
    expect(xml).not.toContain('id="b"')
    expect(xml).not.toContain('id="manual-card"')
    // The MCP tool sees the same versions: the hand edit is one step back
    expect(await toolText("restore_version", { steps_back: 1 })).toContain(
        "Restored the version 1 step(s) back",
    )
    await expect(frame.getByText("By hand")).toBeVisible({ timeout: 10_000 })
    await expect(cards).toHaveCount(4)

    // A page rename changes no shape: its card says what it was
    await toolText("rename_page", { page_index: 0, new_name: "Overview" })
    await expect(cards).toHaveCount(5, { timeout: 10_000 })
    await expect(latestCard).toContainText("Renamed a page")
    await expect(latestCard).not.toContainText("Changed the diagram")
})

test("an edit with coordinates of 0 is not taken for a hand edit, and one undo takes it back", async ({
    page,
}) => {
    // A session of its own, so History holds only this test's versions
    const started = await toolText("start_session")
    const url = started.match(/Browser URL: (\S+)/)?.[1]
    if (!url) throw new Error(`start_session gave no URL:\n${started}`)
    await page.goto(url)
    await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
        timeout: 60_000,
    })
    await expect(page.getByTestId("shell-status")).toHaveAttribute(
        "data-status",
        "connected",
    )
    const frame = page.frameLocator("iframe[title='draw.io']")
    // draw.io writes these label offsets back without x="0"
    const edge = (id: string, source: string, target: string) =>
        `<mxCell id="${id}" value="${id}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"><mxPoint x="0" y="-18" as="offset"/></mxGeometry></mxCell>`

    await toolText("create_new_diagram", {
        xml: [
            box("z1", "Zero A", 40),
            box("z2", "Zero B", 240),
            edge("ze1", "z1", "z2"),
        ].join("\n"),
    })
    await expect(frame.getByText("Zero B")).toBeVisible({ timeout: 10_000 })
    await toolText("edit_diagram", {
        operations: [
            {
                operation: "add",
                cell_id: "z3",
                new_xml: box("z3", "Zero C", 440),
            },
            {
                operation: "add",
                cell_id: "ze2",
                new_xml: edge("ze2", "z2", "z3"),
            },
        ],
    })
    await expect(frame.getByText("Zero C")).toBeVisible({ timeout: 10_000 })
    // draw.io's copy of the canvas reached the server
    await expect
        .poll(async () => (await toolText("get_diagram")).includes('x="0"'), {
            timeout: 10_000,
        })
        .toBe(false)
    await expect(page.getByTestId("version-edited-since")).toHaveCount(0)

    expect(await toolText("restore_version", { steps_back: 1 })).toContain(
        "Restored the version 1 step(s) back",
    )
    await expect(frame.getByText("Zero C")).toHaveCount(0, { timeout: 10_000 })
    await expect(frame.getByText("Zero B")).toBeVisible()
})

test("an edit with written-out defaults and long numbers is not taken for a hand edit, and one undo takes it back", async ({
    page,
}) => {
    // A session of its own, so History holds only this test's versions
    const started = await toolText("start_session")
    const url = started.match(/Browser URL: (\S+)/)?.[1]
    if (!url) throw new Error(`start_session gave no URL:\n${started}`)
    await page.goto(url)
    await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
        timeout: 60_000,
    })
    await expect(page.getByTestId("shell-status")).toHaveAttribute(
        "data-status",
        "connected",
    )
    const frame = page.frameLocator("iframe[title='draw.io']")

    await toolText("create_new_diagram", {
        xml: [box("k1", "Kiwi A", 40), box("k2", "Kiwi B", 240)].join("\n"),
    })
    await expect(frame.getByText("Kiwi B")).toBeVisible({ timeout: 10_000 })
    // draw.io writes this cell back without the flags and relative="0",
    // and its numbers as 440, 40.5 and 120
    await toolText("edit_diagram", {
        operations: [
            {
                operation: "add",
                cell_id: "k3",
                new_xml: `<mxCell id="k3" value="Kiwi C" vertex="1" connectable="1" collapsed="0" visible="1" parent="1"><mxGeometry x="440.0" y="40.50" width="120.0" height="60" relative="0" as="geometry"/></mxCell>`,
            },
        ],
    })
    await expect(frame.getByText("Kiwi C")).toBeVisible({ timeout: 10_000 })
    // draw.io's copy of the canvas reached the server, and is no hand edit
    let read = ""
    await expect
        .poll(
            async () => {
                read = await toolText("get_diagram")
                return read.includes("40.50")
            },
            { timeout: 10_000 },
        )
        .toBe(false)
    expect(read).not.toContain("the user changed the diagram")
    await expect(page.getByTestId("version-edited-since")).toHaveCount(0)

    expect(await toolText("restore_version", { steps_back: 1 })).toContain(
        "Restored the version 1 step(s) back",
    )
    await expect(frame.getByText("Kiwi C")).toHaveCount(0, {
        timeout: 10_000,
    })
    await expect(frame.getByText("Kiwi B")).toBeVisible()
})

test("draw.io's order of the cells is not taken for a hand edit, and one undo takes the drawing back", async ({
    page,
}) => {
    // A session of its own, so History holds only this test's versions
    const started = await toolText("start_session")
    const url = started.match(/Browser URL: (\S+)/)?.[1]
    if (!url) throw new Error(`start_session gave no URL:\n${started}`)
    await page.goto(url)
    await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
        timeout: 60_000,
    })
    await expect(page.getByTestId("shell-status")).toHaveAttribute(
        "data-status",
        "connected",
    )
    const frame = page.frameLocator("iframe[title='draw.io']")
    const group = (id: string, label: string, x: number) =>
        `<mxCell id="${id}" value="${label}" style="swimlane;startSize=24;" vertex="1" x="${x}" y="40" w="180" h="140"/>`
    const kid = (id: string, label: string, parent: string) =>
        `<mxCell id="${id}" value="${label}" vertex="1" parent="${parent}" x="20" y="50" w="120" h="50"/>`

    await toolText("create_new_diagram", { xml: box("o1", "Order first", 40) })
    await expect(frame.getByText("Order first")).toBeVisible({
        timeout: 10_000,
    })
    // Both groups first, their children after them; draw.io writes each
    // group's children right after it
    await toolText("create_new_diagram", {
        xml: [
            group("g1", "Group one", 40),
            group("g2", "Group two", 260),
            kid("k1", "Kid one", "g1"),
            kid("k2", "Kid two", "g2"),
        ].join("\n"),
    })
    await expect(frame.getByText("Kid two")).toBeVisible({ timeout: 10_000 })
    // An export sends draw.io's copy of the canvas to the server
    await toolText("export_diagram", { path: join(dataDir, "order.drawio") })
    await expect
        .poll(
            async () => {
                const xml = await toolText("get_diagram")
                const k1 = xml.indexOf('id="k1"')
                return k1 >= 0 && k1 < xml.indexOf('id="g2"')
            },
            { timeout: 10_000 },
        )
        .toBe(true)
    await expect(page.getByTestId("version-edited-since")).toHaveCount(0)

    expect(await toolText("restore_version", { steps_back: 1 })).toContain(
        "Restored the version 1 step(s) back",
    )
    await expect(frame.getByText("Kid two")).toHaveCount(0, { timeout: 10_000 })
    await expect(frame.getByText("Order first")).toBeVisible()
})

test("an edge to a missing cell and a page without root cells are not taken for a hand edit", async ({
    page,
}) => {
    // A session of its own, so History holds only this test's versions
    const started = await toolText("start_session")
    const url = started.match(/Browser URL: (\S+)/)?.[1]
    if (!url) throw new Error(`start_session gave no URL:\n${started}`)
    await page.goto(url)
    await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
        timeout: 60_000,
    })
    await expect(page.getByTestId("shell-status")).toHaveAttribute(
        "data-status",
        "connected",
    )
    const frame = page.frameLocator("iframe[title='draw.io']")

    // draw.io drops a target that names no cell; the server did so already
    // and said it, so draw.io's copy is no change
    const drawn = await toolText("create_new_diagram", {
        xml: [
            box("d1", "Dangling A", 40),
            box("d2", "Dangling B", 240),
            '<mxCell id="d3" source="d1" target="nowhere"/>',
        ].join("\n"),
    })
    expect(drawn).toContain('d3 (target "nowhere")')
    await expect(frame.getByText("Dangling B")).toBeVisible({ timeout: 10_000 })
    // An export sends draw.io's copy of the canvas to the server
    await toolText("export_diagram", { path: join(dataDir, "dangling.drawio") })
    await expect(page.getByTestId("version-edited-since")).toHaveCount(0)
    expect(await toolText("get_diagram")).not.toContain("the user changed")
    expect(
        await toolText("edit_diagram", {
            operations: [
                {
                    operation: "update",
                    cell_id: "d2",
                    new_xml: box("d2", "Dangling B2", 240),
                },
            ],
        }),
    ).toContain("Diagram edited successfully")

    // A page the model wrote in full without the root cells shows its shape
    await toolText("create_new_diagram", {
        xml: `<mxGraphModel><root>${box("r1", "No root cells", 40)}</root></mxGraphModel>`,
    })
    await expect(frame.getByText("No root cells")).toBeVisible({
        timeout: 10_000,
    })
    await toolText("export_diagram", { path: join(dataDir, "roots.drawio") })
    await expect(page.getByTestId("version-edited-since")).toHaveCount(0)
    expect(await toolText("get_diagram")).not.toContain("the user changed")
})

test("the theme toggle switches the page and draw.io, and is remembered", async ({
    page,
}) => {
    await page.goto(shellUrl)
    await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
        timeout: 60_000,
    })
    const html = page.locator("html")
    const frameBody = page
        .frameLocator("iframe[title='draw.io']")
        .locator("body")
    await expect(html).not.toHaveClass(/dark/)
    await expect(frameBody).not.toHaveClass(/geDarkMode/)

    await page.getByTestId("theme-toggle").click()
    await expect(html).toHaveClass(/dark/)
    // Same-origin draw.io switches in place, without a reload
    await expect(frameBody).toHaveClass(/geDarkMode/)
    expect(
        await page.evaluate(() => localStorage.getItem("mcp:dark-mode")),
    ).toBe("true")

    await page.reload()
    await expect(html).toHaveClass(/dark/)
    await page.getByTestId("theme-toggle").click()
    await expect(html).not.toHaveClass(/dark/)
})
