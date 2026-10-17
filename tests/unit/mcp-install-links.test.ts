import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
    MCP_CURSOR_INSTALL_URL,
    MCP_VSCODE_INSTALL_URL,
} from "@/components/site/site-texts"

const read = (path: string) => readFileSync(path, "utf8")
const SERVER = { command: "npx", args: ["@next-ai-drawio/mcp-server@latest"] }

describe("one-click MCP install links", () => {
    it("install the drawio server in VS Code and Cursor", () => {
        const vscode = new URL(MCP_VSCODE_INSTALL_URL).searchParams.get("url")
        expect(vscode?.startsWith("vscode:mcp/install?")).toBe(true)
        expect(
            JSON.parse(decodeURIComponent(vscode?.split("?")[1] ?? "")),
        ).toEqual({ name: "drawio", ...SERVER })

        const cursor = new URL(MCP_CURSOR_INSTALL_URL).searchParams
        expect(cursor.get("name")).toBe("drawio")
        expect(JSON.parse(atob(cursor.get("config") ?? ""))).toEqual(SERVER)
    })

    it("are the same in the READMEs as on the MCP page", () => {
        for (const path of [
            "README.md",
            "docs/cn/README_CN.md",
            "docs/ja/README_JA.md",
            "packages/mcp-server/README.md",
        ]) {
            const readme = read(path)
            expect(readme, path).toContain(`(${MCP_VSCODE_INSTALL_URL})`)
            expect(readme, path).toContain(`(${MCP_CURSOR_INSTALL_URL})`)
        }
    })
})

describe("gemini-extension.json", () => {
    it("runs the published MCP server and carries its version", () => {
        const extension = JSON.parse(read("gemini-extension.json"))
        const pkg = JSON.parse(read("packages/mcp-server/package.json"))
        expect(extension.mcpServers.drawio).toEqual(SERVER)
        expect(extension.version).toBe(pkg.version)
    })
})
