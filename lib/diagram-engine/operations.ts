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
        after: z.string().optional(),
    }),
    z.object({
        op: z.literal("add_container"),
        id: z.string(),
        parent: z.string().optional(),
        label: z
            .string()
            .describe("Frame title; empty string means invisible wrapper"),
        dir: z.enum(["row", "col"]).describe("How children stack"),
        gname: z
            .string()
            .optional()
            .describe(
                "Group stencil name, e.g. 'group_vpc'; omit for a plain frame",
            ),
        gap: z.number().optional(),
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
            case "add_grid": {
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
                    }
                else if (op.op === "add_box")
                    node = { kind: "box", id: op.id, label: op.label }
                else if (op.op === "add_container")
                    node = {
                        kind: "group",
                        id: op.id,
                        gname: op.gname ?? null,
                        label: op.label,
                        dir: op.dir,
                        gap: op.gap ?? 20,
                        children: [],
                    }
                else
                    node = {
                        kind: "grid",
                        id: op.id,
                        gname: null,
                        label: op.label,
                        cols: Math.max(1, op.cols),
                        gap: op.gap ?? 14,
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
                if (node.kind === "grid") {
                    errors.push(
                        `set_dir: "${op.id}" is a grid — change its column count instead`,
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
                const dup = tree.links.some(
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
                tree.links = tree.links.filter(
                    (l) => !(l.source === op.source && l.target === op.target),
                )
                if (tree.links.length === before)
                    errors.push(
                        `unlink: no edge from "${op.source}" to "${op.target}"`,
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
        else if (isContainer(n) && n.gname)
            out.push({ id: n.id, name: n.gname, kind: "group" })
    }
    return out
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
        if (n.kind === "icon")
            lines.push(
                `${pad}${n.id}: icon ${n.name}${n.label ? ` "${n.label}"` : ""}`,
            )
        else if (n.kind === "box") lines.push(`${pad}${n.id}: box "${n.label}"`)
        else if (n.kind === "title") lines.push(`${pad}${n.id}: title`)
        else {
            const meta = n.kind === "grid" ? `grid cols=${n.cols}` : n.dir
            lines.push(
                `${pad}${n.id}: ${meta}${n.label ? ` "${n.label}"` : " (wrapper)"}`,
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
