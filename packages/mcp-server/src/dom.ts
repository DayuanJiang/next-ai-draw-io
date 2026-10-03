/**
 * DOM setup for Node.
 *
 * linkedom gives us a DOM with querySelector, but it is lenient: it never
 * reports syntax errors (no <parsererror>), and its serializer writes raw
 * newlines inside attribute values, which the browser reads back as spaces.
 * saxes, a strict XML parser, checks well-formedness the way draw.io's
 * DOMParser will, and serializeXml writes attribute values safely.
 */
import { DOMParser } from "linkedom"
import { SaxesParser } from "saxes"

/**
 * Returns the first XML syntax error as "line:column: message", or null if
 * the XML is well-formed. Surrounding whitespace is ignored because every
 * caller trims before the XML reaches the browser.
 */
export function getXmlSyntaxError(xml: string): string | null {
    let error: string | null = null
    const parser = new SaxesParser()
    parser.on("error", (err) => {
        error ??= err.message
    })
    parser.write(xml.trim()).close()
    return error
}

const ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "\t": "&#9;",
    "\n": "&#xa;",
    "\r": "&#xd;",
}
const escapeChars = (text: string, chars: RegExp) =>
    text.replace(chars, (c) => ESCAPES[c])

/**
 * Serialize a linkedom node as XML. Attribute values escape tabs and line
 * breaks too, so multi-line labels (value="a&#xa;b") survive a round trip.
 */
export function serializeXml(node: Node): string {
    switch (node.nodeType) {
        case 9: {
            // Document
            const root = (node as Document).documentElement
            return root ? serializeXml(root) : ""
        }
        case 1: {
            // Element
            const el = node as Element
            let out = `<${el.tagName}`
            for (const attr of Array.from(el.attributes)) {
                out += ` ${attr.name}="${escapeChars(attr.value, /[&<>"\t\n\r]/g)}"`
            }
            if (el.childNodes.length === 0) return `${out}/>`
            out += ">"
            for (const child of Array.from(el.childNodes)) {
                out += serializeXml(child)
            }
            return `${out}</${el.tagName}>`
        }
        case 3:
            // Text
            return escapeChars(node.textContent ?? "", /[&<>]/g)
        case 4:
            // CDATA
            return `<![CDATA[${node.textContent ?? ""}]]>`
        case 8:
            // Comment
            return `<!--${node.textContent ?? ""}-->`
        default:
            return ""
    }
}

class XMLSerializerPolyfill {
    serializeToString(node: Node): string {
        return serializeXml(node)
    }
}

/** Install the DOMParser and XMLSerializer globals the XML helpers use. */
export function installDomPolyfill(): void {
    ;(globalThis as any).DOMParser = DOMParser
    ;(globalThis as any).XMLSerializer = XMLSerializerPolyfill
}
