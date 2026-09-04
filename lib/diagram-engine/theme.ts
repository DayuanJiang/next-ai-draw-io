/**
 * The theme: design tokens plus one composition rule, in place of style tables.
 *
 * The engine's original deal was: the model declares structure, the engine computes
 * geometry. But every box rendered identically — white, 11px, black border — so anything
 * whose meaning lives in visual hierarchy (a paper-summary poster, a cheat sheet, a
 * comparison panel) came out flat, and the only escape was hand-written XML with no layout
 * guarantees at all.
 *
 * Two ideas fix that generally, not per diagram type:
 *
 *   ROLE — what a node IS in the information hierarchy: a masthead, a section heading, a
 *   key number, fine print. The model judges this well. Each role maps to a type size and
 *   an emphasis (filled / outlined / ghost), not to any colour.
 *
 *   GROUP — which semantic zone a node belongs to: remote vs local, one poster section vs
 *   another. Each distinct group name gets one HUE RAMP — a light tint, a mid stroke, a
 *   dark text colour — assigned in order of first appearance.
 *
 * `themedStyle(role, hue, kind)` composes the two by rule. A heading container in group 2
 * gets that hue's tint as its panel and the dark step for its title; a metric in the same
 * group gets the mid step as a heavy border. Nothing is enumerated per combination, so a
 * new diagram kind gets full theming by tagging its nodes — there is no table to extend.
 * The model never sees a hex value; the same declaration always renders the same way.
 */

/** What a node is, in the information hierarchy of the diagram. */
export type Role =
    | "banner" //   the masthead: large type on the theme's one dark field
    | "heading" //  a section title / titled panel
    | "body" //     ordinary content (the default look)
    | "callout" //  something the reader must not miss
    | "good" //     a positive verdict (always green, group or not)
    | "bad" //      a negative verdict or warning (always red)
    | "metric" //   the key number
    | "muted" //    fine print

export const ROLES: readonly Role[] = [
    "banner",
    "heading",
    "body",
    "callout",
    "good",
    "bad",
    "metric",
    "muted",
]

export function isRole(v: string | null | undefined): v is Role {
    return ROLES.includes(v as Role)
}

// ---- tokens ----

/** One hue, three steps: a field to sit on, a line to draw with, a colour to write in. */
export interface HueRamp {
    tint: string
    base: string
    dark: string
}

/**
 * The hue ramps groups draw from, in assignment order.
 *
 * Tint/base pairs are draw.io's classic palette, so themed output looks native to the
 * editor; the dark step is the same hue pulled down far enough for 4.5:1 text on white.
 */
export const HUES: readonly HueRamp[] = [
    { tint: "#DAE8FC", base: "#6C8EBF", dark: "#1A237E" }, // blue
    { tint: "#D5E8D4", base: "#82B366", dark: "#1B5E20" }, // green
    { tint: "#FFE6CC", base: "#D79B00", dark: "#8A5A00" }, // orange
    { tint: "#E1D5E7", base: "#9673A6", dark: "#4A2E5E" }, // purple
    { tint: "#F8CECC", base: "#B85450", dark: "#7F1D1D" }, // red
    { tint: "#FFF2CC", base: "#D6B656", dark: "#7A5C00" }, // yellow
]

/** The neutral ramp, for ungrouped nodes: today's grey-on-white look. */
export const NEUTRAL: HueRamp = {
    tint: "#F5F8FB",
    base: "#5A6B7B",
    dark: "#1A1A1A",
}

/** Semantic verdict hues: good is green and bad is red no matter what group says. */
const GOOD: HueRamp = { tint: "#D5E8D4", base: "#82B366", dark: "#1B5E20" }
const BAD: HueRamp = { tint: "#F8CECC", base: "#B85450", dark: "#7F1D1D" }
/** The callout field: a warm highlight distinct from every group tint. */
const CALLOUT: HueRamp = { tint: "#FFF9C4", base: "#B8860B", dark: "#6D4C00" }

/** Type scale, px. One scale for every diagram kind. */
export const TYPE = { xs: 9, sm: 11, md: 13, lg: 15, xl: 20 } as const

/** The hue ramp for the n-th distinct group. Wraps: a 7th group reuses the 1st hue. */
export function hueOf(index: number): HueRamp {
    return HUES[index % HUES.length]
}

// ---- the composition rule ----

/** How a role renders, independent of colour. */
interface RoleSpec {
    size: number
    bold: boolean
    /** filled: dark field, light text. tinted: hue field. outlined: white field, hue border.
     *  ghost: no field, no border — pure text. */
    emphasis: "filled" | "tinted" | "outlined" | "ghost"
    /** Overrides the group hue; verdicts stay green/red whatever zone they sit in. */
    hue?: HueRamp
    /** Fill the container's cross axis, the way a masthead spans its page. */
    stretch?: boolean
    /** Minimum cell height. */
    minH: number
    /** Character width relative to 11px type, for the measure pass. */
    charScale: number
}

/** The masthead field when no group says otherwise: the deep navy of the first hue. */
const BANNER: HueRamp = { tint: "#DAE8FC", base: "#6C8EBF", dark: "#1A237E" }

const ROLE_SPECS: Record<Role, RoleSpec> = {
    banner: {
        size: TYPE.xl,
        bold: true,
        emphasis: "filled",
        hue: BANNER,
        stretch: true,
        minH: 64,
        charScale: 1.8,
    },
    heading: {
        size: TYPE.lg,
        bold: true,
        emphasis: "ghost",
        stretch: true,
        minH: 32,
        charScale: 1.35,
    },
    body: {
        size: TYPE.sm,
        bold: false,
        emphasis: "outlined",
        minH: 44,
        charScale: 1,
    },
    callout: {
        size: TYPE.sm,
        bold: true,
        emphasis: "tinted",
        hue: CALLOUT,
        minH: 44,
        charScale: 1,
    },
    good: {
        size: TYPE.sm,
        bold: false,
        emphasis: "tinted",
        hue: GOOD,
        minH: 44,
        charScale: 1,
    },
    bad: {
        size: TYPE.sm,
        bold: false,
        emphasis: "tinted",
        hue: BAD,
        minH: 44,
        charScale: 1,
    },
    metric: {
        size: TYPE.xl,
        bold: true,
        emphasis: "outlined",
        minH: 56,
        charScale: 1.8,
    },
    muted: {
        size: TYPE.xs,
        bold: false,
        emphasis: "ghost",
        minH: 24,
        charScale: 0.82,
    },
}

/**
 * Does this role already draw itself with no border?
 *
 * The parser needs this to tell a THEME's `strokeColor=none` from a DECLARED one. A banner is
 * a dark filled slab and a heading is ghost text; both are borderless because of what they
 * are, not because anyone asked. Recording that as an explicit override would make it
 * outlive a later role change, since `set_role` clears a node's style but keeps its text
 * overrides.
 *
 * Leaf only: the container branch of `themedStyle` always draws a border, whatever the role.
 */
export function roleIsBorderless(
    role: Role | undefined,
    kind: "leaf" | "container",
): boolean {
    if (kind === "container") return false
    const e = ROLE_SPECS[role ?? "body"].emphasis
    return e === "filled" || e === "ghost"
}

/** Metrics the measure pass needs, so layout reserves what render will draw. */
export function roleMetrics(role: Role | undefined): {
    fontSize: number
    minH: number
    charScale: number
    stretch: boolean
} {
    const s = ROLE_SPECS[role ?? "body"]
    return {
        fontSize: s.size,
        minH: s.minH,
        charScale: s.charScale,
        stretch: s.stretch === true,
    }
}

/**
 * The style tokens for one node: the whole theme in a single rule.
 *
 * `hue` is the node's group ramp (or the neutral ramp); a role with a semantic hue
 * (good/bad/callout) overrides it. `kind` softens the treatment for containers — a
 * section panel is a field its children sit on, so it takes the tint at panel weight
 * rather than a leaf's full treatment.
 */
export function themedStyle(
    role: Role,
    hue: HueRamp,
    kind: "leaf" | "container",
): string {
    const spec = ROLE_SPECS[role]
    const ramp = spec.hue ?? hue
    const size = kind === "container" && role === "banner" ? TYPE.lg : spec.size
    const font = `fontSize=${size};${spec.bold || kind === "container" ? "fontStyle=1;" : ""}`

    if (spec.emphasis === "filled")
        return `fillColor=${ramp.dark};strokeColor=none;fontColor=#FFFFFF;${font}rounded=1;arcSize=6;`

    if (kind === "container") {
        // A panel: the tint as a quiet field, the dark step for its title, the base for
        // its border. This is where "every section gets its own colour" comes from —
        // a heading container plus a group, no extra mechanism.
        return `fillColor=${ramp.tint};strokeColor=${ramp.base};fontColor=${ramp.dark};${font}verticalAlign=top;align=left;spacingLeft=10;spacingTop=6;`
    }

    if (spec.emphasis === "ghost")
        return `fillColor=none;strokeColor=none;fontColor=${ramp.dark};${font}align=left;`

    if (spec.emphasis === "tinted") {
        // A callout keeps a heavy left bar, the editor's convention for "note well".
        const bar = role === "callout" ? `strokeWidth=2;` : ""
        return `fillColor=${ramp.tint};strokeColor=${ramp.base};fontColor=${ramp.dark};${bar}${font}`
    }

    // outlined: the hue carried by the border and text. A grouped ordinary node takes its
    // zone's tint as the field — colour-as-grouping is the whole point of naming a zone —
    // while an ungrouped one stays white. A metric stays white either way, so its number
    // sits on the page's calmest field with the hue in a heavy border.
    const weight = role === "metric" ? "strokeWidth=2;" : ""
    const field = role === "body" && ramp !== NEUTRAL ? ramp.tint : "#FFFFFF"
    return `fillColor=${field};strokeColor=${ramp.base};fontColor=${ramp.dark};${weight}${font}`
}
