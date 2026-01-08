/**
 * XML Validation and Auto-Fix for draw.io diagrams
 * Copied from lib/utils.ts to avoid cross-package imports
 */

// ============================================================================
// Constants
// ============================================================================

/** Maximum XML size to process (1MB) - larger XMLs may cause performance issues */
const MAX_XML_SIZE = 1_000_000

/** Maximum iterations for aggressive cell dropping to prevent infinite loops */
const MAX_DROP_ITERATIONS = 10

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

// ============================================================================
// Validation Helper Functions
// ============================================================================

/** Check for duplicate structural attributes in a tag */
function checkDuplicateAttributes(xml: string): string | null {
    const structuralSet = new Set(STRUCTURAL_ATTRS)
    const tagPattern = /<[^>]+>/g
    let tagMatch
    while ((tagMatch = tagPattern.exec(xml)) !== null) {
        const tag = tagMatch[0]
        const attrPattern = /\s([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=/g
        const attributes = new Map<string, number>()
        let attrMatch
        while ((attrMatch = attrPattern.exec(tag)) !== null) {
            const attrName = attrMatch[1]
            attributes.set(attrName, (attributes.get(attrName) || 0) + 1)
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

/** Check for duplicate IDs in XML */
function checkDuplicateIds(xml: string): string | null {
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

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validates draw.io XML structure for common issues
 * Uses DOM parsing + additional regex checks for high accuracy
 * @param xml - The XML string to validate
 * @returns null if valid, error message string if invalid
 */
export function validateMxCellStructure(xml: string): string | null {
    // Size check for performance
    if (xml.length > MAX_XML_SIZE) {
        console.warn(
            `[validateMxCellStructure] XML size (${xml.length}) exceeds ${MAX_XML_SIZE} bytes, may cause performance issues`,
        )
    }

    // 0. First use DOM parser to catch syntax errors (most accurate)
    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(xml, "text/xml")
        const parseError = doc.querySelector("parsererror")
        if (parseError) {
            return `Invalid XML: The XML contains syntax errors (likely unescaped special characters like <, >, & in attribute values). Please escape special characters: use &lt; for <, &gt; for >, &amp; for &, &quot; for ". Regenerate the diagram with properly escaped values.`
        }

        // DOM-based checks for nested mxCell
        const allCells = doc.querySelectorAll("mxCell")
        for (const cell of allCells) {
            if (cell.parentElement?.tagName === "mxCell") {
                const id = cell.getAttribute("id") || "unknown"
                return `Invalid XML: Found nested mxCell (id="${id}"). Cells should be siblings, not nested inside other mxCell elements.`
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
    fixed = fixed.replace(/<[^>]+>/g, (tag) => {
        let newTag = tag
        for (const attr of STRUCTURAL_ATTRS) {
            const attrRegex = new RegExp(
                `\\s${attr}\\s*=\\s*["'][^"']*["']`,
                "gi",
            )
            const matches = tag.match(attrRegex)
            if (matches && matches.length > 1) {
                let firstKept = false
                newTag = newTag.replace(attrRegex, (m) => {
                    if (!firstKept) {
                        firstKept = true
                        return m
                    }
                    dupAttrFixed = true
                    return ""
                })
            }
        }
        return newTag
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

    // 6. Fix malformed attribute quotes
    const malformedQuotePattern = /(\s[a-zA-Z][a-zA-Z0-9_:-]*)=&quot;/
    if (malformedQuotePattern.test(fixed)) {
        fixed = fixed.replace(
            /(\s[a-zA-Z][a-zA-Z0-9_:-]*)=&quot;([^&]*?)&quot;/g,
            '$1="$2"',
        )
        fixes.push("Fixed malformed attribute quotes")
    }

    // 7. Fix malformed closing tags
    const malformedClosingTag = /<\/([a-zA-Z][a-zA-Z0-9]*)\s*\/>/g
    if (malformedClosingTag.test(fixed)) {
        fixed = fixed.replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*\/>/g, "</$1>")
        fixes.push("Fixed malformed closing tags")
    }

    // 8. Fix missing space between attributes
    const missingSpacePattern = /("[^"]*")([a-zA-Z][a-zA-Z0-9_:-]*=)/g
    if (missingSpacePattern.test(fixed)) {
        fixed = fixed.replace(/("[^"]*")([a-zA-Z][a-zA-Z0-9_:-]*=)/g, "$1 $2")
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

    // 15. Fix common closing tag typos (MUST run before foreign tag removal)
    const tagTypos = [
        { wrong: /<\/mxElement>/gi, right: "</mxCell>", name: "</mxElement>" },
        { wrong: /<\/mxcell>/g, right: "</mxCell>", name: "</mxcell>" },
        {
            wrong: /<\/mxgeometry>/g,
            right: "</mxGeometry>",
            name: "</mxgeometry>",
        },
        { wrong: /<\/mxpoint>/g, right: "</mxPoint>", name: "</mxpoint>" },
        {
            wrong: /<\/mxgraphmodel>/gi,
            right: "</mxGraphModel>",
            name: "</mxgraphmodel>",
        },
    ]
    for (const { wrong, right, name } of tagTypos) {
        const before = fixed
        fixed = fixed.replace(wrong, right)
        if (fixed !== before) {
            fixes.push(`Fixed typo ${name} to ${right}`)
        }
    }

    // 16. Remove non-draw.io tags (after typo fixes so lowercase variants are fixed first)
    const validDrawioTags = new Set([
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
    ])
    const foreignTagPattern = /<\/?([a-zA-Z][a-zA-Z0-9_]*)[^>]*>/g
    let foreignMatch
    const foreignTags = new Set<string>()
    while ((foreignMatch = foreignTagPattern.exec(fixed)) !== null) {
        const tagName = foreignMatch[1]
        if (!validDrawioTags.has(tagName)) {
            foreignTags.add(tagName)
        }
    }
    if (foreignTags.size > 0) {
        for (const tag of foreignTags) {
            fixed = fixed.replace(new RegExp(`<${tag}[^>]*>`, "gi"), "")
            fixed = fixed.replace(new RegExp(`</${tag}>`, "gi"), "")
        }
        fixes.push(
            `Removed foreign tags: ${Array.from(foreignTags).join(", ")}`,
        )
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

    // 18. Remove extra closing tags
    const tagCounts = new Map<
        string,
        { opens: number; closes: number; selfClosing: number }
    >()
    const fullTagPattern = /<(\/?[a-zA-Z][a-zA-Z0-9]*)[^>]*>/g
    let tagCountMatch
    while ((tagCountMatch = fullTagPattern.exec(fixed)) !== null) {
        const fullMatch = tagCountMatch[0]
        const tagPart = tagCountMatch[1]
        const isClosing = tagPart.startsWith("/")
        const isSelfClosing = fullMatch.endsWith("/>")
        const tagName = isClosing ? tagPart.slice(1) : tagPart

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

    // 21. Fix true nested mxCell (different IDs)
    const lines2 = fixed.split("\n")
    newLines = []
    let trueNestedFixed = 0
    let cellDepth = 0
    let pendingCloseRemoval = 0

    for (let i = 0; i < lines2.length; i++) {
        const line = lines2[i]
        const trimmed = line.trim()

        const isOpenCell = /<mxCell\s/.test(trimmed) && !trimmed.endsWith("/>")
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

    // 22. Fix duplicate IDs by appending suffix
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
        fixed = fixed.replace(/\bid\s*=\s*["']([^"']+)["']/gi, (match, id) => {
            if (!duplicateIds.includes(id)) return match

            const count = idCounters.get(id) || 0
            idCounters.set(id, count + 1)

            if (count === 0) return match

            const newId = `${id}_dup${count}`
            return match.replace(id, newId)
        })
        fixes.push(`Renamed ${duplicateIds.length} duplicate ID(s)`)
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

    // 24. Aggressive: drop broken mxCell elements
    if (typeof DOMParser !== "undefined") {
        let droppedCells = 0
        let maxIterations = MAX_DROP_ITERATIONS
        while (maxIterations-- > 0) {
            const parser = new DOMParser()
            const doc = parser.parseFromString(fixed, "text/xml")
            const parseError = doc.querySelector("parsererror")
            if (!parseError) break

            const errText = parseError.textContent || ""
            const match = errText.match(/(\d+):\d+:/)
            if (!match) break

            const errLine = parseInt(match[1], 10) - 1
            const lines = fixed.split("\n")

            let cellStart = errLine
            let cellEnd = errLine

            while (cellStart > 0 && !lines[cellStart].includes("<mxCell")) {
                cellStart--
            }

            while (cellEnd < lines.length - 1) {
                if (
                    lines[cellEnd].includes("</mxCell>") ||
                    lines[cellEnd].trim().endsWith("/>")
                ) {
                    break
                }
                cellEnd++
            }

            lines.splice(cellStart, cellEnd - cellStart + 1)
            fixed = lines.join("\n")
            droppedCells++
        }
        if (droppedCells > 0) {
            fixes.push(`Dropped ${droppedCells} unfixable mxCell element(s)`)
        }
    }

    return { fixed, fixes }
}

// ============================================================================
// Combined Validation and Fix
// ============================================================================

/**
 * Validates XML and attempts to fix if invalid
 * @param xml - The XML string to validate and potentially fix
 * @returns Object with validation result, fixed XML if applicable, and fixes applied
 */
export function validateAndFixXml(xml: string): {
    valid: boolean
    error: string | null
    fixed: string | null
    fixes: string[]
} {
    // First validation attempt
    let error = validateMxCellStructure(xml)

    if (!error) {
        return { valid: true, error: null, fixed: null, fixes: [] }
    }

    // Try to fix
    const { fixed, fixes } = autoFixXml(xml)

    // Validate the fixed version
    error = validateMxCellStructure(fixed)

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

/**
 * Check if mxCell XML output is complete (not truncated).
 * Uses a robust approach that handles any LLM provider's wrapper tags
 * by finding the last valid mxCell ending and checking if suffix is just closing tags.
 * @param xml - The XML string to check (can be undefined/null)
 * @returns true if XML appears complete, false if truncated or empty
 */
export function isMxCellXmlComplete(xml: string | undefined | null): boolean {
    const trimmed = xml?.trim() || ""
    if (!trimmed) return false

    // Find position of last complete mxCell ending (either /> or </mxCell>)
    const lastSelfClose = trimmed.lastIndexOf("/>")
    const lastMxCellClose = trimmed.lastIndexOf("</mxCell>")

    const lastValidEnd = Math.max(lastSelfClose, lastMxCellClose)

    // No valid ending found at all
    if (lastValidEnd === -1) return false

    // Check what comes after the last valid ending
    // For />: add 2 chars, for </mxCell>: add 9 chars
    const endOffset = lastMxCellClose > lastSelfClose ? 9 : 2
    const suffix = trimmed.slice(lastValidEnd + endOffset)

    // If suffix is empty or only contains closing tags (any provider's wrapper) or whitespace, it's complete
    // This regex matches any sequence of closing XML tags like </foo>, </bar>, </｜DSML｜xyz>
    return /^(\s*<\/[^>]+>)*\s*$/.test(suffix)
}
