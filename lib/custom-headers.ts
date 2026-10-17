import { PROVIDERS, type ProviderName } from "@/lib/providers"

/**
 * Extra HTTP headers a user sends to their own OpenAI-compatible provider
 * (issue #763), for gateways that ask for more than the API key. They are
 * typed one per line as "Name: value". The settings check them as typed,
 * the server again, since a request can carry anything; the server sends
 * them only with the user's own key.
 */

const MAX_HEADERS = 20
const MAX_VALUE_LENGTH = 1000
// An HTTP token
const NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
// Printable ASCII and tabs: fetch refuses other characters in a value
const VALUE = /^[\t\x20-\x7e]*$/
// Set by fetch and the SDK for the request itself
const RESERVED = new Set([
    "connection",
    "content-length",
    "content-type",
    "host",
    "transfer-encoding",
])

export type CustomHeadersError =
    | "format"
    | "name"
    | "value"
    | "reserved"
    | "tooMany"

export type ParsedCustomHeaders =
    | { ok: true; headers: Record<string, string> }
    | { ok: false; error: CustomHeadersError; line: number }

/** Providers whose settings offer custom headers: the OpenAI-style APIs */
export function supportsCustomHeaders(provider: ProviderName): boolean {
    const def = PROVIDERS[provider]
    return (
        def.credential === "apiKey" &&
        (def.sdk === "openai" || def.sdk === "openai-compatible")
    )
}

/** "Name: value" lines, blank lines skipped; line is 1-based */
export function parseCustomHeaders(text: string): ParsedCustomHeaders {
    // A Map, so a name such as __proto__ is just a name
    const headers = new Map<string, string>()
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        const fail = (error: CustomHeadersError) =>
            ({ ok: false, error, line: i + 1 }) as const
        const colon = line.indexOf(":")
        if (colon <= 0) return fail("format")
        const name = line.slice(0, colon).trim()
        const value = line.slice(colon + 1).trim()
        if (!NAME.test(name)) return fail("name")
        if (!VALUE.test(value) || value.length > MAX_VALUE_LENGTH) {
            return fail("value")
        }
        if (RESERVED.has(name.toLowerCase())) return fail("reserved")
        // Names are case-insensitive: the last of two spellings wins
        const key = name.toLowerCase()
        if (!headers.has(key) && headers.size >= MAX_HEADERS) {
            return fail("tooMany")
        }
        headers.set(key, value)
    }
    return { ok: true, headers: Object.fromEntries(headers) }
}

/** The headers of a request's text, or null when there are none */
export function customHeadersOf(
    text: string | null | undefined,
):
    | { ok: true; headers: Record<string, string> | null }
    | { ok: false; message: string } {
    if (!text?.trim()) return { ok: true, headers: null }
    const parsed = parseCustomHeaders(text)
    if (!parsed.ok) {
        return {
            ok: false,
            message: `Invalid custom header on line ${parsed.line} (${parsed.error}).`,
        }
    }
    return {
        ok: true,
        headers: Object.keys(parsed.headers).length ? parsed.headers : null,
    }
}
