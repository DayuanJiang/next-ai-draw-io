// Helpers for the evaluation of diagram type guides: drive the real app in
// headless Chromium, the way a user does, and read what it drew.
import { chromium } from "playwright"

const STOP_LABELS = ["Stop generation", "停止生成", "生成を停止"]

export async function launch() {
    return chromium.launch()
}

/** A fresh browser context and page: one user with an empty canvas */
export async function newPage(browser) {
    const context = await browser.newContext({
        viewport: { width: 1700, height: 1000 },
    })
    return { context, page: await context.newPage() }
}

/** Record every /api/chat request and the event stream of its answer */
export function recordChat(page) {
    const exchanges = []
    page.on("request", (r) => {
        if (r.url().endsWith("/api/chat") && r.method() === "POST") {
            exchanges.push({ sentAt: Date.now(), endedAt: null, text: "" })
        }
    })
    page.on("response", (r) => {
        if (r.url().endsWith("/api/chat") && r.request().method() === "POST") {
            const entry = exchanges.findLast((e) => e.endedAt === null)
            if (!entry) return
            entry.status = r.status()
            r.body()
                .then((b) => {
                    entry.text = b.toString("utf8")
                })
                .catch(() => {})
                .finally(() => {
                    entry.endedAt = Date.now()
                })
        }
    })
    return exchanges
}

/** What one answer's event stream holds: tool calls, text, tokens */
export function parseAnswer(text) {
    const r = { calls: [], errors: [], finish: null, usage: null, text: "" }
    for (const line of text.split("\n")) {
        if (!line.startsWith("data:")) continue
        let e
        try {
            e = JSON.parse(line.slice(5))
        } catch {
            continue
        }
        if (e.type === "text-delta") r.text += e.delta
        else if (e.type === "tool-input-available") {
            r.calls.push({ tool: e.toolName, input: e.input })
        } else if (e.type === "tool-input-error") {
            r.calls.push({ tool: e.toolName, inputError: true })
        } else if (e.type === "error") {
            r.errors.push(String(e.errorText).slice(0, 300))
        } else if (e.type === "finish") {
            r.finish = e.finishReason
            r.usage = e.messageMetadata?.usage ?? null
        }
    }
    return r
}

/** Open the editor and wait until draw.io inside the iframe answers */
export async function openApp(page, url) {
    await page.goto(url, { waitUntil: "load", timeout: 120000 })
    await page
        .locator("iframe")
        .first()
        .waitFor({ state: "visible", timeout: 90000 })
    await page
        .getByTestId("chat-input")
        .waitFor({ state: "visible", timeout: 30000 })
    const answers = () =>
        page.evaluate(
            () =>
                new Promise((resolve) => {
                    const onMessage = (e) => {
                        try {
                            if (
                                JSON.parse(e.data).message?.message ===
                                "ready-probe"
                            )
                                resolve(true)
                        } catch {}
                    }
                    window.addEventListener("message", onMessage)
                    document
                        .querySelector("iframe")
                        ?.contentWindow?.postMessage(
                            JSON.stringify({
                                action: "export",
                                format: "xml",
                                message: "ready-probe",
                            }),
                            "*",
                        )
                    setTimeout(() => {
                        window.removeEventListener("message", onMessage)
                        resolve(false)
                    }, 2000)
                }),
        )
    const by = Date.now() + 120000
    while (!(await answers())) {
        if (Date.now() > by)
            throw new Error("draw.io did not start in 2 minutes")
    }
    // The start screen's video card covers nothing the run needs, but close
    // it as a user would
    await page
        .getByTestId("mcp-video-close")
        .click({ timeout: 1500 })
        .catch(() => {})
}

/** Pick the model whose name matches the fragment in the model selector */
export async function pickModel(page, fragment) {
    const option = page
        .getByRole("option", { name: new RegExp(fragment) })
        .first()
    for (let attempt = 0; ; attempt++) {
        await page.getByTestId("model-selector").first().click()
        if (await option.isVisible({ timeout: 3000 }).catch(() => false)) break
        if (attempt >= 10)
            throw new Error(`no model option matching ${fragment}`)
        await page.keyboard.press("Escape")
        await page.waitForTimeout(1000)
    }
    await option.click()
    await page.waitForTimeout(300)
}

/** Type a message and send it with Enter */
export async function send(page, text) {
    const input = page.getByTestId("chat-input")
    await input.fill(text)
    await input.press("Enter")
}

/** Wait until the answer has ended: the stop button stays gone */
export async function waitTurnEnd(page, timeout = 600000) {
    const stop = page
        .locator(STOP_LABELS.map((l) => `button[aria-label="${l}"]`).join(", "))
        .first()
    await stop.waitFor({ state: "visible", timeout: 30000 }).catch(() => {})
    for (;;) {
        await stop.waitFor({ state: "hidden", timeout })
        await page.waitForTimeout(2500)
        if (!(await stop.isVisible())) break
    }
}

/** An export of the canvas, asked from draw.io the way the app does */
function canvasExport(page, format) {
    return page.evaluate(
        (format) =>
            new Promise((resolve) => {
                const tag = `probe-${Math.random()}`
                const onMessage = (e) => {
                    try {
                        const d = JSON.parse(e.data)
                        if (
                            d.event === "export" &&
                            d.message?.message === tag
                        ) {
                            window.removeEventListener("message", onMessage)
                            resolve(format === "xml" ? (d.xml ?? null) : d.data)
                        }
                    } catch {}
                }
                window.addEventListener("message", onMessage)
                document.querySelector("iframe")?.contentWindow?.postMessage(
                    JSON.stringify({
                        action: "export",
                        format,
                        border: 10,
                        message: tag,
                    }),
                    "*",
                )
                setTimeout(() => resolve(null), 20000)
            }),
        format,
    )
}

/** The canvas XML */
export const canvasXml = (page) => canvasExport(page, "xml")

/** A picture of the diagram alone (PNG bytes), or null for an empty canvas */
export async function canvasPng(page) {
    const data = await canvasExport(page, "png")
    return typeof data === "string" && data.includes(",")
        ? Buffer.from(data.split(",")[1], "base64")
        : null
}

/**
 * Runs inside the draw.io frame: the rendered box, line points and label box
 * of every cell, in diagram coordinates. This is what the editor drew, which
 * the XML alone does not tell (where an edge ends, how large a label is).
 */
export function dumpCells() {
    if (!window.__ui) window.Draw.loadPlugin((u) => (window.__ui = u))
    const ui = window.__ui
    if (!ui) return { error: "no editor instance" }
    const graph = ui.editor.graph
    const view = graph.view
    const model = graph.model
    const s = view.scale
    const tr = view.translate
    const rect = (b) =>
        b
            ? {
                  x: b.x / s - tr.x,
                  y: b.y / s - tr.y,
                  w: b.width / s,
                  h: b.height / s,
              }
            : null
    const cells = []
    for (const c of Object.values(model.cells)) {
        if (c.id === "0" || c.id === "1") continue
        const st = view.getState(c)
        const style = st?.style ?? {}
        const div = document.createElement("div")
        div.innerHTML = String(graph.convertValueToString(c) ?? "")
        cells.push({
            id: c.id,
            vertex: model.isVertex(c),
            edge: model.isEdge(c),
            text: div.textContent.trim(),
            styleText: c.style ?? "",
            shape: style.shape ?? null,
            stroke: style.strokeColor ?? null,
            fill: style.fillColor ?? null,
            fontColor: style.fontColor ?? null,
            dashed: style.dashed ?? null,
            size: style.size ?? null,
            parent: c.parent?.id ?? null,
            parentIsEdge: !!c.parent && model.isEdge(c.parent),
            source: c.source?.id ?? null,
            target: c.target?.id ?? null,
            box: st ? rect(st) : null,
            pts: st?.absolutePoints
                ? st.absolutePoints
                      .filter(Boolean)
                      .map((p) => ({ x: p.x / s - tr.x, y: p.y / s - tr.y }))
                : null,
            label: st?.text?.boundingBox ? rect(st.text.boundingBox) : null,
        })
    }
    return { cells }
}
