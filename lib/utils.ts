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
        // Indent each line of the matched block for readability.
        const formatted = match[0]
            .split("\n")
            .map((line) => "    " + line.trim())
            .join("\n")
        result += formatted + "\n"
    }
    result += "</root>"

    return result
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
    let lastProcessedIndex = 0

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

        // Find the line number where lastProcessedIndex falls
        let startLineNum = 0
        let currentIndex = 0
        while (
            currentIndex < lastProcessedIndex &&
            startLineNum < resultLines.length
        ) {
            currentIndex += resultLines[startLineNum].length + 1 // +1 for \n
            startLineNum++
        }

        // Try to find exact match starting from lastProcessedIndex
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

        // Update lastProcessedIndex to the position after the replacement
        lastProcessedIndex = 0
        for (let i = 0; i < matchStartLine + replaceLines.length; i++) {
            lastProcessedIndex += newResultLines[i].length + 1
        }
    }

    return result
}

/**
 * Validates draw.io XML structure for common issues
 * @param xml - The XML string to validate
 * @returns null if valid, error message string if invalid
 */
export function validateMxCellStructure(xml: string): string | null {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, "text/xml")

    // Check for XML parsing errors (includes unescaped special characters)
    const parseError = doc.querySelector("parsererror")
    if (parseError) {
        return `Invalid XML: The XML contains syntax errors (likely unescaped special characters like <, >, & in attribute values). Please escape special characters: use &lt; for <, &gt; for >, &amp; for &, &quot; for ". Regenerate the diagram with properly escaped values.`
    }

    // Get all mxCell elements once for all validations
    const allCells = doc.querySelectorAll("mxCell")

    // Single pass: collect IDs, check for duplicates, nesting, orphans, and invalid parents
    const cellIds = new Set<string>()
    const duplicateIds: string[] = []
    const nestedCells: string[] = []
    const orphanCells: string[] = []
    const invalidParents: { id: string; parent: string }[] = []
    const edgesToValidate: {
        id: string
        source: string | null
        target: string | null
    }[] = []

    allCells.forEach((cell) => {
        const id = cell.getAttribute("id")
        const parent = cell.getAttribute("parent")
        const isEdge = cell.getAttribute("edge") === "1"

        // Check for duplicate IDs
        if (id) {
            if (cellIds.has(id)) {
                duplicateIds.push(id)
            } else {
                cellIds.add(id)
            }
        }

        // Check for nested mxCell (parent element is also mxCell)
        if (cell.parentElement?.tagName === "mxCell") {
            nestedCells.push(id || "unknown")
        }

        // Check parent attribute (skip root cell id="0")
        if (id !== "0") {
            if (!parent) {
                if (id) orphanCells.push(id)
            } else {
                // Store for later validation (after all IDs collected)
                invalidParents.push({ id: id || "unknown", parent })
            }
        }

        // Collect edges for connection validation
        if (isEdge) {
            edgesToValidate.push({
                id: id || "unknown",
                source: cell.getAttribute("source"),
                target: cell.getAttribute("target"),
            })
        }
    })

    // Return errors in priority order
    if (nestedCells.length > 0) {
        return `Invalid XML: Found nested mxCell elements (IDs: ${nestedCells.slice(0, 3).join(", ")}). All mxCell elements must be direct children of <root>, never nested inside other mxCell elements. Please regenerate the diagram with correct structure.`
    }

    if (duplicateIds.length > 0) {
        return `Invalid XML: Found duplicate cell IDs (${duplicateIds.slice(0, 3).join(", ")}). Each mxCell must have a unique ID. Please regenerate the diagram with unique IDs for all elements.`
    }

    if (orphanCells.length > 0) {
        return `Invalid XML: Found cells without parent attribute (IDs: ${orphanCells.slice(0, 3).join(", ")}). All mxCell elements (except id="0") must have a parent attribute. Please regenerate the diagram with proper parent references.`
    }

    // Validate parent references (now that all IDs are collected)
    const badParents = invalidParents.filter((p) => !cellIds.has(p.parent))
    if (badParents.length > 0) {
        const details = badParents
            .slice(0, 3)
            .map((p) => `${p.id} (parent: ${p.parent})`)
            .join(", ")
        return `Invalid XML: Found cells with invalid parent references (${details}). Parent IDs must reference existing cells. Please regenerate the diagram with valid parent references.`
    }

    // Validate edge connections
    const invalidConnections: string[] = []
    edgesToValidate.forEach((edge) => {
        if (edge.source && !cellIds.has(edge.source)) {
            invalidConnections.push(`${edge.id} (source: ${edge.source})`)
        }
        if (edge.target && !cellIds.has(edge.target)) {
            invalidConnections.push(`${edge.id} (target: ${edge.target})`)
        }
    })

    if (invalidConnections.length > 0) {
        return `Invalid XML: Found edges with invalid source/target references (${invalidConnections.slice(0, 3).join(", ")}). Edge source and target must reference existing cell IDs. Please regenerate the diagram with valid edge connections.`
    }

    return null
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
