/**
 * The canvas shell as start_session opens it with DRAWIO_PREVIEW_UI=shell:
 * the built server (dist/index.js, or the copy MCP_SERVER_ENTRY names: CI
 * installs the packed tarball in an empty directory) runs over stdio as an
 * MCP client would start it, and headless Chromium opens the URL it returns.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { expect, type Page, test } from "@playwright/test"

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
            DRAWIO_PREVIEW_UI: "shell",
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
    await expect(page.getByTestId("shell-session")).toHaveText(
        shellUrl.slice(-8),
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

test("a diagram the MCP draws appears in the shell", async ({ page }) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", {
        xml: `${box("2", "Alpha", 40)}\n${box("3", "Beta", 240)}\n<mxCell id="4" source="2" target="3"/>`,
    })
    await expect(frame.getByText("Alpha")).toBeVisible({ timeout: 10_000 })
    await expect(frame.getByText("Beta")).toBeVisible()
})

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

test("screenshot_diagram renders the canvas of the shell", async ({ page }) => {
    const frame = await openShell(page)
    await toolText("create_new_diagram", {
        xml: `${box("2", "Shot A", 40)}\n${box("3", "Shot B", 240)}`,
    })
    await expect(frame.getByText("Shot B")).toBeVisible({ timeout: 10_000 })
    const result = await client.callTool({
        name: "screenshot_diagram",
        arguments: {},
    })
    const image = (
        result.content as { type: string; data?: string; mimeType?: string }[]
    ).find((c) => c.type === "image")
    expect(result.isError ?? false).toBe(false)
    expect(image?.mimeType).toBe("image/png")
    expect(image?.data?.length ?? 0).toBeGreaterThan(1000)
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
    await expect(frame.getByText("Second")).toBeVisible({ timeout: 10_000 })
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
    await expect(frame.locator(".geTabContainer .geActivePage")).toHaveText(
        "Page-1",
    )
    // The projection was never pushed as the document
    const xml = await toolText("get_diagram")
    expect(xml).toContain('value="First page"')
    expect(xml).toContain('name="Second"')
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
