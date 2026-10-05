/**
 * DOM setup for Node. The XML helpers use the global DOMParser and
 * XMLSerializer, which the browser has and Node gets from here.
 *
 * linkedom gives us a DOM with querySelector, but it is lenient: it never
 * reports syntax errors (no <parsererror>; xml-syntax.ts checks them), and
 * its serializer writes raw newlines inside attribute values, which the
 * browser reads back as spaces. serializeXml writes attribute values safely.
 */
import { DOMParser } from "linkedom"

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

/**
 * XML parsers read a literal tab or line break inside an attribute value as
 * a space (a line break written as &#xa; stays one). linkedom keeps it, and
 * serializeXml would then write it as a real line break, so an edit would
 * change labels it never touched. Applied to the text before linkedom.
 */
function normalizeAttributeWhitespace(xml: string): string {
    return xml.replace(
        /<[A-Za-z][^"'<>]*(?:(?:"[^"]*"|'[^']*')[^"'<>]*)*>/g,
        (tag) =>
            tag.replace(/"[^"]*"|'[^']*'/g, (value) =>
                value.replace(/\r\n|[\t\n\r]/g, " "),
            ),
    )
}

class XmlDomParser extends DOMParser {
    parseFromString(text: string, type: string) {
        return super.parseFromString(
            type.includes("xml") ? normalizeAttributeWhitespace(text) : text,
            type as any,
        )
    }
}

class XMLSerializerPolyfill {
    serializeToString(node: Node): string {
        return serializeXml(node)
    }
}

/** Install the DOMParser and XMLSerializer globals the XML helpers use. */
export function installDomPolyfill(): void {
    ;(globalThis as any).DOMParser = XmlDomParser
    ;(globalThis as any).XMLSerializer = XMLSerializerPolyfill
}
