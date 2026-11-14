// Score the runs of run.mjs from what draw.io rendered, and print one table
// per group of requests.
//
//   node scripts/eval-diagram-types/metrics.mjs <out dir> <config> [<config> ...] [--model luna] [--json summary.json]
//
// The scores use only the rendered geometry and the requests' expectations
// (requests.json), never the app's own checks, so they can tell whether an
// app that checks its drawings is right.
import fs from "node:fs"
import path from "node:path"
import { scoreType } from "./types.mjs"

const args = process.argv.slice(2)
const flag = (name) => {
    const at = args.indexOf(`--${name}`)
    return at >= 0 ? args.splice(at, 2)[1] : undefined
}
const model = flag("model") ?? "luna"
const jsonOut = flag("json")
const requestsFile = flag("requests")
const [outDir, ...configs] = args
const { requests } = JSON.parse(
    fs.readFileSync(
        requestsFile ?? new URL("./requests.json", import.meta.url),
        "utf8",
    ),
)

const norm = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/[\s"'“”「」:：()（）.,，。_-]/g, "")
const sameName = (drawn, wanted) => {
    const a = norm(drawn)
    const b = norm(wanted)
    return a !== "" && (a === b || a.includes(b))
}
const hit = (a, b) =>
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2
const median = (values) => {
    const v = values
        .filter((x) => x !== null && x !== undefined)
        .sort((a, b) => a - b)
    if (v.length === 0) return null
    return v.length % 2
        ? v[(v.length - 1) / 2]
        : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}

/**
 * The lifelines a run drew, however it drew them: draw.io's lifeline shape,
 * a thin tall shape, or a long vertical line. What makes one is what a
 * reader sees: a vertical line, with the participant's name at its top.
 */
function findLifelines(vertices, edges) {
    const lines = []
    for (const v of vertices) {
        const cx = v.box.x + v.box.w / 2
        const span = { cx, top: v.box.y, bottom: v.box.y + v.box.h }
        if (v.shape === "umlLifeline") {
            lines.push({ cell: v, shape: v, uml: true, name: v.text, ...span })
        } else if (v.box.w <= 12 && v.box.h >= 80) {
            lines.push({
                cell: v,
                shape: null,
                uml: false,
                name: null,
                ...span,
            })
        }
    }
    for (const e of edges) {
        const a = e.pts[0]
        const b = e.pts.at(-1)
        if (Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) >= 80) {
            lines.push({
                cell: e,
                shape: null,
                uml: false,
                name: null,
                cx: (a.x + b.x) / 2,
                top: Math.min(a.y, b.y),
                bottom: Math.max(a.y, b.y),
            })
        }
    }
    // One line per place: an activation bar on a lifeline is not another one
    lines.sort(
        (a, b) =>
            Number(b.uml) - Number(a.uml) ||
            b.bottom - b.top - (a.bottom - a.top),
    )
    const kept = []
    for (const l of lines) {
        if (!kept.some((k) => Math.abs(k.cx - l.cx) <= 8)) kept.push(l)
    }
    // The name of a plain line is on the box at its top
    for (const l of kept) {
        if (l.uml) continue
        const head = vertices
            .filter(
                (v) =>
                    v !== l.cell &&
                    v.text &&
                    v.box.w > 12 &&
                    v.box.x <= l.cx &&
                    l.cx <= v.box.x + v.box.w &&
                    v.box.y <= l.top + 10 &&
                    l.top - (v.box.y + v.box.h) <= 40,
            )
            .sort(
                (a, b) =>
                    Math.abs(a.box.y + a.box.h - l.top) -
                    Math.abs(b.box.y + b.box.h - l.top),
            )[0]
        l.shape = head ?? null
        l.name = head?.text ?? ""
    }
    return kept.sort((a, b) => a.cx - b.cx)
}

/** What a run drew, read as a sequence diagram */
function readSequence(cells) {
    const vertices = cells.filter((c) => c.vertex && c.box && !c.parentIsEdge)
    const allEdges = cells.filter((c) => c.edge && c.pts && c.pts.length >= 2)
    const lifelines = findLifelines(vertices, allEdges)
    const edges = allEdges.filter((e) => !lifelines.some((l) => l.cell === e))
    // The lifeline a point lies on
    const lifelineAt = (p) =>
        lifelines.find(
            (l) =>
                Math.abs(l.cx - p.x) <= 12 &&
                p.y >= l.top - 10 &&
                p.y <= l.bottom + 10,
        ) ?? null
    const messages = []
    const otherEdges = []
    for (const e of edges) {
        const first = e.pts[0]
        const last = e.pts.at(-1)
        const from = lifelineAt(first)
        const to = lifelineAt(last)
        if (!from || !to) {
            otherEdges.push(e)
            continue
        }
        const self = from === to
        const xs = e.pts.map((p) => p.x)
        const ys = e.pts.map((p) => p.y)
        const width = Math.max(...xs) - Math.min(...xs)
        // An edge's label: its own, or that of a label cell placed on it
        const label =
            e.label ??
            cells.find((c) => c.parent === e.id && c.label)?.label ??
            null
        const y = self ? first.y : (first.y + last.y) / 2
        const background = /labelBackgroundColor=(?!none)/.test(e.styleText)
        messages.push({
            id: e.id,
            from,
            to,
            self,
            y,
            slanted: !self && Math.abs(last.y - first.y) > 6,
            // A message to itself has to be a visible turn beside the line
            visible:
                !self ||
                (width >= 10 && Math.max(...ys) - Math.min(...ys) >= 10),
            x1: Math.min(...xs),
            x2: Math.max(...xs),
            // The label lies on its own line: the line strikes the text
            // through (no label background), or a label as long as the
            // line hides the arrow
            struck:
                !self &&
                !!label &&
                label.y + 2 < y &&
                y < label.y + label.h - 2 &&
                (!background || label.w >= 0.85 * width),
        })
    }
    messages.sort((a, b) => a.y - b.y)
    let minGap = null
    for (let i = 1; i < messages.length; i++) {
        const gap = messages[i].y - messages[i - 1].y
        minGap = minGap === null ? gap : Math.min(minGap, gap)
    }
    // Labels: the rendered text boxes, 2 px smaller on each side
    const shrink = (b) => ({ x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 })
    const labels = cells
        .filter((c) => c.text && c.label && c.label.w > 4 && c.label.h > 4)
        .map((c) => ({
            id: c.id,
            box: shrink(c.label),
            edge: c.edge || c.parentIsEdge,
        }))
    const heads = lifelines
        .filter((l) => l.shape)
        .map((l) =>
            l.uml
                ? {
                      x: l.shape.box.x,
                      y: l.shape.box.y,
                      w: l.shape.box.w,
                      h: Number(l.shape.size ?? 40),
                  }
                : l.shape.box,
        )
    const frames = vertices.filter((c) => c.shape === "umlFrame")
    return {
        vertices,
        lifelines,
        umlLifelines: lifelines.filter((l) => l.uml).length,
        messages,
        otherEdges,
        minGap,
        sharedRows: messages.filter((m) =>
            messages.some((o) => o !== m && Math.abs(o.y - m.y) < 6),
        ).length,
        slanted: messages.filter((m) => m.slanted).length,
        hiddenSelf: messages.filter((m) => !m.visible).length,
        struck: messages.filter((m) => m.struck).length,
        labelOverlaps: labels.filter((l) =>
            labels.some((o) => o !== l && hit(l.box, o.box)),
        ).length,
        labelsOnHeads: labels.filter(
            (l) => l.edge && heads.some((h) => hit(l.box, h)),
        ).length,
        frames,
        // A frame's label that does not fit the tab it is written in: too
        // wide, or wrapped into more lines than the tab is tall
        frameLabelsTooLong: frames.filter((f) => {
            const size = (key, fallback) =>
                Number(
                    new RegExp(`(?:^|;)${key}=(\\d+)`).exec(f.styleText)?.[1] ??
                        fallback,
                )
            return (
                f.label &&
                (f.label.w > size("width", 60) + 6 ||
                    f.label.h > size("height", 30) + 8)
            )
        }).length,
        // A frame whose top or bottom line lies on a message it reaches across
        framesOnMessages: frames.filter((f) =>
            messages.some(
                (m) =>
                    m.x2 > f.box.x &&
                    m.x1 < f.box.x + f.box.w &&
                    (Math.abs(m.y - f.box.y) < 6 ||
                        Math.abs(m.y - (f.box.y + f.box.h)) < 6),
            ),
        ).length,
        notes: vertices.filter((c) => c.shape === "note"),
    }
}

/** How much of the request's participants and messages the run drew */
function matchExpected(seq, request) {
    if (!request.participants) return null
    const lifelineFor = (name) =>
        seq.lifelines.find((l) => sameName(l.name, name))
    const participants = request.participants.filter(lifelineFor).length
    // The expected messages, found in the drawn ones from top to bottom
    let at = 0
    let matched = 0
    const rows = []
    for (const [from, to] of request.messages) {
        const a = lifelineFor(from)
        const b = lifelineFor(to)
        const found =
            a && b
                ? seq.messages.findIndex(
                      (m, i) => i >= at && m.from === a && m.to === b,
                  )
                : -1
        if (found >= 0) {
            matched++
            rows.push(seq.messages[found])
            at = found + 1
        } else rows.push(null)
    }
    return {
        participants,
        participantsWanted: request.participants.length,
        matched,
        wanted: request.messages.length,
        rows,
    }
}

/** Whether the special demand of a request was met */
function demandMet(request, seq, expected) {
    const white = (c) => /^(#fff(fff)?|white)$/i.test(String(c ?? ""))
    switch (request.id) {
        case "colours":
            return (
                seq.lifelines.length > 0 &&
                seq.lifelines.every(
                    (l) =>
                        l.shape &&
                        /^#1f4e79$/i.test(String(l.shape.fill ?? "")) &&
                        white(l.shape.fontColor),
                )
            )
        case "loop-note": {
            const inside = expected.rows.slice(4, 7)
            const outside = [expected.rows[3], expected.rows[7]]
            const covers = (f, m) =>
                m && m.y > f.box.y && m.y < f.box.y + f.box.h
            const loop = seq.frames.some(
                (f) =>
                    inside.every((m) => covers(f, m)) &&
                    outside.every((m) => m && !covers(f, m)),
            )
            return loop && seq.notes.some((n) => /5\s*min/i.test(n.text))
        }
        case "long":
            return expected.matched === expected.wanted
        case "order-spacing": {
            const xs = seq.lifelines.map((l) => l.shape?.box.x ?? Number.NaN)
            return (
                seq.lifelines.length === request.participants.length &&
                seq.lifelines.every((l, i) =>
                    sameName(l.name, request.participants[i]),
                ) &&
                Math.abs(xs[0] - 60) <= 2 &&
                xs.every(
                    (x, i) => i === 0 || Math.abs(x - xs[i - 1] - 240) <= 2,
                )
            )
        }
        case "self":
            return seq.messages.filter((m) => m.self && m.visible).length >= 3
        case "activation": {
            const bars = (name) => {
                const l = seq.lifelines.find((x) => sameName(x.name, name))
                return (
                    !!l &&
                    seq.vertices.some(
                        (v) =>
                            v !== l.cell &&
                            v !== l.shape &&
                            v.box.w <= 24 &&
                            v.box.h >= 20 &&
                            v.box.h < l.bottom - l.top &&
                            Math.abs(v.box.x + v.box.w / 2 - l.cx) <= 8,
                    )
                )
            }
            return bars("API") && bars("Worker")
        }
        default:
            return null
    }
}

function scoreRun(dir, name, request) {
    const meta = JSON.parse(
        fs.readFileSync(path.join(dir, `${name}.json`), "utf8"),
    )
    const { cells = [] } = JSON.parse(
        fs.readFileSync(path.join(dir, `${name}.cells.json`), "utf8"),
    )
    const calls = meta.answers.flatMap((a) => a.calls)
    const usage = (key) =>
        meta.answers.reduce((sum, a) => sum + (a.usage?.[key] ?? 0), 0)
    const seq = readSequence(cells)
    const run = {
        name,
        error: meta.error,
        drew: cells.length > 0,
        answers: meta.answers.length,
        guideCalls: calls
            .filter((c) => c.tool === "get_diagram_guide")
            .map((c) => c.input?.type),
        drawCalls: calls.filter((c) => c.tool === "display_diagram").length,
        editCalls: calls.filter((c) => c.tool === "edit_diagram").length,
        inputErrors: calls.filter((c) => c.inputError).length,
        xmlInText: meta.answers.some((a) => /<mxCell\b/.test(a.text)),
        seconds: meta.seconds ?? null,
        outputTokens: usage("outputTokens"),
        inputTokens: usage("inputTokens"),
        cost: usage("costUsd"),
        layoutProblems: meta.layout?.count ?? null,
        layoutKinds: meta.layout?.kinds ?? [],
        shapes: cells.filter((c) => c.vertex && !c.parentIsEdge).length,
        edges: cells.filter((c) => c.edge).length,
        lifelines: seq.lifelines.length,
        umlLifelines: seq.umlLifelines,
        isSequence: seq.lifelines.length >= 2 && seq.messages.length >= 1,
    }
    if (request.type !== "sequence") {
        // Another type with a scorer of its own, or a request without a type
        const xmlFile = path.join(dir, `${name}.xml`)
        const xml = fs.existsSync(xmlFile)
            ? fs.readFileSync(xmlFile, "utf8")
            : ""
        const score = scoreType(cells, request, run.layoutProblems, xml)
        return score ? { ...run, ...score } : run
    }
    const expected = matchExpected(seq, request)
    Object.assign(run, {
        messages: seq.messages.length,
        otherEdges: seq.otherEdges.length,
        minGap: seq.minGap,
        sharedRows: seq.sharedRows,
        slanted: seq.slanted,
        hiddenSelf: seq.hiddenSelf,
        struck: seq.struck,
        labelOverlaps: seq.labelOverlaps,
        labelsOnHeads: seq.labelsOnHeads,
        frames: seq.frames.length,
        frameLabelsTooLong: seq.frameLabelsTooLong,
        framesOnMessages: seq.framesOnMessages,
        expected: expected && {
            participants: `${expected.participants}/${expected.participantsWanted}`,
            messages: `${expected.matched}/${expected.wanted}`,
        },
    })
    // Structure: lifelines, and every message level on a row of its own
    run.structure =
        run.isSequence &&
        seq.slanted === 0 &&
        seq.sharedRows === 0 &&
        seq.hiddenSelf === 0 &&
        (seq.minGap === null || seq.minGap >= 30)
    // Correct: the structure, and what the request listed is all there, in order
    run.correct =
        run.structure &&
        (!expected ||
            (expected.participants === expected.participantsWanted &&
                expected.matched === expected.wanted))
    // Clean: correct, and nothing lies on something else
    run.clean =
        run.correct &&
        seq.struck === 0 &&
        seq.labelOverlaps === 0 &&
        seq.labelsOnHeads === 0 &&
        seq.frameLabelsTooLong === 0 &&
        seq.framesOnMessages === 0
    if (request.demand) {
        run.demand = expected ? demandMet(request, seq, expected) : false
    }
    return run
}

const summary = {}
for (const config of configs) {
    const dir = path.join(outDir, config)
    const runs = {}
    for (const request of requests) {
        const names = fs
            .readdirSync(dir)
            .filter(
                (f) =>
                    f.startsWith(`${request.id}-${model}-`) &&
                    f.endsWith(".json") &&
                    !f.endsWith(".cells.json"),
            )
            .map((f) => f.slice(0, -5))
            .sort(
                (a, b) =>
                    Number(a.split("-").at(-1)) - Number(b.split("-").at(-1)),
            )
        runs[request.id] = names.map((name) => scoreRun(dir, name, request))
    }
    summary[config] = runs
}

const count = (runs, test) => runs.filter(test).length
const pad = (s, n) => String(s).padEnd(n)
for (const group of [...new Set(requests.map((r) => r.group))]) {
    console.log(`\n== ${group} (${model})`)
    // The groups whose requests name a type are scored as that type
    const sequenceGroup = requests.some((r) => r.group === group && r.type)
    console.log(
        pad("request", 18) +
            pad("config", 10) +
            pad("runs", 6) +
            (sequenceGroup
                ? pad("structure", 10) +
                  pad("correct", 9) +
                  pad("clean", 7) +
                  pad("solid", 7) +
                  pad("demand", 8)
                : pad("drew", 6) +
                  pad("seq-diagram", 12) +
                  pad("layout-problem-runs", 20)) +
            pad("guide", 7) +
            pad("xml-in-text", 12) +
            pad("sec", 6) +
            pad("out-tok", 9) +
            "cents",
    )
    for (const request of requests.filter((r) => r.group === group)) {
        for (const config of configs) {
            const runs = summary[config][request.id]
            if (runs.length === 0) continue
            const mid = sequenceGroup
                ? pad(
                      count(runs, (r) => r.structure),
                      10,
                  ) +
                  pad(
                      count(runs, (r) => r.correct),
                      9,
                  ) +
                  pad(
                      count(runs, (r) => r.clean),
                      7,
                  ) +
                  // Only the types of types.mjs are scored for it
                  pad(
                      runs.some((r) => r.solid !== undefined)
                          ? count(runs, (r) => r.solid)
                          : "",
                      7,
                  ) +
                  pad(request.demand ? count(runs, (r) => r.demand) : "", 8)
                : pad(
                      count(runs, (r) => r.drew),
                      6,
                  ) +
                  pad(
                      count(runs, (r) => r.isSequence),
                      12,
                  ) +
                  pad(
                      count(runs, (r) => (r.layoutProblems ?? 0) > 0),
                      20,
                  )
            console.log(
                pad(request.id, 18) +
                    pad(config, 10) +
                    pad(runs.length, 6) +
                    mid +
                    pad(
                        count(runs, (r) => r.guideCalls.length > 0),
                        7,
                    ) +
                    pad(
                        count(runs, (r) => r.xmlInText),
                        12,
                    ) +
                    pad(
                        Math.round(median(runs.map((r) => r.seconds)) ?? 0),
                        6,
                    ) +
                    pad(
                        Math.round(
                            median(runs.map((r) => r.outputTokens)) ?? 0,
                        ),
                        9,
                    ) +
                    (median(runs.map((r) => r.cost * 100)) ?? 0).toFixed(2),
            )
        }
    }
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 1))
