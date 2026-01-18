/**
 * SSRF (Server-Side Request Forgery) protection utilities
 */

/**
 * Check if URL points to private/internal network
 * Blocks: localhost, private IPs, link-local, AWS metadata service
 */
export function isPrivateUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString)
        const hostname = url.hostname.toLowerCase()

        // Block localhost
        if (
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1"
        ) {
            return true
        }

        // Block AWS/cloud metadata endpoints
        if (
            hostname === "169.254.169.254" ||
            hostname === "metadata.google.internal"
        ) {
            return true
        }

        // Check for private IPv4 ranges
        const ipv4Match = hostname.match(
            /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
        )
        if (ipv4Match) {
            const [, a, b] = ipv4Match.map(Number)
            if (a === 10) return true // 10.0.0.0/8
            if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
            if (a === 192 && b === 168) return true // 192.168.0.0/16
            if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local)
            if (a === 127) return true // 127.0.0.0/8 (loopback)
        }

        // Block common internal hostnames
        if (
            hostname.endsWith(".local") ||
            hostname.endsWith(".internal") ||
            hostname.endsWith(".localhost")
        ) {
            return true
        }

        return false
    } catch {
        return true // Invalid URL - block it
    }
}

/**
 * Whether private URLs are allowed (defaults to true)
 * Set ALLOW_PRIVATE_URLS=false to block private URLs
 */
export const allowPrivateUrls = process.env.ALLOW_PRIVATE_URLS !== "false"
