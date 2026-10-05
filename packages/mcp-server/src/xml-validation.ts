/**
 * XML Validation and Auto-Fix for draw.io diagrams
 * Copied from lib/utils.ts to avoid cross-package imports
 */

import { readAttributes } from "./xml-attributes.ts"
import { getXmlSyntaxError } from "./xml-syntax.ts"

// ============================================================================
// Constants
// ============================================================================

/** Maximum XML size to process (1MB) - larger XMLs may cause performance issues */
const MAX_XML_SIZE = 1_000_000

/** Structural attributes that should not be duplicated in draw.io */
const STRUCTURAL_ATTRS = [
    "edge",
    "parent",
    "source",
    "target",
    "vertex",
    "connectable",
]

/** Valid XML entity names */
const VALID_ENTITIES = new Set(["lt", "gt", "amp", "quot", "apos"])

/** Element names draw.io understands (case-sensitive) */
const VALID_DRAWIO_TAGS = new Set([
    "mxfile",
    "diagram",
    "mxGraphModel",
    "root",
    "mxCell",
    "mxGeometry",
    "mxPoint",
    "Array",
    "Object",
    "mxRectangle",
    // Wrappers draw.io writes for cells with links, tooltips or data
    "UserObject",
    "object",
])

// ============================================================================
// XML Parsing Helpers
// ============================================================================

interface ParsedTag {
    tag: string
    tagName: string
    isClosing: boolean
    isSelfClosing: boolean
    startIndex: number
    endIndex: number
}

/**
 * Parse XML tags while properly handling quoted strings
 */
function parseXmlTags(xml: string): ParsedTag[] {
    const tags: ParsedTag[] = []
    let i = 0

    while (i < xml.length) {
        const tagStart = xml.indexOf("<", i)
        if (tagStart === -1) break

        // Find matching > by tracking quotes
        let tagEnd = tagStart + 1
        let inQuote = false
        let quoteChar = ""

        while (tagEnd < xml.length) {
            const c = xml[tagEnd]
            if (inQuote) {
                if (c === quoteChar) inQuote = false
            } else {
                if (c === '"' || c === "'") {
                    inQuote = true
                    quoteChar = c
                } else if (c === ">") {
                    break
                }
            }
            tagEnd++
        }

        if (tagEnd >= xml.length) break

        const tag = xml.substring(tagStart, tagEnd + 1)
        i = tagEnd + 1

        const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)/.exec(tag)
        if (!tagMatch) continue

        tags.push({
            tag,
            tagName: tagMatch[2],
            isClosing: tagMatch[1] === "/",
            isSelfClosing: tag.endsWith("/>"),
            startIndex: tagStart,
            endIndex: tagEnd,
        })
    }

    return tags
}

/**
 * Returns a function telling whether a position lies inside a quoted
 * attribute value. Positions must be queried in increasing order.
 */
function createQuoteTracker(str: string): (pos: number) => boolean {
    let i = 0
    let inQuote = false
    let quoteChar = ""
    return (pos: number) => {
        for (; i < pos && i < str.length; i++) {
            const c = str[i]
            if (inQuote) {
                if (c === quoteChar) inQuote = false
            } else if (c === '"' || c === "'") {
                // Only quotes that follow "=" open an attribute value
                let j = i - 1
                while (j >= 0 && /\s/.test(str[j])) j--
                if (j >= 0 && str[j] === "=") {
                    inQuote = true
                    quoteChar = c
                }
            }
        }
        return inQuote
    }
}

/** Rewrite every opening tag with fn, leaving text and closing tags as is. */
function replaceInOpeningTags(
    xml: string,
    fn: (tag: string) => string,
): string {
    let out = ""
    let last = 0
    for (const { tag, isClosing, startIndex, endIndex } of parseXmlTags(xml)) {
        if (isClosing) continue
        out += xml.slice(last, startIndex) + fn(tag)
        last = endIndex + 1
    }
    return out + xml.slice(last)
}

// ============================================================================
// Validation Helper Functions
// ============================================================================

/** Check for duplicate structural attributes in a tag */
function checkDuplicateAttributes(xml: string): string | null {
    const structuralSet = new Set(STRUCTURAL_ATTRS)
    for (const [tag] of xml.matchAll(/<[^>]+>/g)) {
        const attributes = new Map<string, number>()
        for (const { name } of readAttributes(tag)) {
            attributes.set(name, (attributes.get(name) || 0) + 1)
        }
        const duplicates = Array.from(attributes.entries())
            .filter(([name, count]) => count > 1 && structuralSet.has(name))
            .map(([name]) => name)
        if (duplicates.length > 0) {
            return `Invalid XML: Duplicate structural attribute(s): ${duplicates.join(", ")}. Remove duplicate attributes.`
        }
    }
    return null
}

/**
 * Check for duplicate IDs in XML.
 *
 * For multi-page documents (<mxfile> with multiple <diagram> children), cell
 * IDs are unique **within a page**, not across the whole document — drawio
 * legitimately reuses "0" and "1" for the root cells of every page. So we
 * scope the cell-ID uniqueness check per <diagram>, and additionally check
 * that the <diagram> ids themselves are unique.
 *
 * The legacy regex-based check is kept as a fallback for non-mxfile inputs.
 */
function checkDuplicateIds(xml: string): string | null {
    // The DOM-aware path only matters for <mxfile> wrappers; for legacy
    // bare <mxGraphModel> inputs (the overwhelming majority of historic
    // traffic), the cheap regex fallback at the bottom is enough. A quick
    // string check avoids paying the DOMParser cost on every call.
    const mightBeMxFile = /<mxfile[\s>]/i.test(xml)

    // Try DOM-aware, page-scoped check first when the input looks mxfile-ish.
    if (mightBeMxFile)
        try {
            const doc = new DOMParser().parseFromString(xml, "text/xml")
            const rootEl = doc.documentElement
            if (rootEl && rootEl.tagName === "mxfile") {
                const diagrams = doc.querySelectorAll("diagram")

                // 1) <diagram> ids must be unique across the file.
                const diagramIds = new Map<string, number>()
                diagrams.forEach((d) => {
                    const id = d.getAttribute("id")
                    if (id) diagramIds.set(id, (diagramIds.get(id) || 0) + 1)
                })
                const dupDiagrams = Array.from(diagramIds.entries())
                    .filter(([, c]) => c > 1)
                    .map(([id]) => `'${id}'`)
                if (dupDiagrams.length > 0) {
                    return `Invalid XML: Found duplicate <diagram> id(s): ${dupDiagrams.slice(0, 3).join(", ")}. Each page must have a unique id.`
                }

                // 2) Within each page, cell ids must be unique. A cell with
                // a link or custom data is a UserObject/object holding the
                // id, around an mxCell whose own id does not count.
                for (let i = 0; i < diagrams.length; i++) {
                    const diagram = diagrams[i]
                    const pageId = diagram.getAttribute("id") || `(index ${i})`
                    const cells = diagram.querySelectorAll(
                        "mxCell, UserObject, object",
                    )
                    const cellIds = new Map<string, number>()
                    cells.forEach((c) => {
                        const wrapped =
                            c.tagName === "mxCell" &&
                            /^(UserObject|object)$/.test(
                                c.parentElement?.tagName ?? "",
                            )
                        const id = c.getAttribute("id")
                        if (id && !wrapped)
                            cellIds.set(id, (cellIds.get(id) || 0) + 1)
                    })
                    const dups = Array.from(cellIds.entries())
                        .filter(([, c]) => c > 1)
                        .map(([id, count]) => `'${id}' (${count}x)`)
                    if (dups.length > 0) {
                        return `Invalid XML: Found duplicate cell ID(s) in page "${pageId}": ${dups.slice(0, 3).join(", ")}. All mxCell ids must be unique within a page.`
                    }
                }
                return null
            }
        } catch {
            // fall through to regex
        }

    // Legacy regex-based check for bare <mxGraphModel> inputs.
    const idPattern = /\bid\s*=\s*["']([^"']+)["']/gi
    const ids = new Map<string, number>()
    let idMatch
    while ((idMatch = idPattern.exec(xml)) !== null) {
        const id = idMatch[1]
        ids.set(id, (ids.get(id) || 0) + 1)
    }
    const duplicateIds = Array.from(ids.entries())
        .filter(([, count]) => count > 1)
        .map(([id, count]) => `'${id}' (${count}x)`)
    if (duplicateIds.length > 0) {
        return `Invalid XML: Found duplicate ID(s): ${duplicateIds.slice(0, 3).join(", ")}. All id attributes must be unique.`
    }
    return null
}

/** Check for tag mismatches using parsed tags */
function checkTagMismatches(xml: string): string | null {
    const xmlWithoutComments = xml.replace(/<!--[\s\S]*?-->/g, "")
    const tags = parseXmlTags(xmlWithoutComments)
    const tagStack: string[] = []

    for (const { tagName, isClosing, isSelfClosing } of tags) {
        if (isClosing) {
            if (tagStack.length === 0) {
                return `Invalid XML: Closing tag </${tagName}> without matching opening tag`
            }
            const expected = tagStack.pop()
            if (expected?.toLowerCase() !== tagName.toLowerCase()) {
                return `Invalid XML: Expected closing tag </${expected}> but found </${tagName}>`
            }
        } else if (!isSelfClosing) {
            tagStack.push(tagName)
        }
    }
    if (tagStack.length > 0) {
        return `Invalid XML: Document has ${tagStack.length} unclosed tag(s): ${tagStack.join(", ")}`
    }
    return null
}

/** Check for invalid character references */
function checkCharacterReferences(xml: string): string | null {
    const charRefPattern = /&#x?[^;]+;?/g
    let charMatch
    while ((charMatch = charRefPattern.exec(xml)) !== null) {
        const ref = charMatch[0]
        if (ref.startsWith("&#x")) {
            if (!ref.endsWith(";")) {
                return `Invalid XML: Missing semicolon after hex reference: ${ref}`
            }
            const hexDigits = ref.substring(3, ref.length - 1)
            if (hexDigits.length === 0 || !/^[0-9a-fA-F]+$/.test(hexDigits)) {
                return `Invalid XML: Invalid hex character reference: ${ref}`
            }
        } else if (ref.startsWith("&#")) {
            if (!ref.endsWith(";")) {
                return `Invalid XML: Missing semicolon after decimal reference: ${ref}`
            }
            const decDigits = ref.substring(2, ref.length - 1)
            if (decDigits.length === 0 || !/^[0-9]+$/.test(decDigits)) {
                return `Invalid XML: Invalid decimal character reference: ${ref}`
            }
        }
    }
    return null
}

/** Check for invalid entity references */
function checkEntityReferences(xml: string): string | null {
    const xmlWithoutComments = xml.replace(/<!--[\s\S]*?-->/g, "")
    const bareAmpPattern = /&(?!(?:lt|gt|amp|quot|apos|#))/g
    if (bareAmpPattern.test(xmlWithoutComments)) {
        return "Invalid XML: Found unescaped & character(s). Replace & with &amp;"
    }
    const invalidEntityPattern = /&([a-zA-Z][a-zA-Z0-9]*);/g
    let entityMatch
    while (
        (entityMatch = invalidEntityPattern.exec(xmlWithoutComments)) !== null
    ) {
        if (!VALID_ENTITIES.has(entityMatch[1])) {
            return `Invalid XML: Invalid entity reference: &${entityMatch[1]}; - use only valid XML entities (lt, gt, amp, quot, apos)`
        }
    }
    return null
}

/** Check for nested mxCell tags using regex */
function checkNestedMxCells(xml: string): string | null {
    const cellTagPattern = /<\/?mxCell[^>]*>/g
    const cellStack: number[] = []
    let cellMatch
    while ((cellMatch = cellTagPattern.exec(xml)) !== null) {
        const tag = cellMatch[0]
        if (tag.startsWith("</mxCell>")) {
            if (cellStack.length > 0) cellStack.pop()
        } else if (!tag.endsWith("/>")) {
            const isLabelOrGeometry =
                /\sas\s*=\s*["'](valueLabel|geometry)["']/.test(tag)
            if (!isLabelOrGeometry) {
                cellStack.push(cellMatch.index)
                if (cellStack.length > 1) {
                    return "Invalid XML: Found nested mxCell tags. Cells should be siblings, not nested inside other mxCell elements."
                }
            }
        }
    }
    return null
}

/** Check for element names draw.io does not know (e.g. a lowercase <mxcell>) */
function checkUnknownElements(xml: string): string | null {
    const tags = parseXmlTags(xml.replace(/<!--[\s\S]*?-->/g, ""))
    for (const { tagName } of tags) {
        if (!VALID_DRAWIO_TAGS.has(tagName)) {
            return `Invalid XML: Unknown element <${tagName}>. draw.io only understands ${Array.from(VALID_DRAWIO_TAGS).join(", ")} (names are case-sensitive).`
        }
    }
    return null
}

/**
 * Find <mxPoint> elements without an "as" attribute outside <Array
 * as="points">. draw.io rejects them with "Could not add object mxPoint".
 */
function findOrphanMxPoints(
    xml: string,
): Array<{ start: number; end: number }> {
    const arrays: Array<[number, number]> = []
    // (?<!\/) skips an empty <Array/>, which has no points inside
    for (const m of xml.matchAll(/<Array\b[^>]*(?<!\/)>[\s\S]*?<\/Array>/g)) {
        arrays.push([m.index, m.index + m[0].length])
    }
    const orphans: Array<{ start: number; end: number }> = []
    for (const m of xml.matchAll(/<mxPoint\b[^>]*?(?:\/>|>\s*<\/mxPoint>)/g)) {
        if (/\sas\s*=/.test(m[0])) continue
        if (arrays.some(([s, e]) => m.index > s && m.index < e)) continue
        orphans.push({ start: m.index, end: m.index + m[0].length })
    }
    return orphans
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validates draw.io XML structure for common issues
 * Uses DOM parsing + additional regex checks for high accuracy
 * @param xml - The XML string to validate
 * @param opts.strict - Also reject unknown element names and orphan
 *   <mxPoint>s. Used for XML the model wrote, not for files or browser state.
 * @returns null if valid, error message string if invalid
 */
/** The first non-blank text under el, skipping a page's compressed data */
function findTextBetweenTags(el: Element | null): string | null {
    if (!el) return null
    // A <diagram> with only text holds the page compressed
    const compressed = el.tagName === "diagram" && el.children.length === 0
    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 1) {
            const text = findTextBetweenTags(node as Element)
            if (text) return text
        } else if (
            // Text, or a CDATA section (draw.io reads it as text too)
            (node.nodeType === 3 || node.nodeType === 4) &&
            !compressed
        ) {
            const text = node.textContent?.trim()
            if (text) return text.slice(0, 40)
        }
    }
    return null
}

export function validateMxCellStructure(
    xml: string,
    opts: { strict?: boolean } = {},
): string | null {
    // Size check for performance
    if (xml.length > MAX_XML_SIZE) {
        console.warn(
            `[validateMxCellStructure] XML size (${xml.length}) exceeds ${MAX_XML_SIZE} bytes, may cause performance issues`,
        )
    }

    // 0. DOM-based checks. Syntax errors are caught by the strict check at
    // the end: linkedom's DOMParser never reports them.
    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(xml, "text/xml")

        // DOM-based checks for nested mxCell
        const allCells = doc.querySelectorAll("mxCell")
        for (const cell of allCells) {
            if (cell.parentElement?.tagName === "mxCell") {
                const id = cell.getAttribute("id") || "unknown"
                return `Invalid XML: Found nested mxCell (id="${id}"). Cells should be siblings, not nested inside other mxCell elements.`
            }
        }

        // draw.io reads any text inside a page as compressed page data and
        // then fails to open the page
        if (!doc.querySelector("parsererror")) {
            const text = findTextBetweenTags(doc.documentElement)
            if (text) {
                return `Invalid XML: Found text "${text}" between tags. Labels belong in the value attribute; remove any other text between tags.`
            }
        }
    } catch (error) {
        console.warn(
            "[validateMxCellStructure] DOMParser threw unexpected error, falling back to regex validation:",
            error,
        )
    }

    // 1. Check for CDATA wrapper (invalid at document root)
    if (/^\s*<!\[CDATA\[/.test(xml)) {
        return "Invalid XML: XML is wrapped in CDATA section - remove <![CDATA[ from start and ]]> from end"
    }

    // 2. Check for duplicate structural attributes
    const dupAttrError = checkDuplicateAttributes(xml)
    if (dupAttrError) {
        return dupAttrError
    }

    // 3. Check for unescaped < in attribute values
    const attrValuePattern = /=\s*"([^"]*)"/g
    let attrValMatch
    while ((attrValMatch = attrValuePattern.exec(xml)) !== null) {
        const value = attrValMatch[1]
        if (/</.test(value) && !/&lt;/.test(value)) {
            return "Invalid XML: Unescaped < character in attribute values. Replace < with &lt;"
        }
    }

    // 4. Check for duplicate IDs
    const dupIdError = checkDuplicateIds(xml)
    if (dupIdError) {
        return dupIdError
    }

    // 5. Check for tag mismatches
    const tagMismatchError = checkTagMismatches(xml)
    if (tagMismatchError) {
        return tagMismatchError
    }

    // 6. Check invalid character references
    const charRefError = checkCharacterReferences(xml)
    if (charRefError) {
        return charRefError
    }

    // 7. Check for invalid comment syntax (-- inside comments)
    const commentPattern = /<!--([\s\S]*?)-->/g
    let commentMatch
    while ((commentMatch = commentPattern.exec(xml)) !== null) {
        if (/--/.test(commentMatch[1])) {
            return "Invalid XML: Comment contains -- (double hyphen) which is not allowed"
        }
    }

    // 8. Check for unescaped entity references and invalid entity names
    const entityError = checkEntityReferences(xml)
    if (entityError) {
        return entityError
    }

    // 9. Check for empty id attributes on mxCell
    if (/<mxCell[^>]*\sid\s*=\s*["']\s*["'][^>]*>/g.test(xml)) {
        return "Invalid XML: Found mxCell element(s) with empty id attribute"
    }

    // 10. Check for nested mxCell tags
    const nestedCellError = checkNestedMxCells(xml)
    if (nestedCellError) {
        return nestedCellError
    }

    if (opts.strict) {
        const unknownError = checkUnknownElements(xml)
        if (unknownError) {
            return unknownError
        }
        if (findOrphanMxPoints(xml).length > 0) {
            return 'Invalid XML: Found <mxPoint> without an "as" attribute outside <Array as="points">. Put waypoints inside <Array as="points"> or remove the point.'
        }
    }

    // 11. Strict XML syntax check, run last so the checks above can give
    // more specific messages. Catches what they miss, e.g. duplicate or
    // unquoted attributes, which make draw.io refuse to load the diagram.
    const syntaxError = getXmlSyntaxError(xml)
    if (syntaxError) {
        return `Invalid XML: syntax error at ${syntaxError} Escape special characters in attribute values (&lt; for <, &amp; for &, &quot; for "), quote every attribute value, and do not repeat an attribute.`
    }

    return null
}

// ============================================================================
// Auto-Fix Function
// ============================================================================

/**
 * Attempts to auto-fix common XML issues in draw.io diagrams
 * @param xml - The XML string to fix
 * @returns Object with fixed XML and list of fixes applied
 */
export function autoFixXml(xml: string): { fixed: string; fixes: string[] } {
    let fixed = xml
    const fixes: string[] = []

    // 0. Fix JSON-escaped XML
    if (/=\\"/.test(fixed)) {
        fixed = fixed.replace(/\\"/g, '"')
        fixed = fixed.replace(/\\n/g, "\n")
        fixes.push("Fixed JSON-escaped XML")
    }

    // 0b. Literal \n, \t or \r between tags, from escaping the XML twice
    const unescaped = fixed.replace(/>(?:\s|\\[nrt])+</g, (gap) =>
        gap.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, ""),
    )
    if (unescaped !== fixed) {
        fixed = unescaped
        fixes.push("Replaced literal \\n between tags with line breaks")
    }

    // 1. Remove CDATA wrapper
    if (/^\s*<!\[CDATA\[/.test(fixed)) {
        fixed = fixed.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "")
        fixes.push("Removed CDATA wrapper")
    }

    // 2. Remove text before XML declaration or root element
    const xmlStart = fixed.search(/<(\?xml|mxGraphModel|mxfile)/i)
    if (xmlStart > 0 && !/^<[a-zA-Z]/.test(fixed.trim())) {
        fixed = fixed.substring(xmlStart)
        fixes.push("Removed text before XML root")
    }

    // 3. Fix duplicate attributes
    let dupAttrFixed = false
    const structural = new Set(STRUCTURAL_ATTRS)
    fixed = fixed.replace(/<[^>]+>/g, (tag) => {
        // Keep the first of each, drop the later ones
        const seen = new Set<string>()
        let newTag = ""
        let last = 0
        for (const attr of readAttributes(tag)) {
            if (!structural.has(attr.name)) continue
            if (!seen.has(attr.name)) {
                seen.add(attr.name)
                continue
            }
            newTag += tag.slice(last, attr.start)
            last = attr.end
            dupAttrFixed = true
        }
        return newTag + tag.slice(last)
    })
    if (dupAttrFixed) {
        fixes.push("Removed duplicate structural attributes")
    }

    // 4. Fix unescaped & characters
    const ampersandPattern =
        /&(?!(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g
    if (ampersandPattern.test(fixed)) {
        fixed = fixed.replace(
            /&(?!(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g,
            "&amp;",
        )
        fixes.push("Escaped unescaped & characters")
    }

    // 5. Fix invalid entity names (double-escaping)
    const invalidEntities = [
        { pattern: /&ampquot;/g, replacement: "&quot;", name: "&ampquot;" },
        { pattern: /&amplt;/g, replacement: "&lt;", name: "&amplt;" },
        { pattern: /&ampgt;/g, replacement: "&gt;", name: "&ampgt;" },
        { pattern: /&ampapos;/g, replacement: "&apos;", name: "&ampapos;" },
        { pattern: /&ampamp;/g, replacement: "&amp;", name: "&ampamp;" },
    ]
    for (const { pattern, replacement, name } of invalidEntities) {
        if (pattern.test(fixed)) {
            fixed = fixed.replace(pattern, replacement)
            fixes.push(`Fixed double-escaped entity ${name}`)
        }
    }

    // 6. Fix malformed attribute quotes (name=&quot;value&quot;). Quoted
    // values are matched first and kept, so &quot; inside a rich-text
    // label like value="&lt;font style=&quot;...&quot;&gt;" is left alone.
    let quotesFixed = false
    fixed = replaceInOpeningTags(fixed, (tag) =>
        tag.replace(
            /("[^"]*"|'[^']*')|(\s[a-zA-Z][a-zA-Z0-9_:-]*)=&quot;([^&]*?)&quot;/g,
            (match, quoted, name, value) => {
                if (quoted) return match
                quotesFixed = true
                return `${name}="${value}"`
            },
        ),
    )
    if (quotesFixed) {
        fixes.push("Fixed malformed attribute quotes")
    }

    // 7. Fix malformed closing tags
    const malformedClosingTag = /<\/([a-zA-Z][a-zA-Z0-9]*)\s*\/>/g
    if (malformedClosingTag.test(fixed)) {
        fixed = fixed.replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*\/>/g, "</$1>")
        fixes.push("Fixed malformed closing tags")
    }

    // 8. Fix missing space between attributes (id="2"vertex="1"). Every
    // quoted value is consumed whole, so quotes always pair up within one
    // attribute.
    let spaceAdded = false
    fixed = replaceInOpeningTags(fixed, (tag) =>
        tag.replace(
            /("[^"]*"|'[^']*')([a-zA-Z_:])?/g,
            (match, quoted, next) => {
                if (!next) return match
                spaceAdded = true
                return `${quoted} ${next}`
            },
        ),
    )
    if (spaceAdded) {
        fixes.push("Added missing space between attributes")
    }

    // 9. Fix unescaped quotes in style color values
    const quotedColorPattern = /;([a-zA-Z]*[Cc]olor)="#/
    if (quotedColorPattern.test(fixed)) {
        fixed = fixed.replace(/;([a-zA-Z]*[Cc]olor)="#/g, ";$1=#")
        fixes.push("Removed quotes around color values in style")
    }

    // 10. Fix unescaped < and > in attribute values
    // < is required to be escaped, > is not strictly required but we escape for consistency
    const attrPattern = /(=\s*")([^"]*?)(<)([^"]*?)(")/g
    let attrMatch
    let hasUnescapedLt = false
    while ((attrMatch = attrPattern.exec(fixed)) !== null) {
        if (!attrMatch[3].startsWith("&lt;")) {
            hasUnescapedLt = true
            break
        }
    }
    if (hasUnescapedLt) {
        fixed = fixed.replace(/=\s*"([^"]*)"/g, (_match, value) => {
            const escaped = value.replace(/</g, "&lt;").replace(/>/g, "&gt;")
            return `="${escaped}"`
        })
        fixes.push("Escaped <> characters in attribute values")
    }

    // 11. Fix invalid hex character references
    const invalidHexRefs: string[] = []
    fixed = fixed.replace(/&#x([^;]*);/g, (match, hex) => {
        if (/^[0-9a-fA-F]+$/.test(hex) && hex.length > 0) {
            return match
        }
        invalidHexRefs.push(match)
        return ""
    })
    if (invalidHexRefs.length > 0) {
        fixes.push(
            `Removed ${invalidHexRefs.length} invalid hex character reference(s)`,
        )
    }

    // 12. Fix invalid decimal character references
    const invalidDecRefs: string[] = []
    fixed = fixed.replace(/&#([^x][^;]*);/g, (match, dec) => {
        if (/^[0-9]+$/.test(dec) && dec.length > 0) {
            return match
        }
        invalidDecRefs.push(match)
        return ""
    })
    if (invalidDecRefs.length > 0) {
        fixes.push(
            `Removed ${invalidDecRefs.length} invalid decimal character reference(s)`,
        )
    }

    // 13. Fix invalid comment syntax
    fixed = fixed.replace(/<!--([\s\S]*?)-->/g, (match, content) => {
        if (/--/.test(content)) {
            let fixedContent = content
            while (/--/.test(fixedContent)) {
                fixedContent = fixedContent.replace(/--/g, "-")
            }
            fixes.push("Fixed invalid comment syntax")
            return `<!--${fixedContent}-->`
        }
        return match
    })

    // 14. Fix <Cell> tags to <mxCell>
    const hasCellTags = /<\/?Cell[\s>]/i.test(fixed)
    if (hasCellTags) {
        fixed = fixed.replace(/<Cell(\s)/gi, "<mxCell$1")
        fixed = fixed.replace(/<Cell>/gi, "<mxCell>")
        fixed = fixed.replace(/<\/Cell>/gi, "</mxCell>")
        fixes.push("Fixed <Cell> tags to <mxCell>")
    }

    // 15. Fix closing tag typos and wrong tag case, e.g. <mxcell> (MUST run
    // before foreign tag removal, which would otherwise delete them)
    const before15 = fixed
    fixed = fixed.replace(/<\/mxElement>/gi, "</mxCell>")
    if (fixed !== before15) {
        fixes.push("Fixed typo </mxElement> to </mxCell>")
    }
    for (const name of ["mxCell", "mxGeometry", "mxPoint", "mxGraphModel"]) {
        let changed = false
        fixed = fixed.replace(
            new RegExp(`<(/?)${name}(?=[\\s/>])`, "gi"),
            (match, slash) => {
                const right = `<${slash}${name}`
                if (match !== right) changed = true
                return right
            },
        )
        if (changed) {
            fixes.push(`Fixed tag case of <${name}>`)
        }
    }

    // 16. Remove non-draw.io tags (after the case fixes above). Removes only
    // the exact tag occurrences and skips quoted attribute values, so a stray
    // <mxGraph/> never takes <mxGraphModel> with it and <b> inside
    // value="..." stays.
    const isInsideQuotesFor16 = createQuoteTracker(fixed)
    const foreignTagPattern = /<\/?([a-zA-Z][a-zA-Z0-9_]*)[^>]*>/g
    let foreignMatch
    const foreignTags = new Set<string>()
    const foreignTagPositions: Array<{ start: number; end: number }> = []
    while ((foreignMatch = foreignTagPattern.exec(fixed)) !== null) {
        const tagName = foreignMatch[1]
        if (VALID_DRAWIO_TAGS.has(tagName)) continue
        if (isInsideQuotesFor16(foreignMatch.index)) continue
        foreignTags.add(tagName)
        foreignTagPositions.push({
            start: foreignMatch.index,
            end: foreignMatch.index + foreignMatch[0].length,
        })
    }
    if (foreignTagPositions.length > 0) {
        // Remove from the end so earlier positions stay valid
        for (const { start, end } of foreignTagPositions.reverse()) {
            fixed = fixed.slice(0, start) + fixed.slice(end)
        }
        fixes.push(
            `Removed foreign tags: ${Array.from(foreignTags).join(", ")}`,
        )
    }

    // 16b. Remove orphan <mxPoint>s (no "as" attribute, not inside
    // <Array as="points">), which draw.io refuses to load
    const orphanPoints = findOrphanMxPoints(fixed)
    if (orphanPoints.length > 0) {
        for (const { start, end } of orphanPoints.reverse()) {
            fixed = fixed.slice(0, start) + fixed.slice(end)
        }
        fixes.push(`Removed ${orphanPoints.length} orphan <mxPoint>(s)`)
    }

    // 17. Fix unclosed tags
    const tagStack: string[] = []
    const parsedTags = parseXmlTags(fixed)

    for (const { tagName, isClosing, isSelfClosing } of parsedTags) {
        if (isClosing) {
            const lastIdx = tagStack.lastIndexOf(tagName)
            if (lastIdx !== -1) {
                tagStack.splice(lastIdx, 1)
            }
        } else if (!isSelfClosing) {
            tagStack.push(tagName)
        }
    }

    if (tagStack.length > 0) {
        const tagsToClose: string[] = []
        for (const tagName of tagStack.reverse()) {
            const openCount = (
                fixed.match(new RegExp(`<${tagName}[\\s>]`, "gi")) || []
            ).length
            const closeCount = (
                fixed.match(new RegExp(`</${tagName}>`, "gi")) || []
            ).length
            if (openCount > closeCount) {
                tagsToClose.push(tagName)
            }
        }
        if (tagsToClose.length > 0) {
            const closingTags = tagsToClose.map((t) => `</${t}>`).join("\n")
            fixed = fixed.trimEnd() + "\n" + closingTags
            fixes.push(
                `Closed ${tagsToClose.length} unclosed tag(s): ${tagsToClose.join(", ")}`,
            )
        }
    }

    // 18. Remove extra closing tags. Counts only draw.io tags outside quoted
    // attribute values (value="<b>Title</b>" holds HTML, not elements).
    const tagCounts = new Map<
        string,
        { opens: number; closes: number; selfClosing: number }
    >()
    const fullTagPattern = /<(\/?[a-zA-Z][a-zA-Z0-9]*)[^>]*>/g
    const isInsideQuotesFor18 = createQuoteTracker(fixed)
    let tagCountMatch
    while ((tagCountMatch = fullTagPattern.exec(fixed)) !== null) {
        if (isInsideQuotesFor18(tagCountMatch.index)) continue
        const fullMatch = tagCountMatch[0]
        const tagPart = tagCountMatch[1]
        const isClosing = tagPart.startsWith("/")
        const isSelfClosing = fullMatch.endsWith("/>")
        const tagName = isClosing ? tagPart.slice(1) : tagPart
        if (!VALID_DRAWIO_TAGS.has(tagName)) continue

        let counts = tagCounts.get(tagName)
        if (!counts) {
            counts = { opens: 0, closes: 0, selfClosing: 0 }
            tagCounts.set(tagName, counts)
        }
        if (isClosing) {
            counts.closes++
        } else if (isSelfClosing) {
            counts.selfClosing++
        } else {
            counts.opens++
        }
    }

    for (const [tagName, counts] of tagCounts) {
        const extraCloses = counts.closes - counts.opens
        if (extraCloses > 0) {
            let removed = 0
            const closeTagPattern = new RegExp(`</${tagName}>`, "g")
            const matches = [...fixed.matchAll(closeTagPattern)]
            for (
                let i = matches.length - 1;
                i >= 0 && removed < extraCloses;
                i--
            ) {
                const match = matches[i]
                const idx = match.index ?? 0
                fixed = fixed.slice(0, idx) + fixed.slice(idx + match[0].length)
                removed++
            }
            if (removed > 0) {
                fixes.push(
                    `Removed ${removed} extra </${tagName}> closing tag(s)`,
                )
            }
        }
    }

    // 19. Remove trailing garbage after last XML tag
    const closingTagPattern = /<\/[a-zA-Z][a-zA-Z0-9]*>|\/>/g
    let lastValidTagEnd = -1
    let closingMatch
    while ((closingMatch = closingTagPattern.exec(fixed)) !== null) {
        lastValidTagEnd = closingMatch.index + closingMatch[0].length
    }
    if (lastValidTagEnd > 0 && lastValidTagEnd < fixed.length) {
        const trailing = fixed.slice(lastValidTagEnd).trim()
        if (trailing) {
            fixed = fixed.slice(0, lastValidTagEnd)
            fixes.push("Removed trailing garbage after last XML tag")
        }
    }

    // 20. Fix nested mxCell by flattening
    const lines = fixed.split("\n")
    let newLines: string[] = []
    let nestedFixed = 0
    let extraClosingToRemove = 0

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const nextLine = lines[i + 1]

        if (
            nextLine &&
            /<mxCell\s/.test(line) &&
            /<mxCell\s/.test(nextLine) &&
            !line.includes("/>") &&
            !nextLine.includes("/>")
        ) {
            const id1 = line.match(/\bid\s*=\s*["']([^"']+)["']/)?.[1]
            const id2 = nextLine.match(/\bid\s*=\s*["']([^"']+)["']/)?.[1]

            if (id1 && id1 === id2) {
                nestedFixed++
                extraClosingToRemove++
                continue
            }
        }

        if (extraClosingToRemove > 0 && /^\s*<\/mxCell>\s*$/.test(line)) {
            extraClosingToRemove--
            continue
        }

        newLines.push(line)
    }

    if (nestedFixed > 0) {
        fixed = newLines.join("\n")
        fixes.push(`Flattened ${nestedFixed} duplicate-ID nested mxCell(s)`)
    }

    // 21. Fix true nested mxCell (different IDs). Runs only when the nesting
    // check finds real nesting, because this line-based rewrite can break
    // valid cells written over several lines.
    const lines2 = checkNestedMxCells(fixed) ? fixed.split("\n") : []
    newLines = []
    let trueNestedFixed = 0
    let cellDepth = 0
    let pendingCloseRemoval = 0

    for (let i = 0; i < lines2.length; i++) {
        const line = lines2[i]
        const trimmed = line.trim()

        // A line holding a whole cell (<mxCell ...>...</mxCell>) opens nothing
        const isOpenCell =
            /<mxCell\s/.test(trimmed) &&
            !trimmed.endsWith("/>") &&
            !trimmed.endsWith("</mxCell>")
        const isCloseCell = trimmed === "</mxCell>"

        if (isOpenCell) {
            if (cellDepth > 0) {
                const indent = line.match(/^(\s*)/)?.[1] || ""
                newLines.push(indent + "</mxCell>")
                trueNestedFixed++
                pendingCloseRemoval++
            }
            cellDepth = 1
            newLines.push(line)
        } else if (isCloseCell) {
            if (pendingCloseRemoval > 0) {
                pendingCloseRemoval--
            } else {
                cellDepth = Math.max(0, cellDepth - 1)
                newLines.push(line)
            }
        } else {
            newLines.push(line)
        }
    }

    if (trueNestedFixed > 0) {
        fixed = newLines.join("\n")
        fixes.push(`Fixed ${trueNestedFixed} true nested mxCell(s)`)
    }

    // 22. Fix duplicate IDs by appending suffix.
    // Skipped for multi-page <mxfile> documents — cell ids "0" and "1" repeat
    // across pages legitimately (every page has its own <root> with id="0"/"1"
    // sentinel cells). Renaming them would break drawio's parent references.
    // For mxfile inputs, duplicate-id validation is page-scoped in
    // checkDuplicateIds() and a true duplicate produces a hard error rather
    // than a silent rename.
    if (!/<mxfile[\s>]/i.test(fixed)) {
        const seenIds = new Map<string, number>()
        const duplicateIds: string[] = []

        const idPattern = /\bid\s*=\s*["']([^"']+)["']/gi
        let idMatch
        while ((idMatch = idPattern.exec(fixed)) !== null) {
            const id = idMatch[1]
            seenIds.set(id, (seenIds.get(id) || 0) + 1)
        }

        for (const [id, count] of seenIds) {
            if (count > 1) duplicateIds.push(id)
        }

        if (duplicateIds.length > 0) {
            const idCounters = new Map<string, number>()
            // Rebuild from the captured parts so only the value changes (an id
            // like "d" or "i" also occurs in the attribute name itself)
            fixed = fixed.replace(
                /(\bid\s*=\s*["'])([^"']+)(["'])/gi,
                (match, before, id, after) => {
                    if (!duplicateIds.includes(id)) return match

                    const count = idCounters.get(id) || 0
                    idCounters.set(id, count + 1)

                    if (count === 0) return match

                    return `${before}${id}_dup${count}${after}`
                },
            )
            fixes.push(`Renamed ${duplicateIds.length} duplicate ID(s)`)
        }
    }

    // 23. Fix empty id attributes
    let emptyIdCount = 0
    fixed = fixed.replace(
        /<mxCell([^>]*)\sid\s*=\s*["']\s*["']([^>]*)>/g,
        (_match, before, after) => {
            emptyIdCount++
            const newId = `cell_${Date.now()}_${emptyIdCount}`
            return `<mxCell${before} id="${newId}"${after}>`
        },
    )
    if (emptyIdCount > 0) {
        fixes.push(`Generated ${emptyIdCount} missing ID(s)`)
    }

    return { fixed, fixes }
}

// ============================================================================
// Combined Validation and Fix
// ============================================================================

/**
 * Validates XML and attempts to fix if invalid. By default runs the strict
 * checks (unknown elements, orphan mxPoints), meant for XML the model wrote.
 * Pass strict: false for a diagram that also holds the user's own content.
 * @param xml - The XML string to validate and potentially fix
 * @returns Object with validation result, fixed XML if applicable, and fixes applied
 */
export function validateAndFixXml(
    xml: string,
    { strict = true }: { strict?: boolean } = {},
): {
    valid: boolean
    error: string | null
    fixed: string | null
    fixes: string[]
} {
    // First validation attempt
    let error = validateMxCellStructure(xml, { strict })

    if (!error) {
        return { valid: true, error: null, fixed: null, fixes: [] }
    }

    // Try to fix
    const { fixed, fixes } = autoFixXml(xml)

    // Validate the fixed version
    error = validateMxCellStructure(fixed, { strict })

    if (!error) {
        return { valid: true, error: null, fixed, fixes }
    }

    // Still invalid after fixes
    return {
        valid: false,
        error,
        fixed: fixes.length > 0 ? fixed : null,
        fixes,
    }
}
