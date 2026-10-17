import { z } from "zod"
import { getLangfuseClient, scoreLatestTrace } from "@/lib/langfuse"
import { getUserIdFromRequest } from "@/lib/user-id"

const feedbackSchema = z.object({
    messageId: z.string().min(1).max(200),
    feedback: z.enum(["good", "bad"]),
    sessionId: z.string().min(1).max(200).optional(),
})

export async function POST(req: Request) {
    const langfuse = getLangfuseClient()
    if (!langfuse) {
        return Response.json({ success: true, logged: false })
    }

    // Validate input
    let data
    try {
        data = feedbackSchema.parse(await req.json())
    } catch {
        return Response.json(
            { success: false, error: "Invalid input" },
            { status: 400 },
        )
    }

    const { messageId, feedback, sessionId } = data

    // Skip logging if no sessionId - prevents attaching to wrong user's trace
    if (!sessionId) {
        return Response.json({ success: true, logged: false })
    }

    // Get user ID for tracking
    const userId = getUserIdFromRequest(req)

    try {
        // Score the session's latest chat trace; without one, a standalone
        // feedback trace carries the score
        await scoreLatestTrace(langfuse, {
            sessionId,
            name: "user-feedback",
            value: feedback === "good" ? 1 : 0,
            comment: `User gave ${feedback} feedback`,
            fallbackTrace: {
                name: "user-feedback",
                userId,
                input: { messageId, feedback },
                metadata: {
                    source: "feedback-button",
                    note: "standalone - no chat trace found",
                },
            },
        })

        return Response.json({ success: true, logged: true })
    } catch (error) {
        console.error("Langfuse feedback error:", error)
        return Response.json(
            { success: false, error: "Failed to log feedback" },
            { status: 500 },
        )
    }
}
