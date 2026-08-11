/**
 * Tailwind utility classes → the engine's layout fields.
 *
 * WHY a second way to say the same thing. The engine's own vocabulary (`dir`, `grow`,
 * `align`, `justify`, `pad`, `gap`, `maxW`) is words we invented, so a model has seen them
 * only in our tool description. It has seen `flex-col grow-3 items-stretch p-4` millions of
 * times. Microsoft's DSL study (arXiv 2407.02742) found models hallucinate custom function
 * names at a much higher rate than familiar ones, and arXiv 2311.09519 measured a large
 * improvement from swapping a rare DSL for a popular language, precisely because it puts the
 * output back in the distribution the model was trained on.
 *
 * The other half of why Tailwind and not free-form CSS: its values are a FIXED SCALE, not
 * arbitrary numbers. `p-4` is 16px because one spacing unit is 4px, and there is no `p-7.5`.
 * Tailwind's own docs make that the point of the thing — with inline styles "every value is a
 * magic number", with utilities you pick from a system. That is the property we want, because
 * an unconstrained number field is exactly where a model invents 13px here and 27px there.
 *
 * The supported set was picked by reading Tailwind's property index against the draw.io
 * renderer's ACTUAL SOURCE — public/drawio/mxgraph/src and public/drawio/js/grapheditor,
 * vendored in this repo — rather than against a prose style reference. That matters: three
 * properties were excluded on wrong grounds when the reference was a document, and reading
 * the code put them back (radius, strikethrough, shadow, all noted below).
 *
 * WHAT IS DELIBERATELY NOT HERE, and why:
 *
 *   - COLOUR of any kind (`bg-*`, `text-red-500`, `border-blue-400`). draw.io has
 *     `fillColor`/`fontColor`/`strokeColor`, so this is possible — but colour is derived from
 *     `role` and `group` precisely so one palette stays coherent, and a colour class would be
 *     a back door into the hex-picking that was removed. Gradients (`bg-linear-to-b from-X
 *     to-Y`) are excluded for the same reason, even though `gradientColor` with a four-way
 *     `gradientDirection` maps onto them exactly (mxShape.js:1392-1393, 1054-1060).
 *
 *   - Per-SIDE borders (`border-t`, `border-l-4`, `border-x`). draw.io draws these properly:
 *     `shape=partialRectangle` reads independent `top`/`right`/`bottom`/`left` booleans
 *     (Shapes.js:3914-3917) and still fills the background first (3919-3920), so a single
 *     heavy left edge would render correctly. The cost is the SHAPE SLOT: `partialRectangle`
 *     is itself a shape name, so a node could not be both a diamond and left-edge-only. What
 *     a node IS — a database, a decision, a person — outranks how its border looks, so the
 *     shape vocabulary keeps the slot.
 *
 *   - Per-SIDE padding (`pt-8`, `px-4`). draw.io's `spacingTop`/`spacingRight`/
 *     `spacingBottom`/`spacingLeft` (mxText.js:422-425) look like an exact match and are not:
 *     they pad the LABEL inside its own cell, while this engine's `pad` is the room a
 *     container leaves for its CHILDREN. Accepting `pt-8` would suggest it pushes child nodes
 *     down, which it cannot.
 *
 *   - `outline-*` (width, colour, style, offset). draw.io has no concept: a shape carries one
 *     border, and nothing draws a second ring outside it. In CSS an outline is a focus ring,
 *     which a static diagram does not have.
 *
 *   - `opacity-*`. draw.io's `opacity` is 0–100 and would map cleanly, but Tailwind's
 *     `opacity-<number>` takes ANY number — `opacity-37` is valid — so it is not a scale.
 *     Admitting it would give up the one property that makes this vocabulary worth having.
 *
 *   - `truncate` / `text-ellipsis`. Sets `text-overflow: ellipsis`. draw.io's `overflow`
 *     branches on exactly five values — visible, hidden, fill, width, block (mxText.js:
 *     1080-1095) — and a repo-wide grep for "ellipsis" finds no implementation, so the text
 *     would be cut with no "…": a class named `truncate` that silently loses characters.
 *
 *   - Seven of the nine `font-*` weights. See UNSUPPORTED_WEIGHTS below.
 *
 *   - `text-shadow-*`. Unlike the box `shadow-*` family, draw.io's `textShadow`
 *     (mxText.js:668) is a bare on/off flag with no offset or blur, so Tailwind's six sizes
 *     would collapse into one picture.
 *
 *   - Per-CORNER radius (`rounded-tl-lg`) and the decorative corner treatments beside it
 *     (snip, fold, inverse round). draw.io does have these, but only on a separate template
 *     shape, `mxgraph.basic.rect` (Shapes.js:4118), which would take the place of the node's
 *     own `shape` — the same trade the per-side borders lose. Whole-shape `rounded-*` IS
 *     supported and costs no slot; see RADIUS.
 *
 *   - `tracking-*` (letter-spacing), `uppercase`/`lowercase`/`capitalize` (text-transform),
 *     and per-node `leading-*` (line-height). Not merely coarse — absent. Grepping the whole
 *     vendored renderer for letterSpacing/textTransform finds nothing, and line height is a
 *     global constant (`mxConstants.LINE_HEIGHT`) with no per-cell style key.
 *
 *   - `rotate-*`, `scale-*`, `skew-*`, `translate-*`. draw.io has `rotation`/`flipH`/`flipV`,
 *     but a rotated box breaks the two things this engine guarantees: the layout no longer
 *     knows what area it covers, and the edge router cannot route around it.
 *
 *   - Document-flow properties (`float`, `clear`, `position`, `top/right/bottom/left`,
 *     `z-index`, `visibility`, `columns`, `break-*`, `object-*`, `overscroll-*`) and the
 *     table and list families. There is no document flow here — every coordinate is computed
 *     — and draw.io has no z-index at all: later cells simply paint on top.
 *
 *   - `filter`/`backdrop-filter`, `mask-*`, `mix-blend-mode`, `transition-*`, `animation`,
 *     `perspective*`, `cursor`, `resize`, `appearance`, `caret-color`, `accent-color`:
 *     no corresponding key anywhere in the vendored renderer.
 *
 *   - Arbitrary values (`w-[137px]`, `p-[13px]`). The scale is the feature; a bracket escape
 *     hatch removes it.
 *
 * Unknown classes are returned in `ignored` rather than rejected — D2's "warnings over
 * errors" rule: a diagram that renders with one class dropped beats an error that renders
 * nothing. The caller reports them, which is how a typo becomes a one-turn fix instead of a
 * silent no-op.
 */

import type { Align, Justify } from "./types"

/** What a class string resolves to. Every field optional: a class string sets only what it names. */
export interface TwLayout {
    dir?: "row" | "col"
    grow?: number
    align?: Align
    justify?: Justify
    alignItems?: Align
    gap?: number
    pad?: number
    maxW?: number
    /** `min-w-0`: let a weight shrink this below its content width. */
    minW0?: boolean

    // ---- text, the part draw.io can actually render ----
    /** `font-bold` / `font-normal`. draw.io has one bold bit, not nine weights. */
    bold?: boolean
    /** `italic` / `not-italic`. */
    italic?: boolean
    /** `underline` / `no-underline`. */
    underline?: boolean
    /** `line-through`. draw.io's fontStyle carries a strikethrough bit beside the other three. */
    strike?: boolean
    /** `text-xs`…`text-4xl` → px, from Tailwind's own scale. */
    fontSize?: number
    /** `text-left` / `text-center` / `text-right`. */
    textAlign?: "left" | "center" | "right"
    /** `align-top` / `align-middle` / `align-bottom`. */
    verticalAlign?: "top" | "middle" | "bottom"
    /** `whitespace-nowrap` / `whitespace-normal`. */
    nowrap?: boolean

    // ---- border ----
    /** `border` / `border-N` → strokeWidth in px. */
    borderWidth?: number
    /** `border-dashed` / `border-dotted` / `border-solid`. */
    borderStyle?: "solid" | "dashed" | "dotted"
    /** `rounded`, `rounded-lg`, `rounded-full` → corner radius in px. */
    radius?: number
    /** `border-none` / `border-0`. */
    borderless?: boolean
    /** `shadow-sm`…`shadow-xl` → 1–4; `shadow-none` → 0. See SHADOW. */
    shadow?: number

    /** Classes that matched nothing, verbatim and in order. */
    ignored: string[]
}

/**
 * Tailwind's spacing scale: one unit is 0.25rem, which is 4px at the default root size.
 *
 * Only whole steps are accepted. Tailwind itself has half-steps (`p-0.5`), but a diagram has
 * no use for 2px padding and allowing them widens the scale for nothing.
 */
const SPACING_UNIT = 4

/** `p-6` / `gap-3` → px, or null when the suffix is not a plain scale step. */
function scaleToPx(suffix: string): number | null {
    if (!/^\d+$/.test(suffix)) return null
    return Number(suffix) * SPACING_UNIT
}

/**
 * Tailwind's width fractions, as a share of the parent.
 *
 * Expressed as `grow` rather than an absolute width, because that is what the fraction means
 * inside a flex row: `w-1/3` beside `w-2/3` is the same layout as `grow-1` beside `grow-2`,
 * and going through grow means the existing proportional path applies — including the rule
 * that a declared cap outranks it.
 */
function fractionToGrow(suffix: string): number | null {
    const m = /^(\d+)\/(\d+)$/.exec(suffix)
    if (!m) return null
    const num = Number(m[1])
    const den = Number(m[2])
    if (den === 0 || num === 0 || num > den) return null
    return num
}

const ALIGN_ITEMS: Record<string, Align> = {
    "items-start": "start",
    "items-center": "center",
    "items-end": "end",
    "items-stretch": "stretch",
}

const ALIGN_SELF: Record<string, Align> = {
    "self-start": "start",
    "self-center": "center",
    "self-end": "end",
    "self-stretch": "stretch",
}

const JUSTIFY: Record<string, Justify> = {
    "justify-start": "start",
    "justify-center": "center",
    "justify-end": "end",
    "justify-between": "between",
    "justify-around": "around",
    "justify-evenly": "evenly",
}

/**
 * Tailwind's type scale in px, its own documented values.
 *
 * Stops at 4xl. The ladder goes on to 9xl (128px), but a 128px word is not a diagram
 * label, and offering the step invites a model to pick it.
 */
const FONT_SIZE: Record<string, number> = {
    "text-xs": 12,
    "text-sm": 14,
    "text-base": 16,
    "text-lg": 18,
    "text-xl": 20,
    "text-2xl": 24,
    "text-3xl": 30,
    "text-4xl": 36,
}

/**
 * `text-left|center|right` — horizontal text alignment inside the shape.
 *
 * `text-justify`, `text-start` and `text-end` are absent because draw.io's `align` has
 * only the three physical values; justified text is not available at all.
 */
const TEXT_ALIGN: Record<string, "left" | "center" | "right"> = {
    "text-left": "left",
    "text-center": "center",
    "text-right": "right",
}

/** `align-*` → draw.io's verticalAlign. */
const VERTICAL_ALIGN: Record<string, "top" | "middle" | "bottom"> = {
    "align-top": "top",
    "align-middle": "middle",
    "align-bottom": "bottom",
}

/**
 * Tailwind's border-radius scale in px, its own documented values.
 *
 * These are REAL pixels, which is only true because of `absoluteArcSize`: draw.io's `arcSize`
 * is a percentage of the shape by default, but that flag switches it to absolute units
 * (mxShape.js:1172-1189). Without it a radius class would mean something different on every
 * box, which is why this looked unimplementable at first glance.
 *
 * `rounded-full` is `calc(infinity * 1px)` in Tailwind v4 — "as round as it goes". The same
 * function clamps the radius to half the shorter side, so any number past half the box's
 * height gives a stadium. 200 is chosen rather than something enormous because the number
 * reaches the user: draw.io's Arrange panel shows `arcSize` in an editable field, and a
 * diagram box taller than 400px does not exist, so 200 is both always enough and readable.
 */
const RADIUS: Record<string, number> = {
    "rounded-none": 0,
    "rounded-xs": 2,
    "rounded-sm": 4,
    rounded: 4,
    "rounded-md": 6,
    "rounded-lg": 8,
    "rounded-xl": 12,
    "rounded-2xl": 16,
    "rounded-3xl": 24,
    "rounded-4xl": 32,
    "rounded-full": 200,
}

/**
 * Tailwind's box-shadow steps, as a rung number the renderer turns into draw.io's five
 * shadow parameters. 0 means "explicitly no shadow".
 *
 * draw.io's shadow is not the on/off flag it looks like: `shadowOffsetX`, `shadowOffsetY`,
 * `shadowBlur`, `shadowColor` and `shadowOpacity` are read independently
 * (mxShape.js:505-535) and become a CSS `drop-shadow(dx dy blur colour)` (540-552). Since
 * Tailwind's own steps are also just offset-and-blur, they map one for one.
 *
 * Four rungs, not Tailwind's eight. `shadow-2xs` and `shadow-xs` are indistinguishable from
 * `shadow-sm` at a diagram's scale, and `shadow-2xl`'s 50px blur is noise on a page of
 * boxes — offering a step invites a model to pick it.
 */
const SHADOW: Record<string, number> = {
    "shadow-none": 0,
    "shadow-sm": 1,
    "shadow-md": 2,
    "shadow-lg": 3,
    "shadow-xl": 4,
}

/**
 * Font-weight classes that are NOT accepted, and why.
 *
 * Tailwind has nine weights; draw.io's `fontStyle` is a bitmask whose bold flag is a single
 * bit. Accepting all nine would collapse five of them onto "bold" and four onto "normal",
 * which is the same defect that rules out `shadow-*` (six sizes, one on/off flag). So only
 * `font-bold` and `font-normal` are honoured and the rest are reported, rather than
 * pretending a distinction the renderer cannot draw.
 */
const UNSUPPORTED_WEIGHTS = new Set([
    "font-thin",
    "font-extralight",
    "font-light",
    "font-medium",
    "font-semibold",
    "font-extrabold",
    "font-black",
])

/**
 * Parse a Tailwind class string into layout fields.
 *
 * Later classes win over earlier ones, the same as Tailwind's own last-one-wins behaviour
 * for conflicting utilities, so a caller can append an override without removing anything.
 */
export function parseTw(classes: string): TwLayout {
    const out: TwLayout = { ignored: [] }
    for (const raw of String(classes ?? "").split(/\s+/)) {
        const cls = raw.trim()
        if (!cls) continue

        // Direction. `flex` on its own is the default and says nothing here — every engine
        // container is already a flex container — so it is accepted and ignored rather than
        // reported, since a model writing `flex flex-col` is not making a mistake.
        if (cls === "flex" || cls === "flex-row") {
            if (cls === "flex-row") out.dir = "row"
            continue
        }
        if (cls === "flex-col") {
            out.dir = "col"
            continue
        }

        if (cls in ALIGN_ITEMS) {
            out.alignItems = ALIGN_ITEMS[cls]
            continue
        }
        if (cls in ALIGN_SELF) {
            out.align = ALIGN_SELF[cls]
            continue
        }
        if (cls in JUSTIFY) {
            out.justify = JUSTIFY[cls]
            continue
        }

        // `grow` alone is flex-grow: 1, `grow-N` is the weight. Tailwind writes the latter
        // as `grow-[3]`; the plain form is accepted because it is what a model reaches for
        // and the bracket form carries no extra meaning here.
        if (cls === "grow") {
            out.grow = 1
            continue
        }
        const growN = /^grow-(\d+)$/.exec(cls)
        if (growN) {
            out.grow = Number(growN[1])
            continue
        }
        // `flex-1` / `flex-3`: the shorthand whose whole point is proportional sizing.
        const flexN = /^flex-(\d+)$/.exec(cls)
        if (flexN) {
            out.grow = Number(flexN[1])
            continue
        }

        // Fractional widths become weights — see fractionToGrow.
        const wFrac = /^w-(\d+\/\d+)$/.exec(cls)
        if (wFrac) {
            const g = fractionToGrow(wFrac[1])
            if (g !== null) {
                out.grow = g
                continue
            }
        }
        if (cls === "w-full") {
            out.align = "stretch"
            continue
        }

        // `min-w-0` is the standard CSS escape hatch for "let the weight win over my
        // content width". Without it a weighted child is floored by its own text — that is
        // real flexbox behaviour, since `min-width` defaults to `auto` — so a narrow column
        // beside a wide one settles at its text width and a declared 2:1 comes out 1.4:1.
        if (cls === "min-w-0") {
            out.minW0 = true
            continue
        }

        // Spacing. `p-*` is interior padding, `gap-*` the space between children. Tailwind's
        // per-side variants (`pt-*`, `px-*`) are not here: the engine has one padding value,
        // and quietly treating `pt-8` as padding on all four sides would be wrong in a way
        // the model could not see.
        const pad = /^p-(\d+)$/.exec(cls)
        if (pad) {
            const px = scaleToPx(pad[1])
            if (px !== null) {
                out.pad = px
                continue
            }
        }
        const gap = /^gap-(\d+)$/.exec(cls)
        if (gap) {
            const px = scaleToPx(gap[1])
            if (px !== null) {
                out.gap = px
                continue
            }
        }

        // `max-w-*` uses the spacing scale too, so `max-w-96` is 384px. Tailwind's named
        // sizes are also accepted, because a model reaches for `max-w-md` more readily than
        // for a step number.
        const maxW = /^max-w-(\d+)$/.exec(cls)
        if (maxW) {
            const px = scaleToPx(maxW[1])
            if (px !== null) {
                out.maxW = px
                continue
            }
        }
        const named = NAMED_MAX_W[cls]
        if (named) {
            out.maxW = named
            continue
        }

        // ---- text ----
        // The three flags draw.io's fontStyle bitmask actually carries. They combine by
        // adding bits, so bold + italic is legal and needs no special case here.
        if (cls === "font-bold" || cls === "font-normal") {
            out.bold = cls === "font-bold"
            continue
        }
        // The other seven weights fall through to `ignored` on purpose, so the model is
        // told the distinction was dropped instead of quietly getting plain bold.
        if (UNSUPPORTED_WEIGHTS.has(cls)) {
            out.ignored.push(cls)
            continue
        }
        if (cls === "italic" || cls === "not-italic") {
            out.italic = cls === "italic"
            continue
        }
        if (cls === "underline" || cls === "no-underline") {
            out.underline = cls === "underline"
            continue
        }
        // Strikethrough is its own bit (8) beside bold/italic/underline, so it combines with
        // them rather than replacing one. `no-underline` above deliberately does NOT clear
        // it: in CSS both are values of `text-decoration-line`, and Tailwind's `no-underline`
        // means "not underlined", not "undecorated".
        if (cls === "line-through") {
            out.strike = true
            continue
        }
        // `text-*` is three different Tailwind properties sharing one prefix: size
        // (text-lg), alignment (text-left) and COLOUR (text-red-500). The size and
        // alignment tables are exact-match, so a colour class falls through to `ignored`
        // rather than being mistaken for a size.
        if (cls in FONT_SIZE) {
            out.fontSize = FONT_SIZE[cls]
            continue
        }
        if (cls in TEXT_ALIGN) {
            out.textAlign = TEXT_ALIGN[cls]
            continue
        }
        if (cls in VERTICAL_ALIGN) {
            out.verticalAlign = VERTICAL_ALIGN[cls]
            continue
        }
        if (cls === "whitespace-nowrap" || cls === "whitespace-normal") {
            out.nowrap = cls === "whitespace-nowrap"
            continue
        }

        // ---- border ----
        // `border` alone is 1px, `border-N` is N px — Tailwind's border width is a plain
        // pixel count, not the 4px spacing scale.
        if (cls === "border") {
            out.borderWidth = 1
            continue
        }
        // `border-0` and `border-none` both mean no border, so they are handled before the
        // numeric case (which would otherwise read border-0 as a zero-width border and
        // leave draw.io drawing its default hairline).
        if (cls === "border-none" || cls === "border-0") {
            out.borderless = true
            continue
        }
        const bw = /^border-(\d+)$/.exec(cls)
        if (bw) {
            out.borderWidth = Number(bw[1])
            continue
        }
        if (
            cls === "border-solid" ||
            cls === "border-dashed" ||
            cls === "border-dotted"
        ) {
            out.borderStyle = cls.slice("border-".length) as
                | "solid"
                | "dashed"
                | "dotted"
            continue
        }
        // Whole-shape corner radius. Per-corner classes (`rounded-tl-lg`) fall through to
        // `ignored`: draw.io only offers those on a separate template shape.
        if (cls in RADIUS) {
            out.radius = RADIUS[cls]
            continue
        }

        // Drop shadow. Per-side border classes (`border-l-4`) fall through to `ignored`, and
        // so does every colour form (`shadow-blue-500`) since these tables are exact-match.
        if (cls in SHADOW) {
            out.shadow = SHADOW[cls]
            continue
        }

        out.ignored.push(cls)
    }
    return out
}

/**
 * Tailwind's named max-width steps, in px.
 *
 * Tailwind's own values, rounded to whole pixels. Stopping at `4xl` is deliberate: anything
 * wider than about a thousand pixels is not a cap a diagram needs, and offering the whole
 * ladder invites a model to pick one at random.
 */
const NAMED_MAX_W: Record<string, number> = {
    "max-w-xs": 320,
    "max-w-sm": 384,
    "max-w-md": 448,
    "max-w-lg": 512,
    "max-w-xl": 576,
    "max-w-2xl": 672,
    "max-w-3xl": 768,
    "max-w-4xl": 896,
}
