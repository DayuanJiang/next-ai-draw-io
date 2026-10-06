/**
 * Generate a userId from request for tracking purposes.
 * Uses base64url encoding of IP for URL-safe identifier.
 * Note: base64 is reversible - this is NOT privacy protection.
 *
 * The first X-Forwarded-For entry is whatever the visitor sent, so behind a
 * CDN set CLIENT_IP_HEADER to the header it fills with the real IP (e.g.
 * cf-connecting-ip), and ORIGIN_SECRET so requests that skip the CDN are
 * refused (see proxy.ts).
 */
export function getUserIdFromRequest(req: Request): string {
    const ipHeader = process.env.CLIENT_IP_HEADER
    const rawIp =
        (ipHeader
            ? req.headers.get(ipHeader)?.trim()
            : req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ||
        "anonymous"
    return rawIp === "anonymous"
        ? rawIp
        : `user-${Buffer.from(rawIp).toString("base64url")}`
}
