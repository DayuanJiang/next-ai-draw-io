import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The MCP preview page, as the server fills it in, with its script run in
// this document (no session id, so it does not poll)
const dir = join(process.cwd(), "packages/mcp-server/src/preview")
const html = readFileSync(join(dir, "index.html"), "utf8")
    .replace("{{CSS}}", "")
    .replace("{{SESSION_BADGE}}", "")
    .replaceAll("{{DISABLED}}", "")
    .replace("{{DRAWIO_URL}}", "about:blank")
    .replace("{{SESSION_JSON}}", '""')
    .replace("{{ORIGIN_JSON}}", '"https://embed.diagrams.net"')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) =>
    m[1].replace("{{SCRIPT}}", ""),
)
const preview = readFileSync(join(dir, "preview.js"), "utf8")

function renderHistory(entries: unknown[]): HTMLElement {
    document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/g, "")
    // One scope, as the page's scripts share one; returns its renderHistory
    const run = new Function(
        `${scripts.join("\n")}\n${preview}\nreturn (d) => { historyData = d; renderHistory(); }`,
    )
    run()(entries)
    return document.getElementById("history-grid") as HTMLElement
}

describe("MCP preview History", () => {
    it("never reads a stored thumbnail as HTML", () => {
        const grid = renderHistory([
            { id: 1, index: 0, svg: 'x" onerror="window.__xss=1' },
            { id: 2, index: 1, svg: "javascript:window.__xss=2" },
            { id: 3, index: 2, svg: "data:image/svg+xml;base64,PHN2Zy8+" },
        ])
        const images = [...grid.querySelectorAll("img")]
        expect(images.map((i) => i.getAttribute("src"))).toEqual([
            "data:image/svg+xml;base64,PHN2Zy8+",
        ])
        expect(grid.querySelector("[onerror]")).toBeNull()
        // Entries without a usable picture show their number
        expect(grid.textContent).toContain("#0")
        expect(grid.textContent).toContain("#1")
    })
})
