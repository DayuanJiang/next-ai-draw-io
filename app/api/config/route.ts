import { NextResponse } from "next/server"
import {
    MAX_OUTPUT_TOKENS_LIMIT,
    resolveMaxOutputTokens,
} from "@/lib/output-token-limit"

export async function GET() {
    return NextResponse.json({
        accessCodeRequired: !!process.env.ACCESS_CODE_LIST,
        // For the settings' output token limit: what the server's own
        // models get at most, and the highest value taken from a user
        maxOutputTokens: {
            server: resolveMaxOutputTokens(null, true),
            max: MAX_OUTPUT_TOKENS_LIMIT,
        },
    })
}
