import { randomUUID } from "crypto"
import { z } from "zod"
import { getLangfuseClient } from "@/lib/langfuse"
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
        // Find the most recent chat trace for this session to attach the score to
        const tracesResponse = await langfuse.api.trace.list({
            sessionId,
            limit: 1,
        })

        const traces = tracesResponse.data || []
        const latestTrace = traces[0]

        if (!latestTrace) {
            // No trace found for this session - create a standalone feedback trace
            const traceId = randomUUID()
            const timestamp = new Date().toISOString()

            await langfuse.api.ingestion.batch({
                batch: [
                    {
                        type: "trace-create",
                        id: randomUUID(),
                        timestamp,
                        body: {
                            id: traceId,
                            name: "user-feedback",
                            sessionId,
                            userId,
                            input: { messageId, feedback },
                            metadata: {
                                source: "feedback-button",
                                note: "standalone - no chat trace found",
                            },
                            timestamp,
                        },
                    },
                    {
                        type: "score-create",
                        id: randomUUID(),
                        timestamp,
                        body: {
                            id: randomUUID(),
                            traceId,
                            name: "user-feedback",
                            value: feedback === "good" ? 1 : 0,
                            comment: `User gave ${feedback} feedback`,
                        },
                    },
                ],
            })
        } else {
            // Attach score to the existing chat trace
            const timestamp = new Date().toISOString()

            await langfuse.api.ingestion.batch({
                batch: [
                    {
                        type: "score-create",
                        id: randomUUID(),
                        timestamp,
                        body: {
                            id: randomUUID(),
                            traceId: latestTrace.id,
                            name: "user-feedback",
                            value: feedback === "good" ? 1 : 0,
                            comment: `User gave ${feedback} feedback`,
                        },
                    },
                ],
            })
        }

        return Response.json({ success: true, logged: true })
    } catch (error) {
        console.error("Langfuse feedback error:", error)
        return Response.json(
            { success: false, error: "Failed to log feedback" },
            { status: 500 },
        )
    }
}
