/**
 * Generate a userId from request for tracking purposes.
 * Uses base64url encoding of IP for URL-safe identifier.
 * Note: base64 is reversible - this is NOT privacy protection.
 */
export function getUserIdFromRequest(req: Request): string {
    const forwardedFor = req.headers.get("x-forwarded-for")
    const rawIp = forwardedFor?.split(",")[0]?.trim() || "anonymous"
    return rawIp === "anonymous"
        ? rawIp
        : `user-${Buffer.from(rawIp).toString("base64url")}`
}
