/**
 * SSRF (Server-Side Request Forgery) protection utilities
 */

import { lookup } from "node:dns/promises"

/**
 * Check if an IP address (IPv4 or IPv6) belongs to a private/internal range.
 * Works for both user-supplied literal IPs and DNS-resolved addresses.
 */
function isPrivateIp(ip: string): boolean {
    const addr = ip.toLowerCase().replace(/^\[|\]$/g, "")

    // IPv6
    if (addr.includes(":")) {
        if (addr === "::1" || addr === "::") return true
        // unique-local (fc00::/7) and IPv4-mapped (::ffff:0:0/96)
        if (
            addr.startsWith("fc") ||
            addr.startsWith("fd") ||
            addr.startsWith("::ffff:")
        ) {
            return true
        }
        // link-local (fe80::/10)
        const linkLocal = addr.match(/^fe([0-9a-f]{2}):/)
        if (linkLocal) {
            const high = parseInt(linkLocal[1], 16)
            if (high >= 0x80 && high <= 0xbf) return true
        }
        return false
    }

    // IPv4
    const ipv4Match = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number)
        if (a === 10) return true // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
        if (a === 192 && b === 168) return true // 192.168.0.0/16
        if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local)
        if (a === 127) return true // 127.0.0.0/8 (loopback)
        if (a === 0) return true // 0.0.0.0/8
        if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 (CGNAT, used by some cloud internal networks)
    }

    return false
}

/**
 * String-only check against well-known private hostnames and literal IPs.
 * Fast path that avoids a DNS lookup for obvious cases.
 */
function isPrivateHostname(hostname: string): boolean {
    const host = hostname
        .toLowerCase()
        .replace(/^\[|\]$/g, "")
        .replace(/\.$/, "")

    if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "::"
    ) {
        return true
    }

    if (host === "169.254.169.254" || host === "metadata.google.internal") {
        return true
    }

    if (
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        host.endsWith(".localhost")
    ) {
        return true
    }

    // Literal IP supplied directly in the URL
    return isPrivateIp(host)
}

/**
 * Check if URL points to private/internal network.
 * Blocks: localhost, private IPs, link-local, AWS metadata service.
 *
 * Resolves the hostname via DNS and validates every returned address, so
 * public-looking names that map to internal IPs (e.g. "127-0-0-1.sslip.io")
 * are caught even though they pass the string-only check.
 */
export async function isPrivateUrl(urlString: string): Promise<boolean> {
    try {
        const url = new URL(urlString)
        const hostname = url.hostname

        // Fast path: obvious string matches and literal IPs.
        if (isPrivateHostname(hostname)) return true

        // Resolve DNS and reject if any address is private.
        const stripped = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "")
        const addresses = await lookup(stripped, { all: true })
        return addresses.some(({ address }) => isPrivateIp(address))
    } catch {
        return true // Invalid URL or DNS failure - block it
    }
}

/**
 * Whether private URLs are allowed (defaults to true)
 * Set ALLOW_PRIVATE_URLS=false to block private URLs
 * Read per call so admin-panel changes apply without restart
 */
export function allowPrivateUrls(): boolean {
    return process.env.ALLOW_PRIVATE_URLS !== "false"
}
