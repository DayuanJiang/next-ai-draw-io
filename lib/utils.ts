import { type ClassValue, clsx } from "clsx"
import * as pako from "pako"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Format XML string with proper indentation and line breaks
 * @param xml - The XML string to format
 * @param indent - The indentation string (default: '  ')
 * @returns Formatted XML string
 */
export function formatXML(xml: string, indent: string = "  "): string {
    let formatted = ""
    let pad = 0

    // Remove existing whitespace between tags
    xml = xml.replace(/>\s*</g, "><").trim()

    // Split on tags
    const tags = xml.split(/(?=<)|(?<=>)/g).filter(Boolean)

    tags.forEach((node) => {
        if (node.match(/^<\/\w/)) {
            // Closing tag - decrease indent
            pad = Math.max(0, pad - 1)
            formatted += indent.repeat(pad) + node + "\n"
        } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
            // Opening tag
            formatted += indent.repeat(pad) + node
            // Only add newline if next item is a tag
            const nextIndex = tags.indexOf(node) + 1
            if (nextIndex < tags.length && tags[nextIndex].startsWith("<")) {
                formatted += "\n"
                if (!node.match(/^<\w[^>]*\/>$/)) {
                    pad++
                }
            }
        } else if (node.match(/^<\w[^>]*\/>$/)) {
            // Self-closing tag
            formatted += indent.repeat(pad) + node + "\n"
        } else if (node.startsWith("<")) {
            // Other tags (like <?xml)
            formatted += indent.repeat(pad) + node + "\n"
        } else {
            // Text content
            formatted += node
        }
    })

    return formatted.trim()
}

/**
 * Efficiently converts a potentially incomplete XML string to a legal XML string by closing any open tags properly.
 * Additionally, if an <mxCell> tag does not have an mxGeometry child (e.g. <mxCell id="3">),
 * it removes that tag from the output.
 * Also removes orphaned <mxPoint> elements that aren't inside <Array> or don't have proper 'as' attribute.
 * @param xmlString The potentially incomplete XML string
 * @returns A legal XML string with properly closed tags and removed incomplete mxCell elements.
 */
export function convertToLegalXml(xmlString: string): string {
    // This regex will match either self-closing <mxCell .../> or a block element
    // <mxCell ...> ... </mxCell>. Unfinished ones are left out because they don't match.
    const regex = /<mxCell\b[^>]*(?:\/>|>([\s\S]*?)<\/mxCell>)/g
    let match: RegExpExecArray | null
    let result = "<root>\n"

    while ((match = regex.exec(xmlString)) !== null) {
        // match[0] contains the entire matched mxCell block
        let cellContent = match[0]

        // Remove orphaned <mxPoint> elements that are directly inside <mxGeometry>
        // without an 'as' attribute (like as="sourcePoint", as="targetPoint")
        // and not inside <Array as="points">
        // These cause "Could not add object mxPoint" errors in draw.io
        // First check if there's an <Array as="points"> - if so, keep all mxPoints inside it
        const hasArrayPoints = /<Array\s+as="points">/.test(cellContent)
        if (!hasArrayPoints) {
            // Remove mxPoint elements without 'as' attribute
            cellContent = cellContent.replace(
                /<mxPoint\b[^>]*\/>/g,
                (pointMatch) => {
                    // Keep if it has an 'as' attribute
                    if (/\sas=/.test(pointMatch)) {
                        return pointMatch
                    }
                    // Remove orphaned mxPoint
                    return ""
                },
            )
        }

        // Indent each line of the matched block for readability.
        const formatted = cellContent
            .split("\n")
            .map((line) => "    " + line.trim())
            .filter((line) => line.trim()) // Remove empty lines from removed mxPoints
            .join("\n")
        result += formatted + "\n"
    }
    result += "</root>"

    return result
}

/**
 * Wrap XML content with the full mxfile structure required by draw.io.
 * Handles cases where XML is just <root>, <mxGraphModel>, or already has <mxfile>.
 * @param xml - The XML string (may be partial or complete)
 * @returns Full mxfile-wrapped XML string
 */
export function wrapWithMxFile(xml: string): string {
    if (!xml) {
        return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
    }

    // Already has full structure
    if (xml.includes("<mxfile")) {
        return xml
    }

    // Has mxGraphModel but not mxfile
    if (xml.includes("<mxGraphModel")) {
        return `<mxfile><diagram name="Page-1" id="page-1">${xml}</diagram></mxfile>`
    }

    // Just <root> content - extract inner content and wrap fully
    const rootContent = xml.replace(/<\/?root>/g, "").trim()
    return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root>${rootContent}</root></mxGraphModel></diagram></mxfile>`
}

/**
 * Replace nodes in a Draw.io XML diagram
 * @param currentXML - The original Draw.io XML string
 * @param nodes - The XML string containing new nodes to replace in the diagram
 * @returns The updated XML string with replaced nodes
 */
export function replaceNodes(currentXML: string, nodes: string): string {
    // Check for valid inputs
    if (!currentXML || !nodes) {
        throw new Error("Both currentXML and nodes must be provided")
    }

    try {
        // Parse the XML strings to create DOM objects
        const parser = new DOMParser()
        const currentDoc = parser.parseFromString(currentXML, "text/xml")

        // Handle nodes input - if it doesn't contain <root>, wrap it
        let nodesString = nodes
        if (!nodes.includes("<root>")) {
            nodesString = `<root>${nodes}</root>`
        }

        const nodesDoc = parser.parseFromString(nodesString, "text/xml")

        // Find the root element in the current document
        let currentRoot = currentDoc.querySelector("mxGraphModel > root")
        if (!currentRoot) {
            // If no root element is found, create the proper structure
            const mxGraphModel =
                currentDoc.querySelector("mxGraphModel") ||
                currentDoc.createElement("mxGraphModel")

            if (!currentDoc.contains(mxGraphModel)) {
                currentDoc.appendChild(mxGraphModel)
            }

            currentRoot = currentDoc.createElement("root")
            mxGraphModel.appendChild(currentRoot)
        }

        // Find the root element in the nodes document
        const nodesRoot = nodesDoc.querySelector("root")
        if (!nodesRoot) {
            throw new Error(
                "Invalid nodes: Could not find or create <root> element",
            )
        }

        // Clear all existing child elements from the current root
        while (currentRoot.firstChild) {
            currentRoot.removeChild(currentRoot.firstChild)
        }

        // Ensure the base cells exist
        const hasCell0 = Array.from(nodesRoot.childNodes).some(
            (node) =>
                node.nodeName === "mxCell" &&
                (node as Element).getAttribute("id") === "0",
        )

        const hasCell1 = Array.from(nodesRoot.childNodes).some(
            (node) =>
                node.nodeName === "mxCell" &&
                (node as Element).getAttribute("id") === "1",
        )

        // Copy all child nodes from the nodes root to the current root
        Array.from(nodesRoot.childNodes).forEach((node) => {
            const importedNode = currentDoc.importNode(node, true)
            currentRoot.appendChild(importedNode)
        })

        // Add default cells if they don't exist
        if (!hasCell0) {
            const cell0 = currentDoc.createElement("mxCell")
            cell0.setAttribute("id", "0")
            currentRoot.insertBefore(cell0, currentRoot.firstChild)
        }

        if (!hasCell1) {
            const cell1 = currentDoc.createElement("mxCell")
            cell1.setAttribute("id", "1")
            cell1.setAttribute("parent", "0")

            // Insert after cell0 if possible
            const cell0 = currentRoot.querySelector('mxCell[id="0"]')
            if (cell0?.nextSibling) {
                currentRoot.insertBefore(cell1, cell0.nextSibling)
            } else {
                currentRoot.appendChild(cell1)
            }
        }

        // Convert the modified DOM back to a string
        const serializer = new XMLSerializer()
        return serializer.serializeToString(currentDoc)
    } catch (error) {
        throw new Error(`Error replacing nodes: ${error}`)
    }
}

/**
 * Create a character count dictionary from a string
 * Used for attribute-order agnostic comparison
 */
function charCountDict(str: string): Map<string, number> {
    const dict = new Map<string, number>()
    for (const char of str) {
        dict.set(char, (dict.get(char) || 0) + 1)
    }
    return dict
}

/**
 * Compare two strings by character frequency (order-agnostic)
 */
function sameCharFrequency(a: string, b: string): boolean {
    const trimmedA = a.trim()
    const trimmedB = b.trim()
    if (trimmedA.length !== trimmedB.length) return false

    const dictA = charCountDict(trimmedA)
    const dictB = charCountDict(trimmedB)

    if (dictA.size !== dictB.size) return false

    for (const [char, count] of dictA) {
        if (dictB.get(char) !== count) return false
    }
    return true
}

/**
 * Replace specific parts of XML content using search and replace pairs
 * @param xmlContent - The original XML string
 * @param searchReplacePairs - Array of {search: string, replace: string} objects
 * @returns The updated XML string with replacements applied
 */
export function replaceXMLParts(
    xmlContent: string,
    searchReplacePairs: Array<{ search: string; replace: string }>,
): string {
    // Format the XML first to ensure consistent line breaks
    let result = formatXML(xmlContent)

    for (const { search, replace } of searchReplacePairs) {
        // Also format the search content for consistency
        const formattedSearch = formatXML(search)
        const searchLines = formattedSearch.split("\n")

        // Split into lines for exact line matching
        const resultLines = result.split("\n")

        // Remove trailing empty line if exists (from the trailing \n in search content)
        if (searchLines[searchLines.length - 1] === "") {
            searchLines.pop()
        }

        // Always search from the beginning - pairs may not be in document order
        const startLineNum = 0

        // Try to find match using multiple strategies
        let matchFound = false
        let matchStartLine = -1
        let matchEndLine = -1

        // First try: exact match
        for (
            let i = startLineNum;
            i <= resultLines.length - searchLines.length;
            i++
        ) {
            let matches = true

            for (let j = 0; j < searchLines.length; j++) {
                if (resultLines[i + j] !== searchLines[j]) {
                    matches = false
                    break
                }
            }

            if (matches) {
                matchStartLine = i
                matchEndLine = i + searchLines.length
                matchFound = true
                break
            }
        }

        // Second try: line-trimmed match (fallback)
        if (!matchFound) {
            for (
                let i = startLineNum;
                i <= resultLines.length - searchLines.length;
                i++
            ) {
                let matches = true

                for (let j = 0; j < searchLines.length; j++) {
                    const originalTrimmed = resultLines[i + j].trim()
                    const searchTrimmed = searchLines[j].trim()

                    if (originalTrimmed !== searchTrimmed) {
                        matches = false
                        break
                    }
                }

                if (matches) {
                    matchStartLine = i
                    matchEndLine = i + searchLines.length
                    matchFound = true
                    break
                }
            }
        }

        // Third try: substring match as last resort (for single-line XML)
        if (!matchFound) {
            // Try to find as a substring in the entire content
            const searchStr = search.trim()
            const resultStr = result
            const index = resultStr.indexOf(searchStr)

            if (index !== -1) {
                // Found as substring - replace it
                result =
                    resultStr.substring(0, index) +
                    replace.trim() +
                    resultStr.substring(index + searchStr.length)
                // Re-format after substring replacement
                result = formatXML(result)
                continue // Skip the line-based replacement below
            }
        }

        // Fourth try: character frequency match (attribute-order agnostic)
        // This handles cases where the model generates XML with different attribute order
        if (!matchFound) {
            for (
                let i = startLineNum;
                i <= resultLines.length - searchLines.length;
                i++
            ) {
                let matches = true

                for (let j = 0; j < searchLines.length; j++) {
                    if (
                        !sameCharFrequency(resultLines[i + j], searchLines[j])
                    ) {
                        matches = false
                        break
                    }
                }

                if (matches) {
                    matchStartLine = i
                    matchEndLine = i + searchLines.length
                    matchFound = true
                    break
                }
            }
        }

        // Fifth try: Match by mxCell id attribute
        // Extract id from search pattern and find the element with that id
        if (!matchFound) {
            const idMatch = search.match(/id="([^"]+)"/)
            if (idMatch) {
                const searchId = idMatch[1]
                // Find lines that contain this id
                for (let i = startLineNum; i < resultLines.length; i++) {
                    if (resultLines[i].includes(`id="${searchId}"`)) {
                        // Found the element with matching id
                        // Now find the extent of this element (it might span multiple lines)
                        let endLine = i + 1
                        const line = resultLines[i].trim()

                        // Check if it's a self-closing tag or has children
                        if (!line.endsWith("/>")) {
                            // Find the closing tag or the end of the mxCell block
                            let depth = 1
                            while (endLine < resultLines.length && depth > 0) {
                                const currentLine = resultLines[endLine].trim()
                                if (
                                    currentLine.startsWith("<") &&
                                    !currentLine.startsWith("</") &&
                                    !currentLine.endsWith("/>")
                                ) {
                                    depth++
                                } else if (currentLine.startsWith("</")) {
                                    depth--
                                }
                                endLine++
                            }
                        }

                        matchStartLine = i
                        matchEndLine = endLine
                        matchFound = true
                        break
                    }
                }
            }
        }

        // Sixth try: Match by value attribute (label text)
        // Extract value from search pattern and find elements with that value
        if (!matchFound) {
            const valueMatch = search.match(/value="([^"]*)"/)
            if (valueMatch) {
                const searchValue = valueMatch[0] // Use full match like value="text"
                for (let i = startLineNum; i < resultLines.length; i++) {
                    if (resultLines[i].includes(searchValue)) {
                        // Found element with matching value
                        let endLine = i + 1
                        const line = resultLines[i].trim()

                        if (!line.endsWith("/>")) {
                            let depth = 1
                            while (endLine < resultLines.length && depth > 0) {
                                const currentLine = resultLines[endLine].trim()
                                if (
                                    currentLine.startsWith("<") &&
                                    !currentLine.startsWith("</") &&
                                    !currentLine.endsWith("/>")
                                ) {
                                    depth++
                                } else if (currentLine.startsWith("</")) {
                                    depth--
                                }
                                endLine++
                            }
                        }

                        matchStartLine = i
                        matchEndLine = endLine
                        matchFound = true
                        break
                    }
                }
            }
        }

        // Seventh try: Normalized whitespace match
        // Collapse all whitespace and compare
        if (!matchFound) {
            const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim()
            const normalizedSearch = normalizeWs(search)

            for (
                let i = startLineNum;
                i <= resultLines.length - searchLines.length;
                i++
            ) {
                // Build a normalized version of the candidate lines
                const candidateLines = resultLines.slice(
                    i,
                    i + searchLines.length,
                )
                const normalizedCandidate = normalizeWs(
                    candidateLines.join(" "),
                )

                if (normalizedCandidate === normalizedSearch) {
                    matchStartLine = i
                    matchEndLine = i + searchLines.length
                    matchFound = true
                    break
                }
            }
        }

        if (!matchFound) {
            throw new Error(
                `Search pattern not found in the diagram. The pattern may not exist in the current structure.`,
            )
        }

        // Replace the matched lines
        const replaceLines = replace.split("\n")

        // Remove trailing empty line if exists
        if (replaceLines[replaceLines.length - 1] === "") {
            replaceLines.pop()
        }

        // Perform the replacement
        const newResultLines = [
            ...resultLines.slice(0, matchStartLine),
            ...replaceLines,
            ...resultLines.slice(matchEndLine),
        ]

        result = newResultLines.join("\n")
    }

    return result
}

/**
 * Validates draw.io XML structure for common issues
 * Uses DOM parsing + additional regex checks for high accuracy
 * @param xml - The XML string to validate
 * @returns null if valid, error message string if invalid
 */
export function validateMxCellStructure(xml: string): string | null {
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
    } catch {
        // If DOMParser fails, continue with regex checks
    }

    // 1. Check for CDATA wrapper (invalid at document root)
    if (/^\s*<!\[CDATA\[/.test(xml)) {
        return "Invalid XML: XML is wrapped in CDATA section - remove <![CDATA[ from start and ]]> from end"
    }

    // 2. Check for duplicate structural attributes in tags
    const structuralAttrs = new Set([
        "edge",
        "parent",
        "source",
        "target",
        "vertex",
        "connectable",
    ])
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
            .filter(([name, count]) => count > 1 && structuralAttrs.has(name))
            .map(([name]) => name)
        if (duplicates.length > 0) {
            return `Invalid XML: Duplicate structural attribute(s): ${duplicates.join(", ")}. Remove duplicate attributes.`
        }
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

    // 5. Check for tag mismatches using stateful parser
    const xmlWithoutComments = xml.replace(/<!--[\s\S]*?-->/g, "")
    const tagStack: string[] = []

    // Parse tags properly by handling quoted strings
    let i = 0
    while (i < xmlWithoutComments.length) {
        // Find next <
        const tagStart = xmlWithoutComments.indexOf("<", i)
        if (tagStart === -1) break

        // Find matching > by tracking quotes
        let tagEnd = tagStart + 1
        let inQuote = false
        let quoteChar = ""
        while (tagEnd < xmlWithoutComments.length) {
            const c = xmlWithoutComments[tagEnd]
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

        if (tagEnd >= xmlWithoutComments.length) break

        const tag = xmlWithoutComments.substring(tagStart, tagEnd + 1)
        i = tagEnd + 1

        // Parse the tag
        const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)/.exec(tag)
        if (!tagMatch) continue

        const isClosing = tagMatch[1] === "/"
        const tagName = tagMatch[2]
        const isSelfClosing = tag.endsWith("/>")

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

    // 6. Check invalid character references
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

    // 7. Check for invalid comment syntax (-- inside comments)
    const commentPattern = /<!--([\s\S]*?)-->/g
    let commentMatch
    while ((commentMatch = commentPattern.exec(xml)) !== null) {
        if (/--/.test(commentMatch[1])) {
            return "Invalid XML: Comment contains -- (double hyphen) which is not allowed"
        }
    }

    // 8. Check for unescaped entity references and invalid entity names
    const bareAmpPattern = /&(?!(?:lt|gt|amp|quot|apos|#))/g
    if (bareAmpPattern.test(xmlWithoutComments)) {
        return "Invalid XML: Found unescaped & character(s). Replace & with &amp;"
    }
    const invalidEntityPattern = /&([a-zA-Z][a-zA-Z0-9]*);/g
    const validEntities = new Set(["lt", "gt", "amp", "quot", "apos"])
    let entityMatch
    while (
        (entityMatch = invalidEntityPattern.exec(xmlWithoutComments)) !== null
    ) {
        if (!validEntities.has(entityMatch[1])) {
            return `Invalid XML: Invalid entity reference: &${entityMatch[1]}; - use only valid XML entities (lt, gt, amp, quot, apos)`
        }
    }

    // 9. Check for empty id attributes on mxCell
    if (/<mxCell[^>]*\sid\s*=\s*["']\s*["'][^>]*>/g.test(xml)) {
        return "Invalid XML: Found mxCell element(s) with empty id attribute"
    }

    // 10. Check for mxfile wrapper (warning only - may not work with URL hash loading)
    // Disabled: This is just a warning, not an error
    // if (xml.trim().startsWith('<mxfile')) { ... }

    // 11. Check for nested mxCell tags
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

/**
 * Attempts to auto-fix common XML issues in draw.io diagrams
 * @param xml - The XML string to fix
 * @returns Object with fixed XML and list of fixes applied
 */
export function autoFixXml(xml: string): { fixed: string; fixes: string[] } {
    let fixed = xml
    const fixes: string[] = []

    // 1. Remove CDATA wrapper
    if (/^\s*<!\[CDATA\[/.test(fixed)) {
        fixed = fixed.replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "")
        fixes.push("Removed CDATA wrapper")
    }

    // 2. Fix duplicate attributes (keep first occurrence, remove duplicates)
    const structuralAttrsToFix = [
        "edge",
        "parent",
        "source",
        "target",
        "vertex",
        "connectable",
    ]
    let dupAttrFixed = false
    fixed = fixed.replace(/<[^>]+>/g, (tag) => {
        const seenAttrs = new Set<string>()
        let newTag = tag

        for (const attr of structuralAttrsToFix) {
            // Find all occurrences of this attribute
            const attrRegex = new RegExp(
                `\\s${attr}\\s*=\\s*["'][^"']*["']`,
                "gi",
            )
            const matches = tag.match(attrRegex)

            if (matches && matches.length > 1) {
                // Keep first, remove others
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

    // 3. Fix unescaped & characters (but not valid entities)
    // Match & not followed by valid entity pattern
    const ampersandPattern =
        /&(?!(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g
    if (ampersandPattern.test(fixed)) {
        fixed = fixed.replace(
            /&(?!(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g,
            "&amp;",
        )
        fixes.push("Escaped unescaped & characters")
    }

    // 3. Fix invalid entity names like &ampquot; -> &quot;
    // Common mistake: double-escaping
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

    // 3b. Fix malformed attribute values where &quot; is used as delimiter
    // Pattern: attr=&quot;value&quot; should be attr="&quot;value&quot;"
    const malformedQuotePattern =
        /(\s[a-zA-Z][a-zA-Z0-9_:-]*)=&quot;([^&]*(?:&(?!quot;)[^&]*)*)&quot;/g
    if (malformedQuotePattern.test(fixed)) {
        fixed = fixed.replace(
            /(\s[a-zA-Z][a-zA-Z0-9_:-]*)=&quot;([^&]*(?:&(?!quot;)[^&]*)*)&quot;/g,
            '$1="&quot;$2&quot;"',
        )
        fixes.push(
            'Fixed malformed attribute quotes (=&quot;...&quot; to ="&quot;...&quot;")',
        )
    }

    // 4. Fix unescaped < in attribute values
    // This is tricky - we need to find < inside quoted attribute values
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
        // Replace < with &lt; inside attribute values
        fixed = fixed.replace(/=\s*"([^"]*)"/g, (match, value) => {
            const escaped = value.replace(/</g, "&lt;")
            return `="${escaped}"`
        })
        fixes.push("Escaped < characters in attribute values")
    }

    // 5. Fix invalid character references (remove malformed ones)
    // Pattern: &#x followed by non-hex chars before ;
    const invalidHexRefs: string[] = []
    fixed = fixed.replace(/&#x([^;]*);/g, (match, hex) => {
        if (/^[0-9a-fA-F]+$/.test(hex) && hex.length > 0) {
            return match // Valid hex ref, keep it
        }
        invalidHexRefs.push(match)
        return "" // Remove invalid ref
    })
    if (invalidHexRefs.length > 0) {
        fixes.push(
            `Removed ${invalidHexRefs.length} invalid hex character reference(s)`,
        )
    }

    // 6. Fix invalid decimal character references
    const invalidDecRefs: string[] = []
    fixed = fixed.replace(/&#([^x][^;]*);/g, (match, dec) => {
        if (/^[0-9]+$/.test(dec) && dec.length > 0) {
            return match // Valid decimal ref, keep it
        }
        invalidDecRefs.push(match)
        return "" // Remove invalid ref
    })
    if (invalidDecRefs.length > 0) {
        fixes.push(
            `Removed ${invalidDecRefs.length} invalid decimal character reference(s)`,
        )
    }

    // 7. Fix invalid comment syntax (replace -- with - repeatedly until none left)
    fixed = fixed.replace(/<!--([\s\S]*?)-->/g, (match, content) => {
        if (/--/.test(content)) {
            // Keep replacing until no double hyphens remain
            let fixedContent = content
            while (/--/.test(fixedContent)) {
                fixedContent = fixedContent.replace(/--/g, "-")
            }
            fixes.push("Fixed invalid comment syntax (removed double hyphens)")
            return `<!--${fixedContent}-->`
        }
        return match
    })

    // 8. Fix <Cell> tags that should be <mxCell> (common LLM mistake)
    // This handles both opening and closing tags
    const hasCellTags = /<\/?Cell[\s>]/i.test(fixed)
    if (hasCellTags) {
        fixed = fixed.replace(/<Cell(\s)/gi, "<mxCell$1")
        fixed = fixed.replace(/<Cell>/gi, "<mxCell>")
        fixed = fixed.replace(/<\/Cell>/gi, "</mxCell>")
        fixes.push("Fixed <Cell> tags to <mxCell>")
    }

    // 9. Fix common closing tag typos
    const tagTypos = [
        { wrong: /<\/mxElement>/gi, right: "</mxCell>", name: "</mxElement>" },
        { wrong: /<\/mxcell>/g, right: "</mxCell>", name: "</mxcell>" }, // case sensitivity
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
        if (wrong.test(fixed)) {
            fixed = fixed.replace(wrong, right)
            fixes.push(`Fixed typo ${name} to ${right}`)
        }
    }

    // 10. Fix unclosed tags by appending missing closing tags
    // Track open tags and close any that are left open using stateful parser
    const tagStack: string[] = []

    let idx = 0
    while (idx < fixed.length) {
        const tagStart = fixed.indexOf("<", idx)
        if (tagStart === -1) break

        // Find matching > by tracking quotes
        let tagEnd = tagStart + 1
        let inQuote = false
        let quoteChar = ""
        while (tagEnd < fixed.length) {
            const c = fixed[tagEnd]
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

        if (tagEnd >= fixed.length) break

        const tag = fixed.substring(tagStart, tagEnd + 1)
        idx = tagEnd + 1

        const tagMatch2 = /^<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)/.exec(tag)
        if (!tagMatch2) continue

        const isClosing = tagMatch2[1] === "/"
        const tagName = tagMatch2[2]
        const isSelfClosing = tag.endsWith("/>")

        if (isClosing) {
            // Find matching opening tag (may not be the last one if there's mismatch)
            const lastIdx = tagStack.lastIndexOf(tagName)
            if (lastIdx !== -1) {
                tagStack.splice(lastIdx, 1)
            }
        } else if (!isSelfClosing) {
            tagStack.push(tagName)
        }
    }

    // If there are unclosed tags, append closing tags in reverse order
    // But first verify with simple count that they're actually unclosed
    if (tagStack.length > 0) {
        const tagsToClose: string[] = []
        for (const tagName of tagStack.reverse()) {
            // Simple count check: only close if opens > closes
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

    // 11. Fix nested mxCell by flattening
    // Pattern A: <mxCell id="X">...<mxCell id="X">...</mxCell></mxCell> (duplicate ID)
    // Pattern B: <mxCell id="X">...<mxCell id="Y">...</mxCell></mxCell> (different ID - true nesting)
    const lines = fixed.split("\n")
    let newLines: string[] = []
    let nestedFixed = 0
    let extraClosingToRemove = 0

    // First pass: fix duplicate ID nesting (same as before)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const nextLine = lines[i + 1]

        // Check if current line and next line are both mxCell opening tags with same ID
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
                extraClosingToRemove++ // Need to remove one </mxCell> later
                continue // Skip this duplicate opening line
            }
        }

        // Remove extra </mxCell> if we have pending removals
        if (extraClosingToRemove > 0 && /^\s*<\/mxCell>\s*$/.test(line)) {
            extraClosingToRemove--
            continue // Skip this closing tag
        }

        newLines.push(line)
    }

    if (nestedFixed > 0) {
        fixed = newLines.join("\n")
        fixes.push(`Flattened ${nestedFixed} duplicate-ID nested mxCell(s)`)
    }

    // Second pass: fix true nesting (different IDs)
    // Insert </mxCell> before nested child to close parent
    const lines2 = fixed.split("\n")
    newLines = []
    let trueNestedFixed = 0
    let cellDepth = 0
    let pendingCloseRemoval = 0

    for (let i = 0; i < lines2.length; i++) {
        const line = lines2[i]
        const trimmed = line.trim()

        // Track mxCell depth
        const isOpenCell = /<mxCell\s/.test(trimmed) && !trimmed.endsWith("/>")
        const isCloseCell = trimmed === "</mxCell>"
        const isSelfClose = /<mxCell[^>]*\/>/.test(trimmed)

        if (isOpenCell) {
            if (cellDepth > 0) {
                // Found nested cell - insert closing tag for parent before this line
                const indent = line.match(/^(\s*)/)?.[1] || ""
                newLines.push(indent + "</mxCell>")
                trueNestedFixed++
                pendingCloseRemoval++ // Need to remove one </mxCell> later
            }
            cellDepth = 1 // Reset to 1 since we just opened a new cell
            newLines.push(line)
        } else if (isCloseCell) {
            if (pendingCloseRemoval > 0) {
                pendingCloseRemoval--
                // Skip this extra closing tag
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

    // 12. Fix duplicate IDs by appending suffix
    const idPattern = /\bid\s*=\s*["']([^"']+)["']/gi
    const seenIds = new Map<string, number>()
    const duplicateIds: string[] = []

    // First pass: find duplicates
    let idMatch
    const tempPattern = /\bid\s*=\s*["']([^"']+)["']/gi
    while ((idMatch = tempPattern.exec(fixed)) !== null) {
        const id = idMatch[1]
        seenIds.set(id, (seenIds.get(id) || 0) + 1)
    }

    // Find which IDs are duplicated
    for (const [id, count] of seenIds) {
        if (count > 1) duplicateIds.push(id)
    }

    // Second pass: rename duplicates (keep first occurrence, rename others)
    if (duplicateIds.length > 0) {
        const idCounters = new Map<string, number>()
        fixed = fixed.replace(/\bid\s*=\s*["']([^"']+)["']/gi, (match, id) => {
            if (!duplicateIds.includes(id)) return match

            const count = idCounters.get(id) || 0
            idCounters.set(id, count + 1)

            if (count === 0) return match // Keep first occurrence

            // Rename subsequent occurrences
            const newId = `${id}_dup${count}`
            return match.replace(id, newId)
        })
        fixes.push(`Renamed ${duplicateIds.length} duplicate ID(s)`)
    }

    // 9. Fix empty id attributes by generating unique IDs
    let emptyIdCount = 0
    fixed = fixed.replace(
        /<mxCell([^>]*)\sid\s*=\s*["']\s*["']([^>]*)>/g,
        (match, before, after) => {
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
    return { valid: false, error, fixed: null, fixes }
}

export function extractDiagramXML(xml_svg_string: string): string {
    try {
        // 1. Parse the SVG string (using built-in DOMParser in a browser-like environment)
        const svgString = atob(xml_svg_string.slice(26))
        const parser = new DOMParser()
        const svgDoc = parser.parseFromString(svgString, "image/svg+xml")
        const svgElement = svgDoc.querySelector("svg")

        if (!svgElement) {
            throw new Error("No SVG element found in the input string.")
        }
        // 2. Extract the 'content' attribute
        const encodedContent = svgElement.getAttribute("content")

        if (!encodedContent) {
            throw new Error("SVG element does not have a 'content' attribute.")
        }

        // 3. Decode HTML entities (using a minimal function)
        function decodeHtmlEntities(str: string) {
            const textarea = document.createElement("textarea") // Use built-in element
            textarea.innerHTML = str
            return textarea.value
        }
        const xmlContent = decodeHtmlEntities(encodedContent)

        // 4. Parse the XML content
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml")
        const diagramElement = xmlDoc.querySelector("diagram")

        if (!diagramElement) {
            throw new Error("No diagram element found")
        }
        // 5. Extract base64 encoded data
        const base64EncodedData = diagramElement.textContent

        if (!base64EncodedData) {
            throw new Error("No encoded data found in the diagram element")
        }

        // 6. Decode base64 data
        const binaryString = atob(base64EncodedData)

        // 7. Convert binary string to Uint8Array
        const len = binaryString.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i)
        }

        // 8. Decompress data using pako (equivalent to zlib.decompress with wbits=-15)
        const decompressedData = pako.inflate(bytes, { windowBits: -15 })

        // 9. Convert the decompressed data to a string
        const decoder = new TextDecoder("utf-8")
        const decodedString = decoder.decode(decompressedData)

        // Decode URL-encoded content (equivalent to Python's urllib.parse.unquote)
        const urlDecodedString = decodeURIComponent(decodedString)

        return urlDecodedString
    } catch (error) {
        console.error("Error extracting diagram XML:", error)
        throw error // Re-throw for caller handling
    }
}
