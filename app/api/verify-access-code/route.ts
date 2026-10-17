import { checkAccessCode } from "@/lib/access-code"

export async function POST(req: Request) {
    if (checkAccessCode(req)) {
        return Response.json(
            { valid: false, message: "Invalid or missing access code" },
            { status: 401 },
        )
    }

    return Response.json({ valid: true, message: "Access code is valid" })
}
