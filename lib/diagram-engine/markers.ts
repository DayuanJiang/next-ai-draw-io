/**
 * Style markers — how layout structure survives a round-trip through draw.io.
 *
 * The layout engine's tree carries information plain draw.io XML does not: which
 * direction a container stacks its children, the gap between them, and whether the
 * user has pinned a node's position. We encode that as extra `key=value` tokens in
 * the cell's style string.
 *
 * Two behaviours this relies on, both verified in a real browser (Playwright drag
 * against the embedded editor, reading the editor's own autosave payload):
 *
 *   1. draw.io PRESERVES style keys it does not understand. After a user drags a
 *      shape and the editor saves, `dai_kind=group;dai_dir=col;dai_gap=22;` came
 *      back byte-identical.
 *   2. On a DUPLICATE key, the LAST value wins. A style ending in
 *      `container=0;pointerEvents=0;container=1;` behaved as a container: a shape
 *      dragged into it was reparented. So we can append a normalising token without
 *      first parsing out the old one.
 *
 * (2) matters because the AWS catalog is inconsistent: group_region, group_vpc,
 * group_subnet, group_availability_zone, group_aws_cloud and group_on_premise ship
 * WITHOUT container=1, while group_account, group_aws_cloud_alt, group_vpc2,
 * group_security_group and group_corporate_data_center ship WITH it. Appending
 * unconditionally normalises all of them.
 */

/** Marker keys. Namespaced with `dai_` so they cannot collide with mxGraph keys. */
export const MARKER = {
    /** Node kind, so the parser does not have to re-guess it from the shape. */
    kind: "dai_kind",
    /** Child stacking direction of a container: "row" | "col" | "grid". */
    dir: "dai_dir",
    /** Gap between children, in px. */
    gap: "dai_gap",
    /** Column count, for grid containers. */
    cols: "dai_cols",
    /** Set by the user to freeze a node's position across re-layouts. */
    pin: "dai_pin",
    /**
     * A catalog icon's name. Needed because an Azure or GCP icon's style is an embedded
     * base64 image with no name anywhere in it, so the style alone cannot identify it.
     */
    name: "dai_name",
} as const

export type NodeKind = "group" | "grid" | "icon" | "box" | "title"
export type Direction = "row" | "col" | "grid"

/**
 * Tokens that make a shape behave as a container in draw.io: it accepts a shape
 * dragged into it and reparents that shape (setting `parent` and switching the
 * child's geometry to parent-relative).
 *
 * `pointerEvents=0` keeps clicks falling through to the children — without it the
 * frame swallows them and the user cannot select what is inside. `collapsible=0`
 * hides the fold arrow. `recursiveResize=0` stops children from being scaled when
 * the frame is resized, which would fight the layout engine.
 */
const CONTAINER_TOKENS =
    "container=1;pointerEvents=0;collapsible=0;recursiveResize=0;"

/**
 * A container that groups children for layout but should not be visible.
 *
 * The reference project solves this with a "phantom": a wrapper that participates in
 * layout and then emits NO cell, reparenting its children onto the nearest visible
 * ancestor. That makes the round-trip lossy by construction — the wrapper's direction
 * and grouping are simply absent from the XML, so re-deriving the tree cannot recover
 * them. Measured on the reference project's own build_vpc.mjs: a phantom erased a
 * container's "col" direction, leaving children in a 2-D arrangement that can only be
 * read back as a grid.
 *
 * So we emit a real cell and make it invisible instead. One extra cell per wrapper,
 * in exchange for structure that survives being read back.
 */
const INVISIBLE_TOKENS = "fillColor=none;strokeColor=none;"

/** Read a marker's raw value out of a style string. Last occurrence wins, as draw.io does. */
export function readMarker(style: string, key: string): string | null {
    // Scan all matches and keep the last, mirroring draw.io's duplicate-key resolution.
    const re = new RegExp(`(?:^|;)${key}=([^;]*)`, "g")
    let last: string | null = null
    let m = re.exec(style)
    while (m !== null) {
        last = m[1]
        m = re.exec(style)
    }
    return last
}

export function readKind(style: string): NodeKind | null {
    const v = readMarker(style, MARKER.kind)
    if (
        v === "group" ||
        v === "grid" ||
        v === "icon" ||
        v === "box" ||
        v === "title"
    )
        return v
    return null
}

export function readDir(style: string): Direction | null {
    const v = readMarker(style, MARKER.dir)
    if (v === "row" || v === "col" || v === "grid") return v
    return null
}

/** Read a positive integer marker (gap, cols). Returns null when absent or malformed. */
export function readIntMarker(style: string, key: string): number | null {
    const v = readMarker(style, key)
    if (v === null) return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/**
 * Has the user pinned this node? Any value other than "0"/""/"false" counts as
 * pinned, so a user typing `dai_pin=1` (or just `dai_pin=yes`) in draw.io's
 * "Edit Style" dialog gets what they expect.
 */
export function isPinned(style: string): boolean {
    const v = readMarker(style, MARKER.pin)
    if (v === null) return false
    const s = v.trim().toLowerCase()
    return s !== "" && s !== "0" && s !== "false"
}

/** Append `key=value;`, ensuring the style ends with a separator first. */
function append(style: string, key: string, value: string | number): string {
    const base = style.endsWith(";") || style === "" ? style : `${style};`
    return `${base}${key}=${value};`
}

/**
 * Stamp a container's style: make it a real draw.io container and record its
 * layout parameters.
 *
 * Appends rather than rewrites. Duplicate keys are legal and the last one wins, so
 * a catalog style that already says `container=1` is unharmed, and one that says
 * nothing (or `container=0`) is corrected.
 */
export function stampContainer(
    style: string,
    opts: {
        kind: "group" | "grid"
        dir: Direction
        gap: number
        cols?: number
        /** Layout-only wrapper: emit a real cell, but draw nothing. */
        invisible?: boolean
    },
): string {
    let s = style.endsWith(";") || style === "" ? style : `${style};`
    s += CONTAINER_TOKENS
    if (opts.invisible) s += INVISIBLE_TOKENS
    s = append(s, MARKER.kind, opts.kind)
    s = append(s, MARKER.dir, opts.dir)
    s = append(s, MARKER.gap, Math.round(opts.gap))
    if (opts.kind === "grid" && opts.cols != null)
        s = append(s, MARKER.cols, Math.max(1, Math.round(opts.cols)))
    return s
}

/**
 * Is this an invisible layout wrapper? Both colours set to `none` and no group
 * stencil — a visible frame always has a stroke or a stencil.
 */
export function isInvisible(style: string): boolean {
    if (/grIcon=/.test(style)) return false
    const fill = readMarker(style, "fillColor")
    const stroke = readMarker(style, "strokeColor")
    return fill === "none" && stroke === "none"
}

/**
 * Stamp a leaf with its kind, so the parser need not infer it.
 *
 * For an icon, also record the catalog name: an Azure or GCP icon's style is an embedded
 * base64 image with no name in it, so the style alone cannot identify which icon it is.
 */
export function stampLeaf(
    style: string,
    kind: "icon" | "box" | "title",
    opts: { name?: string } = {},
): string {
    const s = append(style, MARKER.kind, kind)
    return opts.name ? append(s, MARKER.name, opts.name) : s
}

/** Strip every `dai_*` marker — for exporting a clean file, or comparing styles. */
export function stripMarkers(style: string): string {
    return style
        .split(";")
        .filter((tok) => tok !== "" && !tok.startsWith("dai_"))
        .join(";")
        .concat(";")
        .replace(/^;$/, "")
}

/** Does this style carry any engine marker? Used to tell engine output from imported files. */
export function hasMarkers(style: string): boolean {
    return /(?:^|;)dai_[a-z]+=/.test(style)
}
