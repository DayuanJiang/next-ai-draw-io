import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { pageElement } from "@/lib/diagram-pages"
import {
    decompressPageContent,
    extractSvgEmbeddedXml,
} from "@/packages/mcp-server/src/load-diagram.ts"
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

export { isMxCellXmlComplete } from "@/packages/mcp-server/src/new-diagram.ts"

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
    // Quoted values may hold ">", so the tag ends at the first ">" outside them
    const cellPattern =
        /<mxCell\b(?:[^<>"']|"[^"]*"|'[^']*')*?(?:\/>|>[\s\S]*?<\/mxCell>)/g

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
                pad++
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
 * Decode an xmlsvg export (SVG data URL) into uncompressed diagram XML.
 * One page is returned: the one with the given id, else the first; for the
 * full multi-page document use the autosaved chartXML instead.
 */
export function extractDiagramXML(
    xml_svg_string: string,
    pageId?: string | null,
): string {
    // The data URL holds the SVG; its root element's content attribute
    // holds the mxfile, whose pages are compressed
    const svg = atob(xml_svg_string.slice(26))
    const content = extractSvgEmbeddedXml(svg)
    if (content === undefined) {
        throw new Error("No SVG element found in the input string.")
    }
    if (!content) {
        throw new Error("SVG element does not have a 'content' attribute.")
    }
    const doc = new DOMParser().parseFromString(content, "text/xml")
    const diagram = pageElement(doc, pageId)
    if (!diagram) {
        throw new Error("No diagram element found")
    }
    const xml = decompressPageContent(diagram.textContent ?? "")
    if (!xml) {
        throw new Error("No encoded data found in the diagram element")
    }
    return xml
}
