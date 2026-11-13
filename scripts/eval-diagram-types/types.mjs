// Scores for the diagram types other than sequence diagrams, from the cells
// draw.io rendered and from what the request lists (requests.json): the
// nodes and connections that must be there, and what each type needs on top
// (steps in the right lane, a hollow triangle on an inheritance, actors
// outside the system boundary...).

const norm = (s) =>
    String(s ?? "")
        .toLowerCase()
        .replace(/[\s"'“”「」:：()（）.,，。?？_-]/g, "")

/**
 * How well a cell's text names the label: 3 when it is the label, 2 when
 * one of its lines is (a class box: name, attributes, methods), 1 when the
 * label stands in it at a word boundary ("Order" is in "List<Order>" but
 * not in "OrderItem"), 0 when it does not. A plural "s" still names it.
 */
function names(text, label) {
    const t = String(text ?? "")
    const same = (a) => norm(a) === norm(label) || norm(a) === `${norm(label)}s`
    if (same(t)) return 3
    // A line may carry a stereotype before the name: «abstract» Shape
    if (
        t
            .split("\n")
            .some((line) => same(line.replace(/[«<]+[^»>]*[»>]+/g, "")))
    ) {
        return 2
    }
    const wordChar = /[\p{L}\p{N}_]/u
    const low = t.toLowerCase()
    const want = String(label).toLowerCase()
    for (let at = low.indexOf(want); at >= 0; at = low.indexOf(want, at + 1)) {
        const before = t[at - 1]
        let after = t[at + want.length]
        if (after === "s") after = t[at + want.length + 1]
        if (
            !(before && wordChar.test(before)) &&
            !(after && wordChar.test(after))
        ) {
            return 1
        }
    }
    return 0
}

/**
 * The labels of the canvas XML as plain text that keeps its lines: a class
 * drawn as one cell has its name, attributes and methods on lines of one
 * HTML label, which run together in the text the editor reports.
 */
export function labelsFromXml(xml) {
    const decode = (s) =>
        s
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#x[aA];|&#10;/g, "\n")
            .replace(/&nbsp;/g, " ")
            .replace(/&laquo;/g, "«")
            .replace(/&raquo;/g, "»")
            .replace(/&amp;/g, "&")
    const labels = new Map()
    for (const [, attrs] of xml.matchAll(
        /<(?:mxCell|UserObject|object)\b([^>]*)>/g,
    )) {
        const id = /\sid="([^"]*)"/.exec(attrs)?.[1]
        const raw = /\s(?:value|label)="([^"]*)"/.exec(attrs)?.[1]
        if (id === undefined || raw === undefined) continue
        const html = decode(raw)
        const text = decode(
            html
                .replace(/<(br|hr)\b[^>]*>/gi, "\n")
                .replace(/<\/(div|p|li|tr|h\d)>/gi, "\n")
                .replace(/<[^>]+>/g, ""),
        )
        labels.set(
            id,
            text
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .join("\n"),
        )
    }
    return labels
}

const centre = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 })
const inside = (p, box) =>
    p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h

/** The drawing as nodes and connections */
function readGraph(cells) {
    const byId = new Map(cells.map((c) => [c.id, c]))
    const vertices = cells.filter((c) => c.vertex && c.box && !c.parentIsEdge)
    const edges = cells.filter((c) => c.edge && c.pts && c.pts.length >= 2)
    /**
     * The vertex with this label: the one that names it best, the larger
     * one of two that do equally. A name written on a cell inside an
     * unnamed box (a class drawn as a group) stands for the box.
     */
    const find = (label) => {
        const found = vertices
            .map((v) => ({ v, quality: names(v.text, label) }))
            .filter((f) => f.quality > 0)
            .sort(
                (a, b) =>
                    b.quality - a.quality ||
                    b.v.box.w * b.v.box.h - a.v.box.w * a.v.box.h,
            )[0]
        let node = found?.v ?? null
        for (
            let up = byId.get(node?.parent);
            up?.vertex && !up.text;
            up = byId.get(up.parent)
        ) {
            node = up
        }
        return node
    }
    /** Whether a cell is the node or drawn inside it as its child */
    const within = (cell, node) => {
        for (let c = cell; c; c = byId.get(c.parent))
            if (c === node) return true
        return false
    }
    /**
     * The shapes a reader sees as one node: the node, its children, shapes
     * drawn on it, and the boxes stacked right below it at its width (a
     * class drawn as a name box with an attribute box and a method box)
     */
    const partsOf = (node) => {
        const parts = vertices.filter(
            (v) => within(v, node) || inside(centre(v.box), node.box),
        )
        let bottom = node.box.y + node.box.h
        const below = vertices
            .filter(
                (v) =>
                    !parts.includes(v) &&
                    Math.abs(v.box.x - node.box.x) <= 4 &&
                    Math.abs(v.box.w - node.box.w) <= 4,
            )
            .sort((a, b) => a.box.y - b.box.y)
        for (const v of below) {
            if (Math.abs(v.box.y - bottom) > 4) continue
            parts.push(v, ...vertices.filter((c) => c !== v && within(c, v)))
            bottom = v.box.y + v.box.h
        }
        return parts
    }
    /** Whether a cell belongs to what a reader sees as the node */
    const partOf = (cell, node) =>
        partsOf(node).some((part) => within(cell, part))
    const textsOf = (node) =>
        partsOf(node)
            .map((v) => v.text)
            .join(" ")
    // Shapes with text that lie on another shape without being its child:
    // they look like its content but stay behind when it is moved
    const overlays = vertices.filter(
        (v) =>
            v.text &&
            vertices.some(
                (o) =>
                    o !== v &&
                    !within(v, o) &&
                    !within(o, v) &&
                    o.box.w * o.box.h > 2 * v.box.w * v.box.h &&
                    inside(centre(v.box), o.box),
            ),
    ).length
    /** The vertex an edge end is on: attached, or lying at the end point */
    const endOf = (edge, which) => {
        const attached = byId.get(
            which === "source" ? edge.source : edge.target,
        )
        if (attached) return attached
        const p = which === "source" ? edge.pts[0] : edge.pts.at(-1)
        const grown = (b) => ({
            x: b.x - 10,
            y: b.y - 10,
            w: b.w + 20,
            h: b.h + 20,
        })
        return (
            vertices
                .filter((v) => inside(p, grown(v.box)))
                .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0] ??
            null
        )
    }
    const links = edges.map((e) => ({
        edge: e,
        from: endOf(e, "source"),
        to: endOf(e, "target"),
        text:
            e.text ||
            cells.find((c) => c.parent === e.id && c.text)?.text ||
            "",
    }))
    /**
     * The connections between two nodes, in the given direction or either.
     * Lines that meet in a small joint without text on their way count too
     * (two subclasses sharing one arrow into their parent): the result is
     * then the line that reaches b.
     */
    const between = (a, b, directed = false) => {
        const joined = links.filter((l) => l.from && l.to)
        const direct = joined.filter(
            (l) =>
                (partOf(l.from, a) && partOf(l.to, b)) ||
                (!directed && partOf(l.from, b) && partOf(l.to, a)),
        )
        if (direct.length > 0) return direct
        const isJoint = (v) => !v.text && v.box.w <= 24 && v.box.h <= 24
        const touches = (l, node) => partOf(l.from, node) || partOf(l.to, node)
        const other = (l, node) => (partOf(l.from, node) ? l.to : l.from)
        return joined.filter(
            (l) =>
                touches(l, b) &&
                isJoint(other(l, b)) &&
                joined.some(
                    (m) =>
                        m !== l && touches(m, a) && other(m, a) === other(l, b),
                ),
        )
    }
    return {
        vertices,
        links,
        find,
        textsOf,
        between,
        within,
        partOf,
        overlays,
        // Connections with an end on nothing
        loose: links.filter((l) => !l.from || !l.to).length,
    }
}

/**
 * How many of the listed nodes and connections are drawn. `find` looks a
 * label up (the graph's own lookup unless a type knows better).
 */
function matchListed(g, request, checkKind, find = g.find) {
    const nodes = (request.nodes ?? []).map((label) => find(label))
    const edges = (request.edges ?? []).map(([from, to, kind]) => {
        const a = find(from)
        const b = find(to)
        if (!a || !b) return false
        const found = g.between(a, b, request.type === "state")
        return (
            found.length > 0 &&
            (!kind || !checkKind || found.some((l) => checkKind(l, kind, b)))
        )
    })
    return {
        nodes: `${nodes.filter(Boolean).length}/${nodes.length}`,
        nodesOk: nodes.every(Boolean),
        edges: `${edges.filter(Boolean).length}/${edges.length}`,
        edgesOk: edges.every(Boolean),
    }
}

const SCORERS = {
    /** Lanes that hold their steps */
    swimlane(g, request) {
        // A lane is the shape that carries its name, or, when the name is a
        // text of its own, the band it is written on
        const laneOf = (name) => {
            const title = g.find(name)
            if (!title) return null
            const area = (v) => v.box.w * v.box.h
            const band = g.vertices
                .filter(
                    (v) =>
                        v !== title &&
                        !v.text &&
                        area(v) >= 5 * area(title) &&
                        inside(centre(title.box), v.box),
                )
                .sort((a, b) => area(a) - area(b))[0]
            if (band) return { title, box: band.box }
            // A name box with the lane's body right below it or right of it
            const t = title.box
            const body = g.vertices.find(
                (v) =>
                    v !== title &&
                    !v.text &&
                    ((Math.abs(v.box.x - t.x) <= 4 &&
                        Math.abs(v.box.w - t.w) <= 4 &&
                        Math.abs(v.box.y - (t.y + t.h)) <= 4) ||
                        (Math.abs(v.box.y - t.y) <= 4 &&
                            Math.abs(v.box.h - t.h) <= 4 &&
                            Math.abs(v.box.x - (t.x + t.w)) <= 4)),
            )
            if (!body) return { title, box: t }
            const x = Math.min(t.x, body.box.x)
            const y = Math.min(t.y, body.box.y)
            return {
                title,
                box: {
                    x,
                    y,
                    w: Math.max(t.x + t.w, body.box.x + body.box.w) - x,
                    h: Math.max(t.y + t.h, body.box.y + body.box.h) - y,
                },
            }
        }
        const lanes = Object.keys(request.lanes).map(laneOf)
        const drawn = lanes.filter(Boolean)
        const lanesOk = drawn.length === lanes.length
        // Shapes with text that lie in no lane (the lanes' own names and a
        // title above the diagram are not steps)
        const top = Math.min(...drawn.map((l) => l.box.y))
        const strays = g.vertices.filter(
            (v) =>
                v.text &&
                !drawn.some((l) => l.title === v) &&
                !drawn.some((l) => inside(centre(v.box), l.box)) &&
                !drawn.some((l) => inside(centre(l.box), v.box)) &&
                v.box.y + v.box.h > top,
        ).length
        // Every listed step in the lane of its role
        let placed = 0
        let steps = 0
        for (const [lane, names_] of Object.entries(request.lanes)) {
            const box = laneOf(lane)?.box
            for (const name of names_) {
                steps++
                const step = g.find(name)
                if (box && step && inside(centre(step.box), box)) placed++
            }
        }
        const listed = matchListed(g, request)
        return {
            detail: {
                lanes: `${drawn.length}/${lanes.length}`,
                strays,
                steps: `${placed}/${steps}`,
                edges: listed.edges,
            },
            structure: lanesOk && strays === 0,
            correct:
                lanesOk && strays === 0 && placed === steps && listed.edgesOk,
        }
    },

    /** Class boxes with their members, and the right line ends */
    class(g, request) {
        // b is the node the relation was listed as going to (the parent)
        const kindOk = (link, kind, b) => {
            const style = link.edge.styleText
            if (kind === "inherit") {
                // A hollow triangle at the parent's end
                const atTarget = g.partOf(link.to, b)
                const key = atTarget ? "end" : "start"
                return (
                    new RegExp(`${key}Arrow=(block|blockThin|triangle)`).test(
                        style,
                    ) && new RegExp(`${key}Fill=0`).test(style)
                )
            }
            if (kind === "compose")
                return /(start|end)Arrow=diamond/.test(style)
            return true
        }
        const listed = matchListed(g, request, kindOk)
        const members = Object.entries(request.members ?? {})
        const membersOk = members.filter(([cls, member]) => {
            const node = g.find(cls)
            return node && norm(g.textsOf(node)).includes(norm(member))
        }).length
        return {
            detail: {
                classes: listed.nodes,
                members: `${membersOk}/${members.length}`,
                relations: listed.edges,
            },
            structure: g.vertices.length >= 2 && g.loose === 0,
            correct:
                listed.nodesOk &&
                membersOk === members.length &&
                listed.edgesOk &&
                g.loose === 0,
        }
    },

    /** Entities with their attributes, connected */
    er(g, request) {
        const listed = matchListed(g, request)
        const members = Object.entries(request.members ?? {})
        const membersOk = members.filter(([entity, member]) => {
            const node = g.find(entity)
            return node && norm(g.textsOf(node)).includes(norm(member))
        }).length
        return {
            detail: {
                entities: listed.nodes,
                attributes: `${membersOk}/${members.length}`,
                relations: listed.edges,
            },
            structure:
                g.vertices.length >= 2 && g.links.length >= 1 && g.loose === 0,
            correct:
                listed.nodesOk &&
                membersOk === members.length &&
                listed.edgesOk &&
                g.loose === 0,
        }
    },

    /** Stick figures outside the system, ovals inside it */
    usecase(g, request) {
        const figures = g.vertices.filter((v) => v.shape === "umlActor")
        const ovals = g.vertices.filter((v) => v.shape === "ellipse" && v.text)
        // An actor is a stick figure with the name on it, or written as a
        // text of its own right below it
        const figureOf = (name) => {
            const node = g.find(name)
            if (!node || node.shape === "umlActor") return node
            return (
                figures.find(
                    (f) =>
                        Math.abs(centre(f.box).x - centre(node.box).x) <= 40 &&
                        node.box.y - (f.box.y + f.box.h) >= -10 &&
                        node.box.y - (f.box.y + f.box.h) <= 60,
                ) ?? null
            )
        }
        const isActor = (name) => (request.actors ?? []).includes(name)
        const find = (name) => (isActor(name) ? figureOf(name) : g.find(name))
        const actors = (request.actors ?? []).filter(
            (name) => figureOf(name)?.shape === "umlActor",
        ).length
        const cases = (request.nodes ?? []).map((name) => g.find(name))
        const casesOval = cases.filter((c) => c?.shape === "ellipse").length
        // The system: a box around every use case that no actor stands in
        const boundary = request.boundary ? g.find(request.boundary) : null
        const boundaryOk =
            !request.boundary ||
            (!!boundary &&
                cases.every((c) => c && inside(centre(c.box), boundary.box)) &&
                figures.every((f) => !inside(centre(f.box), boundary.box)))
        const kindOk = (link, kind) =>
            kind !== "include" || /dashed=1/.test(link.edge.styleText)
        // An actor's lines start at its figure
        const listed = matchListed(g, { ...request, nodes: [] }, kindOk, find)
        return {
            detail: {
                actors: `${actors}/${(request.actors ?? []).length}`,
                ovals: `${casesOval}/${cases.length}`,
                boundary: boundaryOk,
                relations: listed.edges,
            },
            structure:
                figures.length >= 1 && ovals.length >= 2 && g.loose === 0,
            correct:
                actors === (request.actors ?? []).length &&
                casesOval === cases.length &&
                boundaryOk &&
                listed.edgesOk &&
                g.loose === 0,
        }
    },

    /** States and labelled transitions, from a start to an end */
    state(g, request) {
        const kindOk = (link, event) => norm(link.text).includes(norm(event))
        const listed = matchListed(g, request, kindOk)
        // The start and the end: small round shapes
        const dots = g.vertices.filter((v) => v.box.w <= 44 && v.box.h <= 44)
        const start = dots.some(
            (d) =>
                g.links.some((l) => l.from === d) &&
                !g.links.some((l) => l.to === d),
        )
        const end = dots.some(
            (d) =>
                g.links.some((l) => l.to === d) &&
                !g.links.some((l) => l.from === d),
        )
        const endsOk = !request.ends || (start && end)
        return {
            detail: {
                states: listed.nodes,
                transitions: listed.edges,
                start,
                end,
            },
            structure:
                g.vertices.length >= 2 && g.links.length >= 1 && g.loose === 0,
            correct:
                listed.nodesOk && listed.edgesOk && endsOk && g.loose === 0,
        }
    },

    /** A tree around one central topic */
    mindmap(g, request) {
        const nodes = g.vertices.filter((v) => v.text)
        const joined = g.links.filter((l) => l.from && l.to)
        // A tree: one connection fewer than nodes, and all reachable
        const reached = new Set()
        const walk = (node) => {
            if (reached.has(node)) return
            reached.add(node)
            for (const l of joined) {
                if (l.from === node) walk(l.to)
                if (l.to === node) walk(l.from)
            }
        }
        if (nodes[0]) walk(nodes[0])
        const tree =
            nodes.length >= 3 &&
            joined.length === nodes.length - 1 &&
            nodes.every((n) => reached.has(n)) &&
            g.loose === 0
        const listed = matchListed(g, request)
        return {
            detail: {
                nodes: request.nodes ? listed.nodes : nodes.length,
                branches: listed.edges,
                tree,
            },
            structure: tree,
            correct: tree && listed.nodesOk && listed.edgesOk,
        }
    },
}

/**
 * The score of a run for a request of one of these types, or null for
 * another type. layout is the layout check's problem count, when one ran.
 */
export function scoreType(cells, request, layoutProblems, xml) {
    const scorer = SCORERS[request.type]
    if (!scorer) return null
    if (cells.length === 0) {
        return {
            structure: false,
            correct: false,
            clean: false,
            loose: 0,
            detail: "nothing drawn",
        }
    }
    const labels = labelsFromXml(xml ?? "")
    const g = readGraph(
        cells.map((c) => ({ ...c, text: labels.get(c.id) ?? c.text })),
    )
    const score = scorer(g, request)
    return {
        ...score,
        // Clean: correct, and the layout check found nothing
        clean: score.correct && (layoutProblems ?? 0) === 0,
        loose: g.loose,
        // Solid: correct, and built so that it moves in one piece: nothing
        // lies on a shape without belonging to it, and a figure is one shape
        overlays: g.overlays,
        solid: score.correct && g.overlays === 0,
    }
}
