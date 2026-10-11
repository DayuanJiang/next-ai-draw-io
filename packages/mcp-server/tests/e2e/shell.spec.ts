/**
 * The canvas shell as start_session opens it with DRAWIO_PREVIEW_UI=shell:
 * the built server (dist/index.js) runs over stdio as an MCP client would
 * start it, and headless Chromium opens the URL it returns.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { expect, test } from "@playwright/test"

const pkg = join(dirname(fileURLToPath(import.meta.url)), "../..")

let client: Client
let dataDir: string
let shellUrl: string

test.beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "mcp-shell-e2e-"))
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [join(pkg, "dist/index.js")],
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

    // The shell's own texts and state
    await expect(page.getByTestId("shell-status")).toHaveText(
        "Waiting for the MCP server…",
    )
    await expect(page.getByTestId("shell-session")).toHaveText(
        shellUrl.slice(-8),
    )
    expect(errors).toEqual([])
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
