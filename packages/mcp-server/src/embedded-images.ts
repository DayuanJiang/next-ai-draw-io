/**
 * Embedded images in the diagram shown to the model.
 *
 * A picture pasted into draw.io is kept in the cell's style as its whole
 * file in base64 (image=data:image/png,iVBOR...), often hundreds of
 * thousands of characters. The model needs none of it, so foldCells writes
 * each one as a short reference, the same one every time for the same
 * picture:
 *
 *   image=data:image/png,embedded-image-1k2j3h4g5f6d
 *
 * restoreImageData puts the pictures back into the XML the model writes.
 * It knows the pictures of the diagrams passed to rememberImages: the web
 * app passes each diagram it sends to the model, so a reference to a
 * picture the model saw an earlier version of the diagram with still works.
 */

// Shorter data stays as it is: a reference would save little
const IMAGE_DATA =
    /(data:image\/[\w.+-]+(?:;base64)?,)([A-Za-z0-9+/]{200,}={0,2})/g
const IMAGE_REF = /embedded-image-([0-9a-z]+)/g

// The start of the reference the model sees in place of a picture's data
const IMAGE_REF_PREFIX = "embedded-image-"

// cyrb53, a fast 53-bit string hash that gives the same result in Node and
// the browser, so the server and the canvas name a picture alike
function imageId(data: string): string {
    let h1 = 0xdeadbeef
    let h2 = 0x41c6ce57
    for (let i = 0; i < data.length; i++) {
        const c = data.charCodeAt(i)
        h1 = Math.imul(h1 ^ c, 2654435761)
        h2 = Math.imul(h2 ^ c, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * What the model is told along with a diagram shown with references (the
 * output of foldCells), or "" when it has none
 */
export function imageRefNote(shown: string): string {
    return shown.includes(IMAGE_REF_PREFIX)
        ? `Pictures embedded in the diagram are shown as references (data:image/...,${IMAGE_REF_PREFIX}<id>). Keep a reference exactly as written to keep its picture, also when you redraw the whole diagram: the picture is put back when your XML is drawn.`
        : ""
}

/** Each embedded picture's data replaced by its reference */
export function hideImageData(xml: string): string {
    return xml.replace(
        IMAGE_DATA,
        (_, prefix: string, data: string) =>
            `${prefix}${IMAGE_REF_PREFIX}${imageId(data)}`,
    )
}

// Pictures by reference, from the diagrams passed to rememberImages. Never
// filled on the web app's server, which only hides pictures.
const images = new Map<string, string>()
// A streaming preview restores from the same diagram many times
let lastRemembered = ""

/** Keep the diagram's pictures for restoreImageData */
export function rememberImages(xml: string): void {
    if (xml === lastRemembered || !xml.includes("data:image/")) return
    lastRemembered = xml
    for (const m of xml.matchAll(IMAGE_DATA)) {
        const id = imageId(m[2])
        if (!images.has(id)) images.set(id, m[2])
    }
}

/**
 * The references in `xml` replaced by their pictures, from `source` (the
 * diagram the XML is drawn on) and the remembered diagrams. A reference to
 * a picture in neither stays as written.
 */
export function restoreImageData(xml: string, source = ""): string {
    if (!xml.includes(IMAGE_REF_PREFIX)) return xml
    rememberImages(source)
    return xml.replace(IMAGE_REF, (ref, id: string) => images.get(id) ?? ref)
}
