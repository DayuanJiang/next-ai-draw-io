import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import http from "node:http"
import https from "node:https"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { chromium, expect, test } from "@playwright/test"

const pkg = join(dirname(fileURLToPath(import.meta.url)), "../..")

test("HTTPS proxy keeps the shell, editor, manual edits and MCP on the same session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "remote-preview-"))
    let client: Client | undefined
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    let backend = 0
    execFileSync(
        "openssl",
        [
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            join(dir, "key.pem"),
            "-out",
            join(dir, "cert.pem"),
            "-days",
            "1",
            "-subj",
            "/CN=diagram.example.test",
        ],
        { stdio: "ignore" },
    )
    // A real TLS-terminating proxy, preserving Host and Origin, not a browser
    // request interception that could accidentally bypass the server's guards.
    const proxy = https.createServer(
        {
            key: readFileSync(join(dir, "key.pem")),
            cert: readFileSync(join(dir, "cert.pem")),
        },
        (req, res) => {
            const upstream = http.request(
                {
                    hostname: "127.0.0.1",
                    port: backend,
                    path: req.url,
                    method: req.method,
                    headers: req.headers,
                },
                (reply) => {
                    res.writeHead(reply.statusCode!, reply.headers)
                    reply.pipe(res)
                },
            )
            upstream.on("error", () => {
                res.writeHead(502)
                res.end()
            })
            req.pipe(upstream)
        },
    )
    try {
        await new Promise<void>((resolve) =>
            proxy.listen(0, "127.0.0.1", resolve),
        )
        const address = proxy.address() as { port: number }
        const origin = `https://diagram.example.test:${address.port}`
        backend = 6100 + Math.floor(Math.random() * 400)
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: [process.env.MCP_SERVER_ENTRY ?? join(pkg, "dist/index.js")],
            env: {
                ...process.env,
                DRAWIO_DATA_DIR: dir,
                PORT: String(backend),
                BROWSER: "none",
                DRAWIO_PREVIEW_URL: origin,
            },
            stderr: "pipe",
        })
        client = new Client({ name: "remote-preview-e2e", version: "0.0.1" })
        await client.connect(transport)
        const tool = async (
            name: string,
            args: Record<string, unknown> = {},
        ) => {
            const result = await client!.callTool({ name, arguments: args })
            expect(result.isError ?? false).toBe(false)
            return (result.content as { text?: string }[])
                .map((c) => c.text ?? "")
                .join("\n")
        }
        const started = await tool("start_session")
        const url = started.match(/Browser URL: (\S+)/)?.[1]
        expect(url).toMatch(new RegExp(`^${origin}/shell/\\?mcp=mcp-`))
        browser = await chromium.launch({
            args: [
                "--no-proxy-server",
                "--host-resolver-rules=MAP diagram.example.test 127.0.0.1",
            ],
        })
        const page = await browser.newPage({ ignoreHTTPSErrors: true })
        const failures: string[] = []
        page.on("pageerror", (error) => failures.push(error.message))
        page.on("response", (response) => {
            if (response.status() >= 400)
                failures.push(`${response.status()} ${response.url()}`)
        })
        await page.goto(url!)
        await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
            timeout: 60_000,
        })
        await expect(page.getByTestId("shell-status")).toHaveAttribute(
            "data-status",
            "connected",
        )
        await expect(page.locator("iframe[title='draw.io']")).toHaveAttribute(
            "src",
            new RegExp(`^${origin}/drawio/index.html`),
        )
        const frame = page.frameLocator("iframe[title='draw.io']")
        await tool("create_new_diagram", {
            xml: '<mxCell id="2" value="Remote AI" x="40" y="40" w="140" h="60"/>',
        })
        await expect(frame.getByText("Remote AI", { exact: true })).toBeVisible(
            { timeout: 10_000 },
        )
        // A genuine pointer/keyboard label edit, as opposed to an API write.
        await frame.getByText("Remote AI", { exact: true }).dblclick()
        await page.keyboard.press("ControlOrMeta+a")
        await page.keyboard.type("Remote human")
        await page.keyboard.press("Escape")
        await expect
            .poll(() => tool("get_diagram"), { timeout: 10_000 })
            .toContain('value="Remote human"')
        await tool("edit_diagram", {
            operations: [
                {
                    operation: "add",
                    cell_id: "3",
                    new_xml:
                        '<mxCell id="3" value="Remote follow-up" x="240" y="40" w="140" h="60"/>',
                },
            ],
        })
        await expect(
            frame.getByText("Remote follow-up", { exact: true }),
        ).toBeVisible({ timeout: 10_000 })
        await frame.getByText("Remote human", { exact: true }).click()
        expect(await tool("get_selection")).toContain('id="2"')
        const saved = join(dir, "remote.drawio")
        await tool("export_diagram", { path: saved, format: "drawio" })
        expect(readFileSync(saved, "utf8")).toContain("Remote human")
        expect(failures).toEqual([])
    } finally {
        await browser?.close()
        await client?.close()
        await new Promise<void>((resolve) => proxy.close(() => resolve()))
        rmSync(dir, { recursive: true, force: true })
    }
})
