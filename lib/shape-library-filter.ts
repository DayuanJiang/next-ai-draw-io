import type { ModelMessage, TextPart } from "ai"

/**
 * Libraries with at least this many shapes are filtered down via a secondary
 * LLM call. Smaller libraries are returned in full.
 */
export const SHAPE_FILTER_THRESHOLD = 100

/** Maximum number of shapes kept after LLM filtering. */
export const MAX_FILTERED_SHAPES = 15

export interface ShapeGroup {
    /** Verbatim `### ...` heading line, or null for flat (uncategorized) lists */
    heading: string | null
    /** Shape names with backticks and surrounding whitespace stripped */
    shapes: string[]
}

export interface ParsedShapeDoc {
    /** Everything before the `## Shapes` heading */
    header: string
    /** Non-empty lines between the `## Shapes` heading and the first shape/section */
    intro: string[]
    groups: ShapeGroup[]
    totalShapes: number
}

const SHAPE_LINE = /^-\s+(?:`([^`]+)`|(\S+))\s*$/
const HEADING_LINE = /^###\s+.+/
const H2_CATEGORY_LINE = /^##\s+\S+\s*\(\d+\)\s*$/
const INLINE_CATEGORY_LINE = /^-\s+\*\*(.+?)\*\*\s*\(\d+\):\s*(.+)$/
const HEADING_COUNT = /\s*\(\d+\)\s*$/

/**
 * Parse a shape library markdown doc. Supports flat shape lists (aws4, gcp2,
 * ...), `### category` sections (azure2), inline `- **category** (N): a, b, c`
 * entries (azure2), and `## category (N)` sections without a central
 * `## Shapes` heading (material_design). Returns null when the doc has no
 * parseable shape list.
 */
export function parseShapeDoc(content: string): ParsedShapeDoc | null {
    let header: string
    let bodyLines: string[]
    let isCategoryHeading: (line: string) => boolean

    const shapesIdx = content.indexOf("## Shapes")
    if (shapesIdx !== -1) {
        header = content.slice(0, shapesIdx).trimEnd()
        // Skip index 0: the "## Shapes" heading line itself
        bodyLines = content.slice(shapesIdx).split("\n").slice(1)
        isCategoryHeading = (line) => HEADING_LINE.test(line)
    } else {
        // Fallback: docs like material_design split shapes across
        // "## category (N)" sections without a central Shapes heading
        const lines = content.split("\n")
        const firstCategoryIdx = lines.findIndex((line, i) => {
            if (!H2_CATEGORY_LINE.test(line)) return false
            // must actually contain shape lines before the next heading
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].startsWith("#")) return false
                if (SHAPE_LINE.test(lines[j])) return true
            }
            return false
        })
        if (firstCategoryIdx === -1) return null
        header = lines.slice(0, firstCategoryIdx).join("\n").trimEnd()
        bodyLines = lines.slice(firstCategoryIdx)
        isCategoryHeading = (line) => line.startsWith("## ")
    }

    const intro: string[] = []
    const groups: ShapeGroup[] = []
    let current: ShapeGroup | null = null
    let totalShapes = 0

    for (const line of bodyLines) {
        const inlineCategory = line.match(INLINE_CATEGORY_LINE)
        const shapeMatch = line.match(SHAPE_LINE)

        if (inlineCategory) {
            // azure2 packs small categories onto a single line:
            // - **integration** (21): Name1, Name2, ...
            const name = inlineCategory[1].trim()
            const shapes = inlineCategory[2]
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            current = { heading: `### ${name} (${shapes.length})`, shapes }
            groups.push(current)
            totalShapes += shapes.length
        } else if (shapeMatch) {
            const name = (shapeMatch[1] ?? shapeMatch[2])?.trim()
            if (!name) continue
            if (!current) {
                current = { heading: null, shapes: [] }
                groups.push(current)
            }
            current.shapes.push(name)
            totalShapes++
        } else if (isCategoryHeading(line)) {
            current = { heading: line.trim(), shapes: [] }
            groups.push(current)
        } else if (line.trim() !== "" && !current) {
            // Intro text sits above the first shape or section heading
            intro.push(line.trimEnd())
        }
        // Blank lines and stray text after shapes started are dropped;
        // rebuildShapeDoc re-emits the doc with consistent spacing.
    }

    if (totalShapes === 0) return null
    return { header, intro, groups, totalShapes }
}

/**
 * Validate an LLM-selected shape list against the parsed doc. Drops
 * hallucinated names, dedupes case-insensitively (keeping the canonical
 * spelling), and caps the result at maxShapes. Returns names in the order the
 * LLM ranked them.
 */
export function selectShapes(
    parsed: ParsedShapeDoc,
    selected: string[],
    maxShapes: number = MAX_FILTERED_SHAPES,
): string[] {
    const canonical = new Map<string, string>()
    for (const group of parsed.groups) {
        for (const shape of group.shapes) {
            const key = shape.toLowerCase()
            if (!canonical.has(key)) canonical.set(key, shape)
        }
    }

    const kept: string[] = []
    const seen = new Set<string>()
    for (const candidate of selected) {
        const name = canonical.get(
            candidate.trim().replace(/`/g, "").toLowerCase(),
        )
        if (!name || seen.has(name)) continue
        seen.add(name)
        kept.push(name)
        if (kept.length >= maxShapes) break
    }
    return kept
}

/**
 * Rebuild the markdown doc containing only the kept shapes. Category
 * sections (azure2) are preserved with updated counts; empty sections are
 * dropped. Shapes are re-emitted in document order within their section.
 */
export function rebuildShapeDoc(
    parsed: ParsedShapeDoc,
    kept: string[],
): string {
    const keptSet = new Set(kept)
    const sections: string[] = []

    for (const group of parsed.groups) {
        const keptShapes = group.shapes.filter((shape) => keptSet.has(shape))
        if (keptShapes.length === 0) continue

        const lines = keptShapes.map((shape) => `- \`${shape}\``).join("\n")
        if (group.heading) {
            const heading = group.heading.replace(
                HEADING_COUNT,
                ` (${keptShapes.length})`,
            )
            sections.push(`${heading}\n\n${lines}`)
        } else {
            sections.push(lines)
        }
    }

    const lines = [
        parsed.header,
        "",
        `## Shapes (${kept.length} of ${parsed.totalShapes} - filtered for relevance)`,
    ]
    if (parsed.intro.length > 0) {
        lines.push("", ...parsed.intro)
    }
    lines.push("", sections.join("\n\n"), "")
    return lines.join("\n")
}

/**
 * Extract the most recent user text from the model messages passed to a tool's
 * execute function. Handles both string content and part arrays. Returns ""
 * when no user text exists.
 */
export function extractUserPrompt(messages: ModelMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i]
        if (message.role !== "user") continue
        if (typeof message.content === "string") return message.content
        const textPart = message.content.find(
            (part): part is TextPart => part.type === "text",
        )
        if (textPart?.text) return textPart.text
    }
    return ""
}
