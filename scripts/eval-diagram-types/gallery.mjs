// A page with every run's picture, one row per request and one column per
// configuration, to look at the drawings side by side.
//
//   node scripts/eval-diagram-types/gallery.mjs <out dir> <summary.json> <config> [<config> ...]
//
// summary.json is what metrics.mjs writes with --json. The page is
// <out dir>/gallery.html and refers to the pictures next to it.
import fs from "node:fs"
import path from "node:path"

const [outDir, summaryFile, ...configs] = process.argv.slice(2)
const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"))
const { requests } = JSON.parse(
    fs.readFileSync(new URL("./requests.json", import.meta.url), "utf8"),
)
const esc = (s) =>
    String(s).replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    )

/** The verdict of a run, as short words under its picture */
function caption(run, request) {
    const words = []
    if (!run.drew) words.push("nothing drawn")
    else if (request.type === "sequence") {
        words.push(
            run.clean
                ? "clean"
                : run.correct
                  ? "correct, not clean"
                  : run.structure
                    ? "structure only"
                    : "wrong structure",
        )
        if (request.demand)
            words.push(run.demand ? "demand met" : "demand not met")
    } else {
        if (run.isSequence) words.push("drawn as a sequence diagram")
        if (run.layoutProblems)
            words.push(`${run.layoutProblems} layout problems`)
    }
    if (run.guideCalls.length > 0) words.push("guide")
    if (run.xmlInText) words.push("XML in the text")
    words.push(`${Math.round(run.seconds ?? 0)} s`)
    return words.join(" · ")
}

let rows = ""
for (const request of requests) {
    rows += `<tr><th colspan="${configs.length}"><b>${esc(request.id)}</b> (${esc(request.group)}) ${esc(request.text.slice(0, 220))}${request.followUp ? ` <i>then:</i> ${esc(request.followUp)}` : ""}</th></tr><tr>`
    for (const config of configs) {
        const runs = summary[config]?.[request.id] ?? []
        rows += `<td><h3>${esc(config)}</h3><div class="runs">${runs
            .map(
                (run) =>
                    `<figure><a href="${esc(config)}/${esc(run.name)}.png"><img loading="lazy" src="${esc(config)}/${esc(run.name)}.png"></a><figcaption class="${run.drew && (request.type !== "sequence" || run.clean) ? "" : "bad"}">${esc(caption(run, request))}</figcaption></figure>`,
            )
            .join("")}</div></td>`
    }
    rows += "</tr>"
}
fs.writeFileSync(
    path.join(outDir, "gallery.html"),
    `<!doctype html><meta charset="utf-8"><title>Diagram type guides: runs</title>
<style>
body{font:13px/1.4 system-ui,sans-serif;margin:16px;background:#f6f5f1;color:#222}
table{border-collapse:collapse;width:100%}th{text-align:left;font-weight:400;padding:14px 6px 4px;border-top:2px solid #bbb}
td{vertical-align:top;padding:4px 6px;width:${Math.floor(100 / configs.length)}%}h3{margin:2px 0 6px;font-size:13px}
.runs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:4px;padding:4px}
img{width:100%;height:130px;object-fit:contain;display:block}
figcaption{font-size:11px;color:#2b6a44}figcaption.bad{color:#a23b2a}
</style><table>${rows}</table>`,
)
console.log(path.join(outDir, "gallery.html"))
