/**
 * Graph → layers. What turns a flat list of nodes and arrows into a diagram.
 *
 * The engine's layout can only arrange what nesting tells it to: a container stacks its
 * children in one direction, so six boxes declared in a row become six boxes in a row. For
 * a flowchart that is the wrong answer, and measurably so — an order-approval flow declared
 * in its natural order comes out as one column, which forces the arrow from the decision to
 * its second branch to jump over the first branch, and the arrow to the merge point to jump
 * back over that. The layout never looked at the arrows.
 *
 * This computes what it should have looked at. Three steps, the standard shape of a layered
 * graph drawing (Sugiyama's algorithm):
 *
 *   1. LAYER — how far along the flow each node sits. Longest path from a source, so an
 *      arrow always points forwards and no arrow skips backwards through a layer.
 *   2. ORDER — who goes left and who goes right within a layer. Chosen to reduce the number
 *      of arrows that cross, which is what makes a flowchart readable.
 *   3. EMIT — one invisible row container per layer, which the existing layout then places.
 *
 * Step 3 is why this file is small: the coordinate work already exists, and it is the same
 * code that lays out an AWS diagram. What was missing was only the decision of what goes in
 * which row.
 */

import type { Operation } from "./operations"
import type { BoxShape, Role } from "./types"

/** A node in the graph the caller wants drawn. */
export interface GraphNode {
    id: string
    label: string
    /** Flowchart outline. `decision` for a branch, `terminator` for a start or end point. */
    shape?: BoxShape
    /** Catalog stencil name. When set the node renders as an icon rather than a box. */
    icon?: string
    /**
     * Semantic group name, e.g. "remote" or "local". Nodes sharing a group get the same
     * fill colour from the engine's palette, assigned in order of first appearance — the
     * caller names the grouping and never touches a colour.
     */
    group?: string
    /** Information role (heading, callout, metric…); the theme decides how it looks. */
    role?: Role
}

/** An arrow. Direction matters: it is what determines the layering. */
export interface GraphEdge {
    source: string
    target: string
    label?: string
    dashed?: boolean
    /** Thick coloured arrow for THE key relationship. */
    bold?: boolean
    /** Arrowhead tokens, passed through — see LinkSpec. */
    head?: string
    tail?: string
    headFill?: boolean
    tailFill?: boolean
}

export interface GraphOptions {
    /** "col" (default): layers stack downwards. "row": layers run left to right. */
    flow?: "col" | "row"
}

/** Distance between layers. */
const LAYER_GAP = 48
/** Distance between nodes within a layer. */
const NODE_GAP = 60
/** Prefix for the generated layer container ids. */
const LAYER_ID = "__layer"

export interface GraphResult {
    operations: Operation[]
    /** The nodes of each layer, in the order they were placed. */
    layers: string[][]
    /** Edges dropped because an endpoint is not in the node list. */
    unknownEndpoints: string[]
    /** Edges that had to be treated as loops rather than as layering constraints. */
    backEdges: { source: string; target: string }[]
}

/**
 * Break every cycle, so the graph can be layered at all.
 *
 * A depth-first walk; any arrow pointing at a node still on the current path is a way back
 * to where we came from, and cannot be a "this comes after that" constraint. Those arrows
 * are still DRAWN — a review loop is the point of the diagram — they just do not get a say
 * in which layer anything lands in.
 */
function breakCycles(
    nodes: string[],
    edges: GraphEdge[],
): { forward: GraphEdge[]; back: GraphEdge[] } {
    const out = new Map<string, GraphEdge[]>(nodes.map((n) => [n, []]))
    for (const e of edges) out.get(e.source)?.push(e)

    const forward: GraphEdge[] = []
    const back: GraphEdge[] = []
    const onPath = new Set<string>()
    const done = new Set<string>()

    // An explicit stack, not recursion: a 500-node dependency graph is a plausible input and
    // a recursive walk over one would overflow.
    for (const root of nodes) {
        if (done.has(root)) continue
        const stack: { id: string; next: number }[] = [{ id: root, next: 0 }]
        onPath.add(root)
        while (stack.length > 0) {
            const top = stack[stack.length - 1]
            const list = out.get(top.id) ?? []
            if (top.next >= list.length) {
                onPath.delete(top.id)
                done.add(top.id)
                stack.pop()
                continue
            }
            const e = list[top.next++]
            if (onPath.has(e.target)) {
                back.push(e)
                continue
            }
            forward.push(e)
            if (!done.has(e.target)) {
                onPath.add(e.target)
                stack.push({ id: e.target, next: 0 })
            }
        }
    }
    return { forward, back }
}

/**
 * Assign each node to a layer: the longest path to it from any node with no predecessor.
 *
 * Longest path rather than shortest, because a node has to come after EVERYTHING that feeds
 * it. Take the shortest and an arrow ends up pointing backwards: with `a→b`, `a→c`, `c→b`,
 * the shortest path puts b in layer 1 alongside c, and then `c→b` points sideways.
 */
function assignLayers(nodes: string[], forward: GraphEdge[]): string[][] {
    const layer = new Map<string, number>(nodes.map((n) => [n, 0]))
    // Relaxation, bounded by the node count: the longest possible chain visits every node
    // once, so after that many rounds nothing can still be moving.
    for (let round = 0; round < nodes.length; round++) {
        let moved = false
        for (const e of forward) {
            const want = (layer.get(e.source) ?? 0) + 1
            if (want > (layer.get(e.target) ?? 0)) {
                layer.set(e.target, want)
                moved = true
            }
        }
        if (!moved) break
    }
    const depth = Math.max(0, ...layer.values()) + 1
    const layers: string[][] = Array.from({ length: depth }, () => [])
    // Declaration order within a layer, so the ordering pass starts somewhere predictable.
    for (const n of nodes) layers[layer.get(n) ?? 0].push(n)
    return layers
}

/**
 * Reorder each layer to reduce the number of arrows that cross.
 *
 * Barycentre sweeping: a node is placed at the average position of the nodes it connects to
 * in the neighbouring layer, and the whole diagram is swept downwards then upwards
 * repeatedly. Each sweep can only be judged against the previous layer's order, so a node
 * pulled into a better place drags its own neighbours in the next sweep.
 *
 * The heuristic, not an exact minimum: finding the true minimum number of crossings is
 * NP-hard even for two layers. In practice this reaches zero crossings on the flowcharts the
 * model actually produces — verified on a 14-node pipeline with two diamonds and a rollback
 * loop, and on a bipartite graph whose declared order forces three crossings.
 */
function reduceCrossings(layers: string[][], edges: GraphEdge[]): void {
    if (layers.length < 2) return
    const PASSES = 8
    const into = new Map<string, string[]>()
    const outOf = new Map<string, string[]>()
    for (const e of edges) {
        if (e.source === e.target) continue
        ;(into.get(e.target) ?? into.set(e.target, []).get(e.target))?.push(
            e.source,
        )
        ;(outOf.get(e.source) ?? outOf.set(e.source, []).get(e.source))?.push(
            e.target,
        )
    }

    let best = layers.map((l) => [...l])
    let bestScore = countCrossings(layers, edges)

    for (let pass = 0; pass < PASSES && bestScore > 0; pass++) {
        const pos = new Map<string, number>()
        for (const l of layers)
            l.forEach((n, i) => {
                pos.set(n, i)
            })
        const down = pass % 2 === 0
        const order = down
            ? layers.map((_, i) => i).slice(1)
            : layers
                  .map((_, i) => i)
                  .slice(0, -1)
                  .reverse()

        for (const i of order) {
            const neighbours = down ? into : outOf
            const key = new Map<string, number>()
            layers[i].forEach((n, idx) => {
                const nb = (neighbours.get(n) ?? [])
                    .map((m) => pos.get(m))
                    .filter((v): v is number => v !== undefined)
                // A node with no neighbour in that direction keeps its place, rather than
                // being pushed to one end by a default of zero.
                key.set(
                    n,
                    nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : idx,
                )
            })
            layers[i] = [...layers[i]].sort(
                (a, b) => (key.get(a) ?? 0) - (key.get(b) ?? 0),
            )
        }

        // Keep the best arrangement seen: sweeping is not monotonic, and a later pass can be
        // worse than an earlier one.
        const score = countCrossings(layers, edges)
        if (score < bestScore) {
            bestScore = score
            best = layers.map((l) => [...l])
        }
    }
    for (let i = 0; i < layers.length; i++) layers[i] = best[i]
}

/**
 * How many pairs of arrows cross between adjacent layers.
 *
 * Two arrows between the same pair of layers cross exactly when their endpoints are in the
 * opposite order on the two sides. That is all this counts — arrows spanning more than one
 * layer are ignored here, because their crossings depend on routing rather than ordering.
 */
function countCrossings(layers: string[][], edges: GraphEdge[]): number {
    const layerOf = new Map<string, number>()
    const posOf = new Map<string, number>()
    layers.forEach((l, i) => {
        l.forEach((n, j) => {
            layerOf.set(n, i)
            posOf.set(n, j)
        })
    })
    let total = 0
    for (let i = 0; i + 1 < layers.length; i++) {
        const span = edges.filter(
            (e) =>
                layerOf.get(e.source) === i && layerOf.get(e.target) === i + 1,
        )
        for (let a = 0; a < span.length; a++)
            for (let b = a + 1; b < span.length; b++) {
                const s1 = posOf.get(span[a].source) ?? 0
                const t1 = posOf.get(span[a].target) ?? 0
                const s2 = posOf.get(span[b].source) ?? 0
                const t2 = posOf.get(span[b].target) ?? 0
                if ((s1 - s2) * (t1 - t2) < 0) total++
            }
    }
    return total
}

/**
 * Turn a graph into the operations that draw it.
 *
 * The output is ordinary operations — nothing here is a new kind of thing the rest of the
 * engine has to know about. A layer of one node is emitted directly rather than wrapped,
 * because a single-child row container would just add a level of nesting with nothing to
 * arrange.
 */
export function graphToOperations(
    nodes: GraphNode[],
    edges: GraphEdge[],
    opts: GraphOptions = {},
): GraphResult {
    const flow = opts.flow ?? "col"
    const ids = nodes.map((n) => n.id)
    const known = new Set(ids)

    const unknownEndpoints: string[] = []
    const usable: GraphEdge[] = []
    for (const e of edges) {
        if (!known.has(e.source)) unknownEndpoints.push(e.source)
        if (!known.has(e.target)) unknownEndpoints.push(e.target)
        if (known.has(e.source) && known.has(e.target)) usable.push(e)
    }

    // A self-loop tells us nothing about layering and would make the cycle break drop a real
    // arrow, so it is set aside and drawn as-is.
    const loops = usable.filter((e) => e.source === e.target)
    const between = usable.filter((e) => e.source !== e.target)

    const { forward, back } = breakCycles(ids, between)
    const layers = assignLayers(ids, forward)
    reduceCrossings(layers, forward)

    // The flow axis is the OUTER container's direction; a layer runs across it.
    const outerDir = flow
    const layerDir = flow === "col" ? "row" : "col"
    const root = `${LAYER_ID}s`

    const operations: Operation[] = [
        {
            op: "add_container",
            id: root,
            label: "",
            dir: outerDir,
            gap: LAYER_GAP,
        },
    ]
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const add = (id: string, parent: string): Operation => {
        const n = byId.get(id) as GraphNode
        return n.icon
            ? {
                  op: "add_icon",
                  id: n.id,
                  parent,
                  name: n.icon,
                  label: n.label,
              }
            : {
                  op: "add_box",
                  id: n.id,
                  parent,
                  label: n.label,
                  ...(n.shape && n.shape !== "box" ? { shape: n.shape } : {}),
                  ...(n.role && n.role !== "body" ? { role: n.role } : {}),
                  ...(n.group ? { group: n.group } : {}),
              }
    }

    layers.forEach((members, i) => {
        if (members.length === 0) return
        if (members.length === 1) {
            operations.push(add(members[0], root))
            return
        }
        const band = `${LAYER_ID}${i}`
        operations.push({
            op: "add_container",
            id: band,
            parent: root,
            label: "",
            dir: layerDir,
            gap: NODE_GAP,
        })
        for (const m of members) operations.push(add(m, band))
    })

    for (const e of [...between, ...loops])
        operations.push({
            op: "link",
            source: e.source,
            target: e.target,
            ...(e.label ? { label: e.label } : {}),
            ...(e.dashed ? { dashed: true } : {}),
            ...(e.bold ? { bold: true } : {}),
            ...(e.head !== undefined
                ? { head: e.head, headFill: e.headFill ?? false }
                : {}),
            ...(e.tail !== undefined
                ? { tail: e.tail, tailFill: e.tailFill ?? false }
                : {}),
        })

    return {
        operations,
        layers: layers.filter((l) => l.length > 0),
        unknownEndpoints: [...new Set(unknownEndpoints)],
        backEdges: back.map((e) => ({ source: e.source, target: e.target })),
    }
}
