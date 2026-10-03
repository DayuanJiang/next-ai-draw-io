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
