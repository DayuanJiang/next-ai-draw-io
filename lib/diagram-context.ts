/**
 * Which diagram goes to the model with a user message.
 *
 * The model's own tool calls in the history describe the diagram it made,
 * so a message carries the canvas only when that description is not
 * enough any more:
 * - the canvas differs from the last state the model knows (the user
 *   edited it, undid a change, restored a version, opened a file or
 *   switched page);
 * - the program changed what the model wrote (auto-fixes, a drawing
 *   finished with append_diagram), or the page was reloaded and the
 *   app no longer knows what the model's last change looked like;
 * - the model stacked more than MAX_EDITS_WITHOUT_DIAGRAM edits on its last
 *   full picture of the diagram.
 *
 * The canvas sent is kept in the message's metadata, so every later request
 * puts it back in the same place: the history stays the same from request
 * to request, which is what the providers' prompt caches need. Its pictures
 * are kept as the short references the model sees (embedded-images.ts).
 */

import { hideImageData } from "@/packages/mcp-server/src/embedded-images.ts"

/** The canvas right after a change of the model was put on it */
export interface AiCanvasState {
    pageId: string | null
    fingerprint: string | null
    /** False when the canvas is not exactly what the model wrote */
    exact: boolean
    /**
     * An edit's starting canvas: when it differs from the model's picture
     * before the edit, the user changed the canvas while the model worked
     */
    base?: string | null
}

/** What a user message tells the model about the canvas */
export type MessageDiagram =
    | { xml: string; pageId: string | null }
    | { unchanged: true }

export const MAX_EDITS_WITHOUT_DIAGRAM = 4

const AI_CHANGE_TOOLS = new Set([
    "tool-display_diagram",
    "tool-edit_diagram",
    "tool-append_diagram",
])

// Attributes draw.io leaves out when they hold their default
const GEOMETRY_DEFAULTS: Record<string, string> = {
    x: "0",
    y: "0",
    width: "0",
    height: "0",
}

function canonical(el: Element): string {
    const attrs = new Map<string, string>()
    for (const a of Array.from(el.attributes)) attrs.set(a.name, a.value)
    if (el.tagName === "mxGeometry" || el.tagName === "mxPoint") {
        for (const [k, v] of Object.entries(GEOMETRY_DEFAULTS)) {
            if (el.tagName === "mxPoint" && (k === "width" || k === "height"))
                continue
            if (!attrs.has(k)) attrs.set(k, v)
        }
    }
    if (el.tagName === "mxGeometry" || el.tagName === "mxPoint") {
        for (const k of ["x", "y", "width", "height"]) {
            const v = attrs.get(k)
            if (v !== undefined && v.trim() !== "" && !Number.isNaN(Number(v)))
                attrs.set(k, String(Number(v)))
        }
    }
    if (el.tagName === "mxCell") {
        // An empty label or style is the same as none
        for (const k of ["value", "style"]) {
            if (attrs.get(k) === "") attrs.delete(k)
        }
    }
    const text = [...attrs.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ")
    const children = Array.from(el.children).map(canonical).join("")
    return `<${el.tagName} ${text}>${children}</${el.tagName}>`
}

// A root child's parent: on the cell, or on the cell an <object> wraps (the
// wrapper's own attributes are the user's data, which may be named "parent")
const parentOf = (el: Element) =>
    (el.tagName === "mxCell"
        ? el.getAttribute("parent")
        : el.getElementsByTagName("mxCell")[0]?.getAttribute("parent")) ?? null

/**
 * The cells in the order draw.io keeps them: each parent followed by its
 * children, in their order among each other (which shape is in front).
 * draw.io writes a file that way, whatever order the XML came in.
 */
function treeOrder(cells: Element[]): Element[] {
    const ids = new Set(cells.map((c) => c.getAttribute("id")))
    const children = new Map<string | null, Element[]>()
    for (const cell of cells) {
        const parent = parentOf(cell)
        const key = parent !== null && ids.has(parent) ? parent : null
        children.set(key, [...(children.get(key) ?? []), cell])
    }
    const out: Element[] = []
    const seen = new Set<Element>()
    const visit = (cell: Element) => {
        if (seen.has(cell)) return
        seen.add(cell)
        out.push(cell)
        for (const child of children.get(cell.getAttribute("id")) ?? []) {
            visit(child)
        }
    }
    for (const cell of children.get(null) ?? []) visit(cell)
    // Cells in a cycle of parents, as they came
    for (const cell of cells) visit(cell)
    return out
}

/**
 * The cells of one page in the order draw.io keeps them, and the page
 * background, written so that two exports of the same diagram compare
 * equal however they are formatted. Null when the XML has no model to read.
 */
export function diagramFingerprint(modelXml: string): string | null {
    if (!modelXml?.trim()) return null
    // A picture counts by its reference, as in the copy kept in a message
    const doc = new DOMParser().parseFromString(
        hideImageData(modelXml),
        "text/xml",
    )
    if (doc.querySelector("parsererror")) return null
    const root = doc.getElementsByTagName("root")[0]
    if (!root) return null
    const model = doc.getElementsByTagName("mxGraphModel")[0]
    const page = ["background", "backgroundImage"]
        .map(
            (name) =>
                `${name}=${JSON.stringify(model?.getAttribute(name) ?? "")}`,
        )
        .join(" ")
    return [page, ...treeOrder(Array.from(root.children)).map(canonical)].join(
        "\n",
    )
}

interface MessageLike {
    role: string
    parts?: { type: string; toolCallId?: string; state?: string }[]
    metadata?: unknown
}

/** The diagram a user message was sent with, from its metadata */
export function diagramOf(message: MessageLike): MessageDiagram | undefined {
    const diagram = (message.metadata as { diagram?: unknown } | undefined)
        ?.diagram as
        | Partial<{ xml: unknown; pageId: unknown; unchanged: unknown }>
        | undefined
    if (!diagram || typeof diagram !== "object") return undefined
    if (typeof diagram.xml === "string") {
        return {
            xml: diagram.xml,
            pageId: typeof diagram.pageId === "string" ? diagram.pageId : null,
        }
    }
    if (diagram.unchanged === true) return { unchanged: true }
    return undefined
}

/**
 * What the next user message tells the model about the canvas.
 *
 * @param history the messages before the new one
 * @param pageXml the page the model works on, as it is now
 * @param pageId that page's id (null: the first page)
 * @param states the canvas after each of the model's changes, by tool call
 */
export function diagramForMessage({
    history,
    pageXml,
    pageId,
    states,
}: {
    history: MessageLike[]
    pageXml: string
    pageId: string | null
    states: ReadonlyMap<string, AiCanvasState>
}): MessageDiagram {
    // The copy kept in the message has the pictures as references: the
    // chat stays small, and the model sees them that way anyway
    const send: MessageDiagram = { xml: hideImageData(pageXml), pageId }

    // The latest state the model knows, and how many edits it made since
    // its last full picture (a drawing, or a canvas sent with a message).
    // Each change back to that picture must be one the model knows exactly.
    let reference:
        | { kind: "ai"; state: AiCanvasState }
        | { kind: "sent"; xml: string; pageId: string | null }
        | undefined
    let edits = 0
    let fullPicture = false
    // The canvas the newer edit started from: the older state must be it
    let startedFrom: string | null | undefined
    const followsOn = (fingerprint: string | null) =>
        startedFrom === undefined || startedFrom === fingerprint
    for (let i = history.length - 1; i >= 0 && !fullPicture; i--) {
        const message = history[i]
        if (message.role === "user") {
            const diagram = diagramOf(message)
            if (diagram && "xml" in diagram) {
                if (!followsOn(diagramFingerprint(diagram.xml))) return send
                reference ??= { kind: "sent", ...diagram }
                fullPicture = true
            }
            continue
        }
        if (message.role !== "assistant") continue
        const parts = message.parts ?? []
        for (let j = parts.length - 1; j >= 0; j--) {
            const part = parts[j]
            if (!AI_CHANGE_TOOLS.has(part.type) || !part.toolCallId) continue
            const state = states.get(part.toolCallId)
            if (!state) {
                // A change this app did not see being made (the page was
                // reloaded): what it left on the canvas is unknown
                if (part.state === "output-available") return send
                // A call that failed changed nothing
                continue
            }
            // On the canvas, but the model got an error for it (a failed
            // screenshot check) or no result (stopped): it may think the
            // call changed nothing
            if (part.state !== "output-available") return send
            // The program changed what the model wrote, or the user changed
            // the canvas while the model worked
            if (!state.exact || !followsOn(state.fingerprint)) return send
            reference ??= { kind: "ai", state }
            if (part.type === "tool-edit_diagram") {
                edits++
                startedFrom = state.base
            } else {
                fullPicture = true
                break
            }
        }
    }

    if (!reference || !fullPicture) return send
    if (edits > MAX_EDITS_WITHOUT_DIAGRAM) return send
    const now = diagramFingerprint(pageXml)
    if (now === null) return send
    if (reference.kind === "ai") {
        const { state } = reference
        if ((state.pageId ?? null) !== (pageId ?? null)) return send
        return state.fingerprint === now ? { unchanged: true } : send
    }
    if ((reference.pageId ?? null) !== (pageId ?? null)) return send
    return diagramFingerprint(reference.xml) === now
        ? { unchanged: true }
        : send
}
