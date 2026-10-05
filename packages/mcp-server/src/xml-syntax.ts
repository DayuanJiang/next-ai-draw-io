/**
 * Strict XML syntax check, used in Node and in the web app's browser code.
 * saxes reports syntax errors the way draw.io's DOMParser will, including
 * an attribute prefix such as xlink: that was never declared.
 */
import { SaxesParser } from "saxes"

/**
 * Returns the first XML syntax error as "line:column: message", or null if
 * the XML is well-formed. Surrounding whitespace is ignored because every
 * caller trims before the XML reaches the browser.
 */
export function getXmlSyntaxError(xml: string): string | null {
    let error: string | null = null
    const parser = new SaxesParser({ xmlns: true })
    parser.on("error", (err) => {
        error ??= err.message
    })
    parser.write(xml.trim()).close()
    return error
}
