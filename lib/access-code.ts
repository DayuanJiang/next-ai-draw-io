/**
 * Refuse a POST that a page on another website could have sent. A browser
 * sends a cross-site POST without asking first (CORS preflight) only with a
 * text or form body, so the routes take JSON only. In the desktop app also
 * refuse a foreign Host: a site that points its own domain name at
 * 127.0.0.1 (DNS rebinding) is same-origin with the local server, but its
 * requests carry that domain. A request the server builds itself has no
 * Host. Returns the response to send, or null when the request may go on.
 */
export function rejectCrossSite(req: Request): Response | null {
    const contentType = req.headers.get("content-type") ?? ""
    if (!/^\s*application\/json\b/i.test(contentType)) {
        return Response.json(
            { error: "Content-Type must be application/json" },
            { status: 415 },
        )
    }
    const host = req.headers.get("host")
    if (
        process.env.NEXT_AI_DRAWIO_DESKTOP === "1" &&
        host &&
        !/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)
    ) {
        return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    return null
}

/**
 * Check the x-access-code header against ACCESS_CODE_LIST.
 * Returns a 401 response to send back when the check fails, or null when the
 * request may continue (including when no access codes are configured).
 */
export function checkAccessCode(req: Request): Response | null {
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []
    if (accessCodes.length === 0) return null

    const accessCodeHeader = req.headers.get("x-access-code")
    if (accessCodeHeader && accessCodes.includes(accessCodeHeader)) return null

    return Response.json(
        {
            error: "Invalid or missing access code. Please configure it in Settings.",
        },
        { status: 401 },
    )
}
