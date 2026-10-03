/**
 * The shape vocabulary: what a box can BE, beyond a labelled rectangle.
 *
 * draw.io ships hundreds of shapes; the engine's declarative layer used to allow six.
 * That gap — not colours, not spacing — was why engine output looked flat next to
 * hand-written XML: a database drawn as a grey rectangle labelled "database" instead of
 * a cylinder. This module opens the vocabulary in two tiers:
 *
 *   CATALOG — ~20 curated shapes the engine fully understands. Each entry carries the
 *   complete style fragment (including the matching `perimeter=`, which draw.io's own
 *   style reference warns is required or edges connect to the bounding box), how much
 *   larger the box must be for its text to fit inside the non-rectangular outline
 *   (verified empirically in the real editor: a rhombus needs ~1.5× the rectangle's
 *   size for the same text), and whether the label renders below the glyph instead of
 *   inside it.
 *
 *   PASS-THROUGH — any other token that looks like a draw.io shape name is emitted
 *   verbatim as `shape=<token>;`. Verified in the real editor: an unknown token
 *   degrades to a rectangle, it does not break the page. A conservative text scale
 *   covers the common case that the real shape is roughly convex. The tool response
 *   carries a near-match hint ("cyclinder → cylinder?") so a typo is a one-turn fix,
 *   not a silent permanent degradation.
 *
 * Style strings are merged structurally, not concatenated: each fragment is parsed to
 * key=value tokens and later fragments override earlier ones per key. This is what
 * makes shape and theme composable by rule — the shape fragment owns geometry keys
 * (shape, perimeter, rounded…), the theme owns colour and type keys, and an overlap
 * (a theme that says rounded=1 on a rhombus) resolves by order instead of emitting
 * two conflicting tokens.
 */

/** How a known shape renders and measures. */
export interface ShapeSpec {
    /** Geometry style tokens ONLY — no colours, no fonts; those belong to the theme. */
    style: string
    /**
     * How much larger than a rectangle the box must be for the same text to fit
     * inside the outline. 1.0 for the rectangle family; ~1.5 for a rhombus, whose
     * inscribed rectangle is half its bounding box.
     */
    textScale: number
    /** The label renders below the glyph, not inside it (umlActor and friends). */
    labelOutside?: boolean
    /** Fixed glyph size for labelOutside shapes, which do not scale with text. */
    glyph?: { w: number; h: number }
}

/**
 * The curated catalog. Keys are the vocabulary the model is taught; several are
 * semantic aliases for the same geometry (decision/diamond), because the model will
 * reach for both names.
 */
export const SHAPE_CATALOG: Record<string, ShapeSpec> = {
    // ---- the rectangle family (the original six) ----
    box: { style: "rounded=0;", textScale: 1 },
    round: { style: "rounded=1;arcSize=12;", textScale: 1 },
    terminator: { style: "rounded=1;arcSize=50;", textScale: 1.15 },
    decision: {
        style: "rhombus;perimeter=rhombusPerimeter;",
        textScale: 1.5,
    },
    diamond: {
        style: "rhombus;perimeter=rhombusPerimeter;",
        textScale: 1.5,
    },
    data: {
        style: "shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;size=14;",
        textScale: 1.2,
    },
    document: { style: "shape=document;boundedLbl=1;", textScale: 1.15 },

    // ---- the semantic vocabulary (D2's tier: a node that IS a thing) ----
    /** A database or datastore. */
    cylinder: {
        style: "shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=12;",
        textScale: 1.3,
    },
    /** A message queue: a cylinder on its side. */
    queue: {
        style: "shape=cylinder3;direction=south;boundedLbl=1;backgroundOutline=1;size=12;",
        textScale: 1.3,
    },
    /** An actor or user. Label below the figure. */
    person: {
        style: "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;outlineConnect=0;",
        textScale: 1,
        labelOutside: true,
        glyph: { w: 40, h: 60 },
    },
    /** An external system, the internet. */
    cloud: { style: "ellipse;shape=cloud;", textScale: 1.6 },
    /** A service or process step. */
    hexagon: {
        style: "shape=hexagon;perimeter=hexagonPerimeter2;fixedSize=1;size=16;",
        textScale: 1.25,
    },
    /** A concept, state or category. */
    ellipse: { style: "ellipse;", textScale: 1.3 },
    /** A speech-bubble annotation. */
    callout: {
        style: "shape=callout;perimeter=calloutPerimeter;rounded=1;size=16;position=0.5;base=24;",
        textScale: 1.35,
    },
    /** A chevron stage in a pipeline. */
    step: {
        style: "shape=step;perimeter=stepPerimeter;fixedSize=1;size=16;",
        textScale: 1.2,
    },
    /** A sticky note. */
    note: { style: "shape=note;size=14;", textScale: 1.1 },
    /** A card with a cut corner. */
    card: { style: "shape=card;size=14;", textScale: 1.1 },
    /** A process box with side bars (predefined subroutine). */
    process: { style: "shape=process;size=0.1;", textScale: 1.2 },
    /** Punched tape — legacy data, files. */
    tape: { style: "shape=tape;size=0.2;", textScale: 1.3 },
    /** A double-walled cube. */
    cube: { style: "shape=cube;size=12;", textScale: 1.25 },
}

/** A shape token that may pass through unrecognised: draw.io style-key charset only. */
const SAFE_TOKEN = /^[a-zA-Z0-9._]+$/

export interface ResolvedShape {
    spec: ShapeSpec
    /** Set when the token was not in the catalog and passed through verbatim. */
    passthrough?: boolean
}

/**
 * Resolve a shape token: catalog entry, safe pass-through, or null for a token that
 * could inject style keys (`;`/`=`/quotes) and must be rejected outright.
 */
export function resolveShape(token: string): ResolvedShape | null {
    const known = SHAPE_CATALOG[token]
    if (known) return { spec: known }
    if (!SAFE_TOKEN.test(token)) return null
    // Unknown but safe: emit verbatim. draw.io degrades an unregistered shape to a
    // rectangle, so the worst case is a plain box — same as before the vocabulary
    // existed. The conservative scale covers roughly-convex real shapes.
    return {
        spec: { style: `shape=${token};`, textScale: 1.25 },
        passthrough: true,
    }
}

/** The catalog key most similar to a token, for "did you mean" hints. */
export function nearestShape(token: string): string | null {
    const t = token.toLowerCase()
    let best: string | null = null
    let bestD = 3 // more than 2 edits away is not a typo
    for (const key of Object.keys(SHAPE_CATALOG)) {
        const d = editDistance(t, key.toLowerCase(), bestD)
        if (d < bestD) {
            bestD = d
            best = key
        }
    }
    return best
}

/** Bounded Levenshtein distance; returns limit when the strings are further apart. */
function editDistance(a: string, b: string, limit: number): number {
    if (Math.abs(a.length - b.length) >= limit) return limit
    const prev = new Array(b.length + 1)
    for (let j = 0; j <= b.length; j++) prev[j] = j
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0]
        prev[0] = i
        let rowMin = prev[0]
        for (let j = 1; j <= b.length; j++) {
            const cur = Math.min(
                prev[j] + 1,
                prev[j - 1] + 1,
                diag + (a[i - 1] === b[j - 1] ? 0 : 1),
            )
            diag = prev[j]
            prev[j] = cur
            if (cur < rowMin) rowMin = cur
        }
        if (rowMin >= limit) return limit
    }
    return Math.min(prev[b.length], limit)
}

// ---- structured style merge ----

/**
 * Merge style fragments by key, later fragments winning.
 *
 * A draw.io style is `tok;key=value;key=value;` — bare class tokens (rhombus, ellipse,
 * text) come first and key=value pairs follow. String concatenation made every
 * conflict a duplicate key resolved by draw.io's last-wins rule, which worked until
 * shape fragments and theme fragments both owned geometry keys (a theme's rounded=1
 * against a shape's rhombus). Merging structurally keeps exactly one token per key and
 * one bare-token set, so the output is canonical and the ownership rule — theme owns
 * colour and type, shape owns geometry — is enforced by fragment ORDER, not by hoping
 * the keys never meet.
 *
 * Bare tokens are kept in first-appearance order, except that a later fragment's bare
 * SHAPE CLASS (rhombus/ellipse/triangle) replaces an earlier one — two shape classes
 * on one cell is a contradiction, not a union.
 */
export function mergeStyle(...fragments: (string | undefined)[]): string {
    const bare: string[] = []
    const kv = new Map<string, string>()
    const SHAPE_CLASSES = new Set(["rhombus", "ellipse", "triangle"])
    for (const f of fragments) {
        if (!f) continue
        for (const tok of f.split(";")) {
            if (tok === "") continue
            const eq = tok.indexOf("=")
            if (eq < 0) {
                if (SHAPE_CLASSES.has(tok)) {
                    const i = bare.findIndex((b) => SHAPE_CLASSES.has(b))
                    if (i >= 0) bare.splice(i, 1)
                }
                if (!bare.includes(tok)) bare.push(tok)
                continue
            }
            const key = tok.slice(0, eq)
            kv.set(key, tok.slice(eq + 1))
            // An explicit shape= also displaces a bare shape class from an earlier
            // fragment — same contradiction as two bare classes.
            if (key === "shape") {
                const i = bare.findIndex((b) => SHAPE_CLASSES.has(b))
                if (i >= 0) bare.splice(i, 1)
            }
        }
    }
    let out = bare.join(";")
    if (out) out += ";"
    for (const [k, v] of kv) out += `${k}=${v};`
    return out
}
