import { type ClassValue, clsx } from "clsx"
import * as pako from "pako"
import { twMerge } from "tailwind-merge"
import { hasCells } from "@/packages/mcp-server/src/pages.ts"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// ============================================================================
// Diagram Constants
// ============================================================================

/**
 * Minimum length for a "real" diagram XML (not just empty template).
 * Empty mxfile templates are ~147-300 chars; real diagrams are larger.
 */
export const MIN_REAL_DIAGRAM_LENGTH = 300

/**
 * Check if diagram XML represents a real diagram (not just empty template):
 * it has a shape (however short), or is long enough to hold pages worth
 * keeping.
 * @param xml - The diagram XML string to check
 * @returns true if the XML is a real diagram with content
 */
export function isRealDiagram(xml: string | undefined | null): boolean {
    return !!xml && (hasCells(xml) || xml.length > MIN_REAL_DIAGRAM_LENGTH)
}

// ============================================================================
// mxCell XML Helpers
// ============================================================================

/**
 * Check if mxCell XML output is complete (not truncated).
 * Complete XML ends with a self-closing tag (/>) or closing mxCell tag.
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

    // If the last mxCell has no </mxCell> after it, it must be self-closing.
    // Otherwise the trailing "/>" belongs to a child such as <mxGeometry .../>
    // and the output was cut off before the cell was closed.
    const lastCellStart = trimmed.lastIndexOf("<mxCell")
    if (
        lastCellStart > lastMxCellClose &&
        // (quoted values may hold a raw "<", which the auto-fix escapes)
        !/^<mxCell\b(?:[^<>"']|"[^"]*"|'[^']*')*\/>/.test(
            trimmed.slice(lastCellStart),
        )
    ) {
        return false
    }

    // Check what comes after the last valid ending
    // For />: add 2 chars, for </mxCell>: add 9 chars
    const endOffset = lastMxCellClose > lastSelfClose ? 9 : 2
    const suffix = trimmed.slice(lastValidEnd + endOffset)

    // If suffix is empty or only contains closing tags (any provider's wrapper) or whitespace, it's complete
    // This regex matches any sequence of closing XML tags like </foo>, </bar>, </｜DSML｜xyz>
    return /^(\s*<\/[^>]+>)*\s*$/.test(suffix)
}

/**
 * Extract only complete mxCell elements from partial/streaming XML.
 * This allows progressive rendering during streaming by ignoring incomplete trailing elements.
 * @param xml - The partial XML string (may contain incomplete trailing mxCell)
 * @returns XML string containing only complete mxCell elements
 */
export function extractCompleteMxCells(xml: string | undefined | null): string {
    if (!xml) return ""

    // Match self-closing <mxCell ... /> or <mxCell ...>...</mxCell>, in document order.
    // The lazy [^>]*? tries "/>" first, so a self-closing cell never swallows
    // the following cells up to the next </mxCell>.
    const cellPattern = /<mxCell\b[^>]*?(?:\/>|>[\s\S]*?<\/mxCell>)/g

    return (xml.match(cellPattern) || []).join("\n")
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

        // Fix unescaped & characters in attribute values (but not valid entities)
        // This prevents DOMParser from failing on content like "semantic & missing-step"
        cellContent = cellContent.replace(
            /&(?!(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g,
            "&amp;",
        )

        // Fix unescaped < and > in attribute values for XML parsing
        // HTML content in value attributes (e.g., <b>Title</b>) needs to be escaped
        // This is critical because DOMParser will fail on unescaped < > in attributes
        if (/=\s*"[^"]*<[^"]*"/.test(cellContent)) {
            cellContent = cellContent.replace(
                /=\s*"([^"]*)"/g,
                (_match, value) => {
                    const escaped = value
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                    return `="${escaped}"`
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
 * Decode an xmlsvg export (SVG data URL) into uncompressed diagram XML.
 * Only the first page is returned; for the full multi-page document use the
 * autosaved chartXML instead.
 */
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
