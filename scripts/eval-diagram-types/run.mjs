// Send the evaluation's requests to a running app through its real page, as
// a user would, and save what each run drew.
//
//   node scripts/eval-diagram-types/run.mjs <out dir> --base http://localhost:6103 --config guide
//        [--model luna|haiku|sonnet] [--repeats 10] [--parallel 4]
//        [--group sequence,special] [--only start,six] [--check <layout-check.js>]
//
// The page does everything the app does with an answer (the tool handlers,
// retries, the canvas), so a run is the result a user gets. Per run, in
// <out dir>/<config>/:
//   <name>.json        the request, the tool calls of every answer, tokens, seconds
//   <name>.cells.json  every cell as draw.io rendered it (boxes, line points, label boxes)
//   <name>.xml         the canvas
//   <name>.png         a picture of the canvas
// A run that already has its .json is skipped, so the script can be started
// again after an interruption. --check names a script that defines
// window.naiLayoutCheck(graph) in the draw.io frame (a layout check kept
// outside the repository); without it the layout problems are not counted.
import fs from "node:fs"
import path from "node:path"
import {
    canvasPng,
    canvasXml,
    dumpCells,
    launch,
    newPage,
    openApp,
    parseAnswer,
    pickModel,
    recordChat,
    send,
    waitTurnEnd,
} from "./lib.mjs"

const args = process.argv.slice(2)
const outDir = args[0]
const opt = (name, fallback) => {
    const at = args.indexOf(`--${name}`)
    return at >= 0 ? args[at + 1] : fallback
}
const base = opt("base")
const config = opt("config")
const model = opt("model", "luna")
const repeats = Number(opt("repeats", "10"))
const parallel = Number(opt("parallel", "4"))
const groups = opt("group")?.split(",")
const only = opt("only")?.split(",")
const checkJs = opt("check") ? fs.readFileSync(opt("check"), "utf8") : null
if (!outDir || !base || !config) {
    console.error("usage: run.mjs <out dir> --base <url> --config <name> [...]")
    process.exit(1)
}
// The option in the model selector; the first model of the server is the default
const MODEL_OPTION = {
    luna: null,
    haiku: "claude-haiku-5-5",
    sonnet: "claude-sonnet-5-5",
}

// --requests names another list of the same form, kept outside the
// repository (requests of real users, for example)
const { requests } = JSON.parse(
    fs.readFileSync(
        opt("requests") ?? new URL("./requests.json", import.meta.url),
        "utf8",
    ),
)
const dir = path.join(outDir, config)
fs.mkdirSync(dir, { recursive: true })
const jobs = []
for (let rep = 1; rep <= repeats; rep++) {
    for (const request of requests) {
        if (groups && !groups.includes(request.group)) continue
        if (only && !only.includes(request.id)) continue
        const name = `${request.id}-${model}-${rep}`
        if (!fs.existsSync(path.join(dir, `${name}.json`))) {
            jobs.push({ request, name })
        }
    }
}
console.log(`${config}: ${jobs.length} runs to do`)

/** The answers of the page's /api/chat requests, without the long XML */
function summarize(exchanges) {
    return exchanges.map((e) => {
        const a = parseAnswer(e.text)
        return {
            status: e.status,
            seconds: e.endedAt ? (e.endedAt - e.sentAt) / 1000 : null,
            finish: a.finish,
            usage: a.usage,
            errors: a.errors,
            text: a.text,
            calls: a.calls.map((c) => ({
                tool: c.tool,
                inputError: c.inputError ?? false,
                // What the model asked a lookup for; the size of a drawing
                input:
                    typeof c.input?.xml === "string"
                        ? { xmlChars: c.input.xml.length }
                        : c.input,
            })),
        }
    })
}

async function one(browser, { request, name }) {
    const { context, page } = await newPage(browser)
    const exchanges = recordChat(page)
    const result = {
        name,
        id: request.id,
        group: request.group,
        config,
        model,
        error: null,
    }
    let dump = { cells: [] }
    try {
        await openApp(page, `${base}/en`)
        if (MODEL_OPTION[model]) await pickModel(page, MODEL_OPTION[model])
        const started = Date.now()
        await send(page, request.text)
        await waitTurnEnd(page)
        result.seconds = (Date.now() - started) / 1000
        result.firstTurnAnswers = exchanges.length
        if (request.followUp) {
            await send(page, request.followUp)
            await waitTurnEnd(page)
        }
        await page.waitForTimeout(1500)
        const frame = await (
            await page.locator("iframe").first().elementHandle()
        ).contentFrame()
        dump = await frame.evaluate(dumpCells)
        if (dump.error) {
            // The editor instance arrives with the next event: ask again
            await page.waitForTimeout(500)
            dump = await frame.evaluate(dumpCells)
        }
        if (checkJs && !dump.error) {
            await frame.evaluate(checkJs)
            result.layout = await frame.evaluate(() => {
                const r = window.naiLayoutCheck(window.__ui.editor.graph)
                return { count: r.count, kinds: r.items.map((i) => i.kind) }
            })
        }
        // The diagram alone; the editor as the user sees it when there is none
        const png = dump.cells?.length ? await canvasPng(page) : null
        if (png) fs.writeFileSync(path.join(dir, `${name}.png`), png)
        else {
            await page
                .locator("iframe")
                .first()
                .screenshot({ path: path.join(dir, `${name}.png`) })
        }
        fs.writeFileSync(
            path.join(dir, `${name}.xml`),
            (await canvasXml(page)) ?? "",
        )
    } catch (error) {
        result.error = String(error).slice(0, 300)
    }
    // Answers still arriving have no end time; give the last one a moment
    await page.waitForTimeout(300)
    result.answers = summarize(exchanges)
    fs.writeFileSync(path.join(dir, `${name}.cells.json`), JSON.stringify(dump))
    fs.writeFileSync(
        path.join(dir, `${name}.json`),
        JSON.stringify(result, null, 1),
    )
    await context.close()
    const tools = result.answers.flatMap((a) => a.calls.map((c) => c.tool))
    console.log(
        `${config} ${name}: ${result.error ?? `${dump.cells?.length ?? 0} cells, ${Math.round(result.seconds)} s, ${tools.join(" > ")}`}`,
    )
}

const browser = await launch()
let next = 0
await Promise.all(
    Array.from({ length: parallel }, async () => {
        while (next < jobs.length) await one(browser, jobs[next++])
    }),
)
await browser.close()
console.log(`${config}: done`)
