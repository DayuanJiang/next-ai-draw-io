import { timingSafeEqual } from "crypto"

// Shared auth for admin API routes: compares x-admin-password header
// against the ADMIN_PASSWORD env var. Unset password = panel disabled.
export function checkAdminAuth(req: Request): Response | null {
    const password = process.env.ADMIN_PASSWORD
    if (!password) {
        return Response.json(
            {
                error: "Admin panel is disabled. Set the ADMIN_PASSWORD environment variable to enable it.",
            },
            { status: 403 },
        )
    }
    const provided = req.headers.get("x-admin-password") || ""
    const a = Buffer.from(provided)
    const b = Buffer.from(password)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return Response.json(
            { error: "Invalid admin password" },
            { status: 401 },
        )
    }
    return null
}

export interface MaskedSecret {
    isSet: true
    hint: string
}

export function maskSecret(value: string): MaskedSecret {
    return {
        isSet: true,
        hint: value.length > 8 ? `…${value.slice(-4)}` : "••••",
    }
}
