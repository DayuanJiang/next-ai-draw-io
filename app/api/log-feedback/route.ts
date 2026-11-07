import { z } from "zod"
import { getLangfuseClient, scoreLatestTrace } from "@/lib/langfuse"
import { getUserIdFromRequest } from "@/lib/user-id"

const feedbackSchema = z.object({
    messageId: z.string().min(1).max(200),
    feedback: z.enum(["good", "bad"]),
    sessionId: z.string().min(1).max(200).optional(),
    // The answer's own trace (answers saved before it was sent have none)
    traceId: z
        .string()
        .regex(/^[0-9a-f]{32}$/)
        .optional(),
    // Why a bad answer was bad, picked and written after the vote
    reasons: z
        .array(
            z.enum([
                "wrong-diagram",
                "messy-layout",
                "ignored-request",
                "too-slow",
            ]),
        )
        .max(4)
        .optional(),
    note: z.string().max(1000).optional(),
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

    const { messageId, feedback, sessionId, traceId, reasons, note } = data

    // Skip logging if no sessionId - prevents attaching to wrong user's trace
    if (!sessionId) {
        return Response.json({ success: true, logged: false })
    }

    // Get user ID for tracking
    const userId = getUserIdFromRequest(req)

    try {
        // Score the answer's trace, else the session's latest chat trace;
        // without one, a standalone feedback trace carries the score. One
        // score per answer: a changed vote or the reasons sent after it
        // replace the one before.
        const userNote = note?.trim() ?? ""
        const comment = [
            `User gave ${feedback} feedback.`,
            reasons?.length && `Reasons: ${reasons.join(", ")}.`,
            userNote && `Note: ${userNote}`,
        ]
            .filter(Boolean)
            .join(" ")
        await scoreLatestTrace(langfuse, {
            sessionId,
            traceId,
            scoreId: `feedback-${sessionId}-${messageId}`,
            name: "user-feedback",
            value: feedback === "good" ? 1 : 0,
            comment,
            metadata:
                reasons?.length || userNote
                    ? { reasons: reasons ?? [], note: userNote }
                    : undefined,
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
