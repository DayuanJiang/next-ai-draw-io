export async function POST(req: Request) {
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []

    // If no access codes configured, verification always passes
    if (accessCodes.length === 0) {
        return Response.json({
            valid: true,
            message: "No access code required",
        })
    }

    const accessCodeHeader = req.headers.get("x-access-code")

    if (!accessCodeHeader) {
        return Response.json(
            { valid: false, message: "Access code is required" },
            { status: 401 },
        )
    }

    if (!accessCodes.includes(accessCodeHeader)) {
        return Response.json(
            { valid: false, message: "Invalid access code" },
            { status: 401 },
        )
    }

    return Response.json({ valid: true, message: "Access code is valid" })
}
