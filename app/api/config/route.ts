import { NextResponse } from "next/server"
import { getLangfuseClient } from "@/lib/langfuse"
import {
    MAX_OUTPUT_TOKENS_LIMIT,
    resolveMaxOutputTokens,
} from "@/lib/output-token-limit"

export async function GET() {
    // Read through `env`, so the id is the one the server runs with: a
    // written-out process.env.NEXT_PUBLIC_GA_ID is fixed when the app is
    // built, and the published Docker image is built without one
    const env = process.env
    return NextResponse.json({
        accessCodeRequired: !!process.env.ACCESS_CODE_LIST,
        // For the settings' output token limit: what the server's own
        // models get at most, and the highest value taken from a user
        maxOutputTokens: {
            server: resolveMaxOutputTokens(null, true),
            max: MAX_OUTPUT_TOKENS_LIMIT,
        },
        // Google Analytics id, for the page to load it
        gaId: env.NEXT_PUBLIC_GA_ID || undefined,
        // Whether the editor's actions are kept (in Langfuse)
        usageLog: !!getLangfuseClient(),
    })
}
