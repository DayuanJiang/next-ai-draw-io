import { NextResponse } from "next/server"
import { checkAccessCode, rejectCrossSite } from "@/lib/access-code"
import {
    type TestModelRequest,
    testModelConnection,
} from "@/lib/test-model-connection"

export const runtime = "nodejs"

// The Settings dialog's Test button: a model on the user's own credentials
export async function POST(req: Request) {
    const crossSite = rejectCrossSite(req)
    if (crossSite) return crossSite
    // Lets the server send requests to arbitrary URLs, so require the access code
    const accessError = checkAccessCode(req)
    if (accessError) return accessError

    let body: TestModelRequest
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { valid: false, error: "Invalid JSON body" },
            { status: 400 },
        )
    }
    // A URL in the request is one the user typed, never the server's own
    return testModelConnection(req, body, false)
}
