/**
 * The attributes of one tag as written: name="value" or name='value'
 * pairs. A quoted value is read whole, so text inside it such as
 * value="Use parent='1'" is never taken for an attribute.
 */
export interface TagAttribute {
    name: string
    value: string
    // The attribute's text in the tag, with the whitespace before it
    start: number
    end: number
}

export function readAttributes(tag: string): TagAttribute[] {
    const attributes: TagAttribute[] = []
    for (const m of tag.matchAll(
        /\s*([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    )) {
        attributes.push({
            name: m[1],
            value: m[2] ?? m[3],
            start: m.index,
            end: m.index + m[0].length,
        })
    }
    return attributes
}
