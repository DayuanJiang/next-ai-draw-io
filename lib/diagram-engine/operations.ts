/**
 * Structural operations — what the model sends instead of XML.
 *
 * The tree is re-derived from the canvas on every call, so an operation names existing
 * nodes by id and says what to change. Adding one node costs a few dozen tokens; the
 * equivalent as raw mxCell XML is hundreds, and re-emitting the whole diagram to add one
 * icon costs thousands.
 *
 * Operations are applied in order, each against the result of the last, so a sequence
 * like "add a frame, then move two nodes into it" works in a single call.
 */

import { z } from "zod"
import {
    type ContainerNode,
    type DiagramNode,
    type DiagramTree,
    findNode,
    findParent,
    isContainer,
    type LinkSpec,
    walkTree,
} from "./types"

export const OperationSchema = z.discriminatedUnion("op", [
    z.object({
        op: z.literal("add_icon"),
        id: z.string().describe("New unique id for this node"),
        parent: z
            .string()
            .optional()
            .describe("Container id to add into; omit for top level"),
        name: z.string().describe("Catalog stencil name, e.g. 's3' or 'ec2'"),
        label: z.string().optional(),
        lane: z
            .number()
            .optional()
            .describe(
                "Inside a pool: which lane (0-based row) this belongs to",
            ),
        col: z
            .number()
            .optional()
            .describe(
                "Inside a pool: which column (0-based step) this sits in",
            ),
        after: z
            .string()
            .optional()
            .describe("Insert after this sibling id; omit to append"),
    }),
    z.object({
        op: z.literal("add_box"),
        id: z.string(),
        parent: z.string().optional(),
        label: z.string(),
        role: z
            .enum([
                "banner",
                "heading",
                "body",
                "callout",
                "good",
                "bad",
                "metric",
                "muted",
            ])
            .optional()
            .describe(
                "What this IS: banner=masthead, heading=section title, callout=must-not-miss, good/bad=verdict, metric=key number, muted=fine print. The theme decides how each looks",
            ),
        group: z
            .string()
            .optional()
            .describe(
                "Semantic zone name; nodes and panels sharing a group get the same hue from the engine's palette. Never pick colours",
            ),
        fill: z
            .string()
            .optional()
            .describe(
                "Fill colour, e.g. #DAE8FC. Prefer draw_graph's group field over picking colours",
            ),
        stroke: z
            .string()
            .optional()
            .describe("Border colour; pair it with fill"),
        shape: z
            .enum([
                "box",
                "decision",
                "terminator",
                "round",
                "data",
                "document",
            ])
            .optional()
            .describe(
                "Flowchart outline: decision=diamond, terminator=start/end, data=input/output, document=report. Omit for a plain rectangle",
            ),
        grow: z
            .number()
            .optional()
            .describe(
                "Flex-grow weight: this box takes that share of the parent's leftover space along its stacking axis. Omit for natural size",
            ),
        align: z
            .enum(["start", "center", "end", "stretch"])
            .optional()
            .describe(
                "Cross-axis position in the parent: start/end pin to an edge, stretch fills the axis (a divider or highlight bar spanning its card). Default center",
            ),
        lane: z
            .number()
            .optional()
            .describe(
                "Inside a pool: which lane (0-based row) this belongs to",
            ),
        col: z
            .number()
            .optional()
            .describe(
                "Inside a pool: which column (0-based step) this sits in",
            ),
        after: z.string().optional(),
    }),
    z.object({
        op: z.literal("add_container"),
        id: z.string(),
        parent: z.string().optional(),
        label: z
            .string()
            .describe("Frame title; empty string means invisible wrapper"),
        role: z
            .enum([
                "banner",
                "heading",
                "body",
                "callout",
                "good",
                "bad",
                "metric",
                "muted",
            ])
            .optional()
            .describe(
                "Section role: heading=titled tinted panel, banner=masthead strip, good/bad=verdict panel",
            ),
        group: z
            .string()
            .optional()
            .describe(
                "Semantic zone name; the panel and everything sharing this group take one hue",
            ),
        dir: z.enum(["row", "col"]).describe("How children stack"),
        gname: z
            .string()
            .optional()
            .describe(
                "Group stencil name, e.g. 'group_vpc'; omit for a plain frame",
            ),
        gap: z.number().optional(),
        pad: z
            .number()
            .optional()
            .describe(
                "Interior padding px (default 24). Small values make tight cards; nest containers for internal structure",
            ),
        grow: z
            .number()
            .optional()
            .describe(
                "Flex-grow weight: this container takes that share of the parent's leftover space. E.g. two columns with grow 2 and 1 split the width 2:1",
            ),
        align: z
            .enum(["start", "center", "end", "stretch"])
            .optional()
            .describe(
                "Cross-axis position in the parent: start/end pin to an edge, stretch fills. Default center",
            ),
        after: z.string().optional(),
    }),
    z.object({
        op: z.literal("add_grid"),
        id: z.string(),
        parent: z.string().optional(),
        label: z.string(),
        cols: z.number().describe("Number of columns"),
        gap: z.number().optional(),
        after: z.string().optional(),
    }),
    z.object({
        op: z.literal("add_pool"),
        id: z.string(),
        parent: z.string().optional(),
        label: z.string().describe("Pool title, e.g. the process name"),
        lanes: z
            .array(z.string())
            .describe(
                "Role names, one per lane, top to bottom. Steps go in these lanes via add_box lane/col",
            ),
        phases: z
            .array(z.string())
            .optional()
            .describe("Milestone labels spanning the columns; omit for none"),
        orientation: z
            .enum(["horizontal", "vertical"])
            .optional()
            .describe(
                "horizontal (default): lanes stack down, flow goes right",
            ),
        gap: z.number().optional(),
        after: z.string().optional(),
    }),
    z.object({
        op: z.literal("add_sequence"),
        id: z.string(),
        parent: z.string().optional(),
        label: z.string().describe("Diagram title; empty string for none"),
        gap: z
            .number()
            .optional()
            .describe("Horizontal spacing between participants"),
        step: z
            .number()
            .optional()
            .describe("Vertical spacing between messages"),
        after: z.string().optional(),
    }),
    z.object({
        op: z.literal("add_radial"),
        id: z.string(),
        parent: z.string().optional(),
        label: z.string().describe("Frame title; empty string for none"),
        spread: z
            .enum(["radial", "down"])
            .optional()
            .describe(
                "radial (default): branches on both sides, for a mind map. down: everything below the centre, for an org chart",
            ),
        gap: z.number().optional(),
        after: z.string().optional(),
    }),
    z.object({
        op: z.literal("remove"),
        id: z
            .string()
            .describe("Node to delete; its descendants and edges go too"),
    }),
    z.object({
        op: z.literal("move"),
        id: z.string(),
        parent: z
            .string()
            .optional()
            .describe("New container id; omit to move to top level"),
        after: z.string().optional(),
    }),
    z.object({
        op: z.literal("set_label"),
        id: z.string(),
        label: z.string(),
    }),
    z.object({
        op: z.literal("set_dir"),
        id: z.string().describe("Container to re-orient"),
        dir: z.enum(["row", "col"]),
    }),
    z.object({
        op: z.literal("set_gap"),
        id: z.string(),
        gap: z.number(),
    }),
    z.object({
        op: z.literal("link"),
        source: z.string(),
        target: z.string(),
        label: z.string().optional(),
        dashed: z
            .boolean()
            .optional()
            .describe("Dashed line — replication, sync, policy"),
        step: z
            .number()
            .optional()
            .describe("Step number, shown as an 'N. ' prefix"),
    }),
    z.object({
        op: z.literal("unlink"),
        source: z.string(),
        target: z.string(),
        step: z
            .number()
            .optional()
            .describe(
                "Remove only the edge with this step number; omit to remove every edge between the two",
            ),
    }),
    z.object({
        op: z.literal("set_title"),
        title: z.string(),
    }),
])

export type Operation = z.infer<typeof OperationSchema>

export interface ApplyResult {
    tree: DiagramTree
    /** One entry per operation that could not be applied, in order. */
    errors: string[]
}

/**
 * The pool cell an add operation declared, if any.
 *
 * `lane` alone is enough — a step in a lane with no column given goes to column 0 — so the
 * cell is recorded whenever either is present rather than requiring both.
 */
function cellOf(op: { lane?: number; col?: number }): {
    cell?: { lane: number; col: number }
} {
    if (op.lane == null && op.col == null) return {}
    return {
        cell: {
            lane: Math.max(0, Math.round(op.lane ?? 0)),
            col: Math.max(0, Math.round(op.col ?? 0)),
        },
    }
}

/** Are these two nodes participants of the same sequence diagram? */
function sameSequence(tree: DiagramTree, a: string, b: string): boolean {
    for (const n of walkTree(tree)) {
        if (n.kind !== "sequence") continue
        const ids = new Set(n.children.map((c) => c.id))
        if (ids.has(a) && ids.has(b)) return true
    }
    return false
}

/** Insert into a child list, after a named sibling or at the end. */
function insert(
    list: DiagramNode[],
    node: DiagramNode,
    after: string | undefined,
): void {
    if (after) {
        const i = list.findIndex((c) => c.id === after)
        if (i >= 0) {
            list.splice(i + 1, 0, node)
            return
        }
    }
    list.push(node)
}

/** Detach a node from wherever it currently sits. Returns it, or null if not found. */
function detach(tree: DiagramTree, id: string): DiagramNode | null {
    const rootIdx = tree.roots.findIndex((r) => r.id === id)
    if (rootIdx >= 0) return tree.roots.splice(rootIdx, 1)[0]
    const parent = findParent(tree, id)
    if (!parent) return null
    const i = parent.children.findIndex((c) => c.id === id)
    return i >= 0 ? parent.children.splice(i, 1)[0] : null
}

/** Would making `id` a descendant of `parentId` create a cycle? */
function wouldCycle(tree: DiagramTree, id: string, parentId: string): boolean {
    if (id === parentId) return true
    const node = findNode(tree, id)
    if (!node || !isContainer(node)) return false
    for (const d of walkTree({ ...tree, roots: [node] }))
        if (d.id === parentId) return true
    return false
}

/**
 * Resolve where a new or moved node goes. Returns the child list to insert into, or an
 * error string.
 */
function targetList(
    tree: DiagramTree,
    parentId: string | undefined,
): DiagramNode[] | string {
    if (!parentId) return tree.roots
    const p = findNode(tree, parentId)
    if (!p) return `No node with id "${parentId}"`
    if (!isContainer(p))
        return `"${parentId}" is a ${p.kind}, not a container — it cannot hold children`
    return p.children
}

/**
 * Apply operations to a tree, in order.
 *
 * The input tree is deep-copied first: a partially-applied batch must not leave the
 * caller's tree half-mutated when a later operation fails.
 */
export function applyOperations(
    input: DiagramTree,
    ops: Operation[],
): ApplyResult {
    const tree: DiagramTree = structuredClone(input)
    const errors: string[] = []

    const exists = (id: string) => findNode(tree, id) !== null

    for (const op of ops) {
        switch (op.op) {
            case "add_icon":
            case "add_box":
            case "add_container":
            case "add_grid":
            case "add_pool":
            case "add_sequence":
            case "add_radial": {
                if (exists(op.id)) {
                    errors.push(`${op.op}: id "${op.id}" is already taken`)
                    break
                }
                const list = targetList(tree, op.parent)
                if (typeof list === "string") {
                    errors.push(`${op.op}: ${list}`)
                    break
                }
                let node: DiagramNode
                if (op.op === "add_icon")
                    node = {
                        kind: "icon",
                        id: op.id,
                        name: op.name,
                        label: op.label ?? "",
                        ...cellOf(op),
                    }
                else if (op.op === "add_box")
                    node = {
                        kind: "box",
                        id: op.id,
                        label: op.label,
                        ...(op.shape && op.shape !== "box"
                            ? { shape: op.shape }
                            : {}),
                        ...(op.fill ? { fill: op.fill } : {}),
                        ...(op.stroke ? { stroke: op.stroke } : {}),
                        ...(op.role ? { role: op.role } : {}),
                        ...(op.group ? { group: op.group } : {}),
                        ...(op.grow && op.grow > 0 ? { grow: op.grow } : {}),
                        ...(op.align && op.align !== "center"
                            ? { align: op.align }
                            : {}),
                        ...cellOf(op),
                    }
                else if (op.op === "add_container")
                    node = {
                        kind: "group",
                        id: op.id,
                        gname: op.gname ?? null,
                        label: op.label,
                        dir: op.dir,
                        gap: op.gap ?? 20,
                        children: [],
                        ...(op.role ? { role: op.role } : {}),
                        ...(op.group ? { group: op.group } : {}),
                        ...(op.grow && op.grow > 0 ? { grow: op.grow } : {}),
                        ...(op.align && op.align !== "center"
                            ? { align: op.align }
                            : {}),
                        ...(op.pad != null ? { pad: Math.max(0, op.pad) } : {}),
                    }
                else if (op.op === "add_grid")
                    node = {
                        kind: "grid",
                        id: op.id,
                        gname: null,
                        label: op.label,
                        cols: Math.max(1, op.cols),
                        gap: op.gap ?? 14,
                        children: [],
                    }
                else if (op.op === "add_pool") {
                    if (op.lanes.length === 0) {
                        errors.push(
                            `add_pool: "${op.id}" needs at least one lane — a swimlane diagram with no roles has nothing to divide`,
                        )
                        break
                    }
                    node = {
                        kind: "pool",
                        id: op.id,
                        label: op.label,
                        lanes: op.lanes,
                        phases: op.phases ?? [],
                        orientation: op.orientation ?? "horizontal",
                        gap: op.gap ?? 40,
                        children: [],
                    }
                } else if (op.op === "add_sequence")
                    node = {
                        kind: "sequence",
                        id: op.id,
                        label: op.label,
                        gap: op.gap ?? 60,
                        step: Math.max(24, op.step ?? 44),
                        children: [],
                    }
                else
                    node = {
                        kind: "radial",
                        id: op.id,
                        label: op.label,
                        spread: op.spread ?? "radial",
                        gap: op.gap ?? 40,
                        children: [],
                    }
                insert(list, node, op.after)
                break
            }

            case "remove": {
                const node = findNode(tree, op.id)
                if (!node) {
                    errors.push(`remove: no node with id "${op.id}"`)
                    break
                }
                // Collect the subtree's ids first — edges touching any of them go too,
                // otherwise draw.io renders an arrow pointing at nothing.
                const doomed = new Set<string>()
                for (const d of walkTree({ ...tree, roots: [node] }))
                    doomed.add(d.id)
                detach(tree, op.id)
                tree.links = tree.links.filter(
                    (l) => !doomed.has(l.source) && !doomed.has(l.target),
                )
                break
            }

            case "move": {
                if (!exists(op.id)) {
                    errors.push(`move: no node with id "${op.id}"`)
                    break
                }
                if (op.parent && !exists(op.parent)) {
                    errors.push(`move: no node with id "${op.parent}"`)
                    break
                }
                if (op.parent && wouldCycle(tree, op.id, op.parent)) {
                    errors.push(
                        `move: cannot move "${op.id}" into "${op.parent}" — that is inside itself`,
                    )
                    break
                }
                const list = targetList(tree, op.parent)
                if (typeof list === "string") {
                    errors.push(`move: ${list}`)
                    break
                }
                const node = detach(tree, op.id)
                if (!node) {
                    errors.push(`move: could not detach "${op.id}"`)
                    break
                }
                insert(list, node, op.after)
                break
            }

            case "set_label": {
                const node = findNode(tree, op.id)
                if (!node) {
                    errors.push(`set_label: no node with id "${op.id}"`)
                    break
                }
                if (node.kind === "title") {
                    errors.push(
                        `set_label: use set_title to change the page title`,
                    )
                    break
                }
                node.label = op.label
                break
            }

            case "set_dir": {
                const node = findNode(tree, op.id)
                if (!node || !isContainer(node)) {
                    errors.push(`set_dir: "${op.id}" is not a container`)
                    break
                }
                if (node.kind !== "group") {
                    // A grid, pool, sequence or radial container arranges its children by its
                    // own rule; "row or column" is not a property they have.
                    errors.push(
                        node.kind === "grid"
                            ? `set_dir: "${op.id}" is a grid — change its column count instead`
                            : `set_dir: "${op.id}" is a ${node.kind}, which arranges its children by its own rule and has no row/column direction`,
                    )
                    break
                }
                node.dir = op.dir
                break
            }

            case "set_gap": {
                const node = findNode(tree, op.id)
                if (!node || !isContainer(node)) {
                    errors.push(`set_gap: "${op.id}" is not a container`)
                    break
                }
                ;(node as ContainerNode).gap = Math.max(0, op.gap)
                break
            }

            case "link": {
                if (!exists(op.source)) {
                    errors.push(`link: no node with id "${op.source}"`)
                    break
                }
                if (!exists(op.target)) {
                    errors.push(`link: no node with id "${op.target}"`)
                    break
                }
                // A second arrow between the same pair is normally a mistake — two identical
                // lines drawn on top of each other — EXCEPT between two participants of a
                // sequence diagram, where a back-and-forth conversation is the whole point.
                // There the messages are distinguished by their step, not by their endpoints.
                const conversation = sameSequence(tree, op.source, op.target)
                const dup =
                    !conversation &&
                    tree.links.some(
                        (l) => l.source === op.source && l.target === op.target,
                    )
                if (dup) {
                    errors.push(
                        `link: "${op.source}" → "${op.target}" already exists`,
                    )
                    break
                }
                const link: LinkSpec = { source: op.source, target: op.target }
                if (op.label) link.label = op.label
                if (op.dashed) link.dashed = true
                if (op.step != null) link.step = op.step
                tree.links.push(link)
                break
            }

            case "unlink": {
                const before = tree.links.length
                // With a step given, remove only that message: two participants of a sequence
                // diagram can exchange several, and dropping all of them would delete messages
                // the caller did not ask about.
                tree.links = tree.links.filter(
                    (l) =>
                        !(
                            l.source === op.source &&
                            l.target === op.target &&
                            (op.step == null || l.step === op.step)
                        ),
                )
                if (tree.links.length === before)
                    errors.push(
                        op.step == null
                            ? `unlink: no edge from "${op.source}" to "${op.target}"`
                            : `unlink: no edge from "${op.source}" to "${op.target}" with step ${op.step}`,
                    )
                break
            }

            case "set_title":
                tree.title = op.title
                break
        }
    }

    return { tree, errors }
}

/** Every icon/group name in a tree, for validating against the catalog. */
export function collectNames(
    tree: DiagramTree,
): { id: string; name: string; kind: "icon" | "group" }[] {
    const out: { id: string; name: string; kind: "icon" | "group" }[] = []
    for (const n of walkTree(tree)) {
        if (n.kind === "icon" && n.name)
            out.push({ id: n.id, name: n.name, kind: "icon" })
        else if ((n.kind === "group" || n.kind === "grid") && n.gname)
            out.push({ id: n.id, name: n.gname, kind: "group" })
    }
    return out
}

/** How a container arranges its children, in one short phrase for the outline. */
function containerMeta(n: ContainerNode): string {
    switch (n.kind) {
        case "grid":
            return `grid cols=${n.cols}`
        case "pool":
            return `pool lanes=[${n.lanes.join(" | ")}]${
                n.phases.length ? ` phases=[${n.phases.join(" | ")}]` : ""
            }${n.orientation === "vertical" ? " vertical" : ""}`
        case "sequence":
            return "sequence"
        case "radial":
            return `radial ${n.spread}`
        default:
            return n.dir
    }
}

/**
 * A compact text outline of the tree, for showing the model what is on the canvas.
 *
 * Sending the tree as JSON would cost several times more for the same information, and
 * the model does not need coordinates — it needs to know what exists and how it nests so
 * it can name ids in the next operation.
 */
export function outline(tree: DiagramTree): string {
    const lines: string[] = []
    if (tree.title) lines.push(`title: ${tree.title}`)
    const walk = (n: DiagramNode, depth: number) => {
        const pad = "  ".repeat(depth)
        // A node inside a pool reports its cell: that is how the model knows which lane a
        // step ended up in, which is exactly what it needs to move one.
        const at = (x: DiagramNode) =>
            (x.kind === "icon" || x.kind === "box") && x.cell
                ? ` @lane${x.cell.lane},col${x.cell.col}`
                : ""
        if (n.kind === "icon")
            lines.push(
                `${pad}${n.id}: icon ${n.name}${n.label ? ` "${n.label}"` : ""}${at(n)}`,
            )
        else if (n.kind === "box")
            lines.push(
                `${pad}${n.id}: box${n.shape ? ` ${n.shape}` : ""} "${n.label}"${at(n)}`,
            )
        else if (n.kind === "title") lines.push(`${pad}${n.id}: title`)
        else {
            lines.push(
                `${pad}${n.id}: ${containerMeta(n)}${n.label ? ` "${n.label}"` : " (wrapper)"}`,
            )
            for (const c of n.children) walk(c, depth + 1)
        }
    }
    for (const r of tree.roots) walk(r, 0)
    for (const l of tree.links) {
        const bits = [l.label, l.dashed ? "dashed" : null]
            .filter(Boolean)
            .join(", ")
        lines.push(`link ${l.source} -> ${l.target}${bits ? ` (${bits})` : ""}`)
    }
    if (tree.foreign.length)
        lines.push(
            `${tree.foreign.length} cell(s) kept as-is: ${tree.foreign.map((f) => f.id).join(", ")}`,
        )
    return lines.join("\n")
}
