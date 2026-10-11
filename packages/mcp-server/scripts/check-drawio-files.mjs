#!/usr/bin/env node
import {
    existsSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs"
/**
 * Guard for drawio-files.txt: opens the embedded editor from a FULL draw.io
 * copy in headless Chromium, uses it the way the preview page does (every
 * theme the user can switch to, diagrams with shapes from the icon libraries,
 * the format panel, the shape sidebar, the menus, the page tabs, the export
 * and edit dialogs, exports) and records every file the editor requests.
 *
 *   node scripts/check-drawio-files.mjs [--drawio <dir>] [--update]
 *
 * The full copy is --drawio, else the web app's public/drawio. Without
 * --update it fails when the editor requested a file the list does not
 * have; with --update it rewrites the requested section of the list.
 * Needs Playwright from the repository root (npm ci at the root).
 */
import http from "node:http"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { readDrawioVersion } from "../../../scripts/drawio-zip.mjs"
import {
    formatFileList,
    parseFileList,
    readFileList,
} from "./drawio-file-list.mjs"

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const LIST = path.join(PKG, "drawio-files.txt")
const args = process.argv.slice(2)
const update = args.includes("--update")
const drawioDir = path.resolve(
    args.includes("--drawio")
        ? args[args.indexOf("--drawio") + 1]
        : path.join(PKG, "../../public/drawio"),
)
if (!existsSync(path.join(drawioDir, "index.html"))) {
    console.error(
        `No draw.io copy at ${drawioDir}. Run "npm run dev" once at the repository root (it downloads one into public/drawio), or pass --drawio <dir>.`,
    )
    process.exit(2)
}
// The list is for the pinned release; the fetch scripts stamp the copy
const { version } = readDrawioVersion()
const stampFile = path.join(drawioDir, ".version")
const stamp = existsSync(stampFile)
    ? readFileSync(stampFile, "utf8").trim()
    : null
if (stamp !== version) {
    console.error(
        `${drawioDir} is draw.io ${stamp ?? "(no .version stamp)"}; the package pins ${version}. Delete it and run "npm run dev" at the repository root again, or pass --drawio <dir>.`,
    )
    process.exit(2)
}
const playwrightEntry = path.join(
    PKG,
    "../../node_modules/playwright/index.mjs",
)
if (!existsSync(playwrightEntry)) {
    console.error("Playwright is missing: run npm ci at the repository root.")
    process.exit(2)
}
const { chromium } = await import(pathToFileURL(playwrightEntry).href)

// The themes a user can switch to under Extras > Theme (themes=1)
const THEMES = ["kennedy", "min", "atlas", "dark", "sketch", "simple"]

const MIME = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".gif": "image/gif",
    ".json": "application/json",
    ".xml": "text/xml",
    ".txt": "text/plain",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".ico": "image/x-icon",
}

// The page that embeds the editor, with the preview page's iframe query
const parentPage = (ui) => `<!doctype html><html><body style="margin:0">
<iframe id="f" style="width:1280px;height:860px;border:0" src="/drawio/index.html?embed=1&proto=json&configure=1&spin=1&libraries=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0&themes=1&dark=0&ui=${ui}"></iframe>
<script>
const f = document.getElementById('f')
window.exports = 0
window.addEventListener('message', (e) => {
    let m; try { m = JSON.parse(e.data) } catch { return }
    if (m.event === 'configure') f.contentWindow.postMessage(JSON.stringify({ action: 'configure', config: {} }), '*')
    if (m.event === 'init') window.ready = true
    if (m.event === 'export') window.exports++
})
window.send = (msg) => f.contentWindow.postMessage(JSON.stringify(msg), '*')
</script></body></html>`

// Every path the editor asked for, in order; and the ones the full copy lacks
const requested = []
const notFound = new Set()
const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost")
    if (url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(parentPage(url.searchParams.get("ui") || "kennedy"))
        return
    }
    const rel = path.posix.normalize(
        decodeURIComponent(url.pathname.replace(/^\/drawio\//, "")),
    )
    const file = path.join(drawioDir, rel)
    let stat
    try {
        stat = statSync(file)
    } catch {
        notFound.add(rel)
        res.writeHead(404)
        res.end()
        return
    }
    if (!requested.includes(rel)) requested.push(rel)
    res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Content-Length": stat.size,
    })
    res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const port = server.address().port

const mb = (n) => (n / 1048576).toFixed(2)
let seen = 0
function report(step) {
    const added = requested.slice(seen)
    seen = requested.length
    if (added.length === 0) return
    const bytes = added.reduce(
        (n, f) => n + statSync(path.join(drawioDir, f)).size,
        0,
    )
    const names =
        added.slice(0, 5).join(", ") + (added.length > 5 ? ", ..." : "")
    console.log(
        `  ${step}: +${added.length} files, +${mb(bytes)} MB [${names}]`,
    )
}

// Diagrams: a plain shape, one shape from each icon library, and the styles
// that make draw.io load code on demand (hand-drawn look, math)
const cell = (id, style, x) =>
    `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="60" height="60" as="geometry"/></mxCell>`
const doc = (cells, attrs = "") =>
    `<mxfile><diagram id="p" name="P"><mxGraphModel ${attrs}><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
const LIBS = {
    plain: "rounded=1;whiteSpace=wrap;html=1;",
    aws4: "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.a1_instance;fillColor=#ED7100;strokeColor=#ffffff;",
    gcp2: "shape=mxgraph.gcp2.a7_power;fillColor=#4285F4;strokeColor=none;",
    kubernetes:
        "shape=mxgraph.kubernetes.icon;prIcon=api;fillColor=#326CE5;strokeColor=none;",
    cisco19:
        "shape=mxgraph.cisco19.rect;prIcon=aci;fillColor=#00bceb;strokeColor=none;",
    flowchart:
        "shape=mxgraph.flowchart.annotation_1;fillColor=#d5e8d4;strokeColor=#82b366;",
    webicons:
        "shape=mxgraph.webicons.adfty;fillColor=#3b5998;strokeColor=none;",
    bpmn: "shape=mxgraph.bpmn.shape;symbol=message;outline=throwing;",
    networks:
        "shape=mxgraph.networks.server;fillColor=#29AAE1;strokeColor=none;",
    azure2_image:
        "image;aspect=fixed;image=img/lib/azure2/compute/Virtual_Machine.svg;",
    sketch: "rounded=1;whiteSpace=wrap;html=1;sketch=1;",
}
const MATH_DOC = doc(
    cell("math", "rounded=1;whiteSpace=wrap;html=1;", 40).replace(
        'value="math"',
        'value="$$x^2$$"',
    ),
    'math="1"',
)

// Dialogs and toggles, by draw.io action name (Actions.js); each is closed
// again right after it opened. Insert > Template and Insert > Advanced >
// PlantUML, which load files when used, are driven below. Mermaid needs no
// extra files: its converter is in js/extensions.min.js, which the editor
// loads at startup. Left out on purpose, to keep the package small: the org
// chart layout (it loads js/orgchart.min.js). Not covered either: images
// from other websites in some templates (Org Chart avatars, Arista icons)
// and the /drawio/proxy requests draw.io makes for them when exporting;
// the copy has no proxy, a known limitation (see the README).
const ACTIONS = [
    "editData",
    "editDiagram",
    "editStyle",
    "editGeometry",
    "editTooltip",
    "editLink",
    "insertImage",
    "exportPng",
    "exportSvg",
    "exportJpg",
    "exportWebp",
    "exportPdf",
    "exportXml",
    "exportHtml",
    "exportVsdx",
    "embedHtml",
    "embedImage",
    "embedSvg",
    "embedIframe",
    "about",
    "pageSetup",
    "print",
    "findReplace",
    "tags",
    "layers",
    "outline",
    "shapes",
    "scratchpad",
    "plugins",
    "properties",
    "fromText",
    "csv",
    "runLayout",
    "insertFreehand",
    "comments",
    "customZoom",
    "renamePage",
    "format",
    "format",
    "toggleShapes",
    "toggleShapes",
    "darkMode",
    "lightMode",
    "autoMode",
    "highContrast",
    "highContrast",
    "mathematicalTypesetting",
    "mathematicalTypesetting",
    "keyboardShortcuts",
]
// Enough for the other themes, whose dialogs are the same code
const LIGHT_ACTIONS = ["editData", "exportPng", "shapes", "format", "format"]

const wait = (page, ms) => page.waitForTimeout(ms)

/**
 * Open the editor in one theme and use it. The default theme gets the full
 * tour; the others the parts that differ by theme (chrome, menus, panels).
 */
async function drive(browser, ui, full) {
    console.log(`theme ${ui}${full ? "" : " (light)"}`)
    const page = await browser.newPage({
        viewport: { width: 1300, height: 900 },
    })
    page.on("popup", (p) => p.close().catch(() => {}))
    await page.goto(`http://localhost:${port}/?ui=${ui}`)
    await page.waitForFunction(() => window.ready === true, null, {
        timeout: 60000,
    })
    await wait(page, 2000)
    report("editor ready")

    const load = (xml) =>
        page.evaluate(
            (x) => window.send({ action: "load", xml: x, autosave: 1 }),
            xml,
        )
    let x = 40
    for (const [name, style] of Object.entries(LIBS)) {
        await load(doc(cell(name, style, (x += 100))))
        await wait(page, full ? 1500 : 500)
        report(`load ${name}`)
        if (!full) break
    }
    if (full) {
        await load(MATH_DOC)
        await wait(page, 2500)
        report("load math")
    }

    // The editor instance: in embed mode draw.io calls a plugin callback
    // registered after startup right away
    const frame = page.frames().find((f) => f.url().includes("/drawio/"))
    await frame.evaluate(() => {
        window.Draw.loadPlugin((u) => {
            window.__ui = u
        })
        window.__ui.editor.graph.selectAll()
    })
    const closeAll = async () => {
        await frame.evaluate(() => {
            const ui = window.__ui
            while (ui.dialogs && ui.dialogs.length > 0) ui.hideDialog()
            ui.hideCurrentMenu?.()
        })
        await page.keyboard.press("Escape")
        await wait(page, 100)
    }

    let opened = 0
    const actions = full ? ACTIONS : LIGHT_ACTIONS
    for (const name of actions) {
        const result = await frame.evaluate((n) => {
            const ui = window.__ui
            const action = ui.actions.get(n)
            if (!action) return "missing"
            try {
                action.funct()
            } catch (e) {
                return `failed: ${e.message}`
            }
            return ui.dialog || ui.dialogs?.length ? "dialog" : "ok"
        }, name)
        if (result === "dialog") opened++
        if (result !== "ok" && result !== "dialog") {
            console.log(`  action ${name}: ${result}`)
        }
        await wait(page, 400)
        report(`action ${name}`)
        await closeAll()
    }
    console.log(`  ${opened} of ${actions.length} actions opened a dialog`)

    // File > Open Library from > Browser (libraries=1): the picker is an
    // iframe on open.html, which loads js/open.js
    await frame.evaluate(() => window.__ui.pickLibrary(window.App.MODE_BROWSER))
    await wait(page, 1000)
    report("library picker")
    await closeAll()

    // Menus: the visible menubar items, the toolbar buttons that open a menu
    // in the other themes, and every menu rendered with its submenus
    const menubarItems = frame.locator(".geMenubar .geItem:visible")
    const menubarCount = await menubarItems.count()
    for (let i = 0; i < menubarCount; i++) {
        await menubarItems
            .nth(i)
            .click({ timeout: 2000 })
            .catch(() => {})
        await wait(page, 300)
        await closeAll()
    }
    let toolbarCount = 0
    for (const title of [
        "Diagram",
        "Insert",
        "Shapes",
        "Pages",
        "View",
        "Table",
        "Layout",
    ]) {
        const button = frame.locator(`a[title="${title}"]:visible`).first()
        if ((await button.count()) === 0) continue
        toolbarCount++
        await button.click({ timeout: 2000 }).catch(() => {})
        await wait(page, 300)
        await closeAll()
    }
    const failed = await frame.evaluate(() => {
        const ui = window.__ui
        const failed = []
        for (const name of Object.keys(ui.menus.menus)) {
            const menu = new window.mxPopupMenu()
            menu.init()
            document.body.appendChild(menu.div)
            try {
                ui.menus.get(name).funct(menu, null)
            } catch {
                failed.push(name)
            }
            menu.destroy()
        }
        return failed
    })
    await wait(page, 500)
    console.log(
        `  menus: ${menubarCount} menubar items, ${toolbarCount} toolbar menus clicked` +
            (failed.length ? `; not rendered: ${failed.join(", ")}` : ""),
    )
    report("menus")

    // Format panel tabs, with a shape selected
    await frame.evaluate(() => window.__ui.editor.graph.selectAll())
    for (const tab of ["Style", "Text", "Arrange", "Diagram"]) {
        const el = frame
            .locator(`.geFormatContainer div:text-is("${tab}")`)
            .first()
        if ((await el.count()) > 0)
            await el.click({ timeout: 2000 }).catch(() => {})
        await wait(page, 200)
    }
    report("format panel tabs")

    // Shape sidebar: open every palette, then search
    await frame.evaluate(() => {
        const ui = window.__ui
        for (const title of document.querySelectorAll(
            ".geSidebarContainer .geTitle",
        )) {
            title.click()
        }
        ui.sidebar.searchShapes?.("server")
    })
    await wait(page, full ? 2500 : 1000)
    report("sidebar palettes and search")

    // Pages: insert, switch, duplicate, remove, and the tab bar
    for (const name of [
        "insertPage",
        "nextPage",
        "previousPage",
        "duplicatePage",
        "removePage",
    ]) {
        await frame.evaluate((n) => window.__ui.actions.get(n)?.funct(), name)
        await wait(page, 150)
        await closeAll()
    }
    for (const title of ["Insert Page", "Pages"]) {
        const el = frame.locator(`a[title="${title}"]:visible`).first()
        if ((await el.count()) > 0)
            await el.click({ timeout: 2000 }).catch(() => {})
        await wait(page, 300)
        await closeAll()
    }
    report("page tabs")

    if (full) {
        // Insert > Advanced > PlantUML: the parser is loaded on first use
        await frame.evaluate(() => window.__ui.actions.get("plantUml").funct())
        await frame
            .locator(".geDialog textarea")
            .first()
            .fill("@startuml\nA -> B\n@enduml")
        await frame
            .locator('.geDialog button:text-is("Insert")')
            .first()
            .click()
        await wait(page, 3000)
        report("plantUml insert")
        await closeAll()

        // Insert > Template: the index and the previews on screen
        await frame.evaluate(() =>
            window.__ui.actions.get("insertTemplate").funct(),
        )
        await wait(page, 2000)
        report("template dialog")
        await closeAll()

        const formats = ["png", "svg", "xmlsvg", "xml"]
        for (const [i, format] of formats.entries()) {
            await page.evaluate(
                (f) => window.send({ action: "export", format: f, scale: 2 }),
                format,
            )
            await page
                .waitForFunction((n) => window.exports >= n, i + 1, {
                    timeout: 10000,
                })
                .catch(() => {})
            report(`export ${format}`)
        }
        const exports = await page.evaluate(() => window.exports)
        if (exports < formats.length) {
            console.error(
                `  only ${exports} of ${formats.length} exports answered`,
            )
            process.exitCode = 1
        }
    }
    await page.close()
}

const browser = await chromium.launch()
try {
    for (const ui of THEMES) await drive(browser, ui, ui === THEMES[0])
} finally {
    await browser.close()
    server.close()
}

// A full copy has every file the editor asks for; 404s mean this is not one
if (notFound.size > 0) {
    console.error(
        `\nThe editor requested ${notFound.size} files that ${drawioDir} does not have (not a full draw.io copy?):\n  ${[...notFound].join("\n  ")}`,
    )
    process.exit(1)
}

// Compare with the list
const list = readFileList(LIST)
const missing = requested.filter((f) => !list.matches(f)).sort()

function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) yield* walk(full)
        else yield path.relative(drawioDir, full).split(path.sep).join("/")
    }
}
const summarize = (fileList) => {
    let count = 0
    let bytes = 0
    for (const rel of walk(drawioDir)) {
        if (!fileList.matches(rel)) continue
        count++
        bytes += statSync(path.join(drawioDir, rel)).size
    }
    return `${count} files, ${mb(bytes)} MB unpacked`
}

if (update) {
    // Only the head decides what is already covered by "always include"
    const always = parseFileList(list.head)
    const kept = requested.filter((f) => !always.matches(f))
    writeFileSync(LIST, formatFileList(list.head, kept))
    console.log(`\nWrote ${LIST}: ${summarize(readFileList(LIST))}`)
} else if (missing.length > 0) {
    console.error(
        `\nThe editor requested ${missing.length} files that drawio-files.txt does not list:\n  ${missing.join("\n  ")}\nRun with --update to add them.`,
    )
    process.exit(1)
} else {
    console.log(`\ndrawio-files.txt is complete: ${summarize(list)}`)
}
