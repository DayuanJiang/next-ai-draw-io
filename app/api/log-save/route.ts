import { z } from "zod"
import { getLangfuseClient, scoreLatestTrace } from "@/lib/langfuse"

const saveSchema = z.object({
    filename: z.string().min(1).max(255),
    format: z.enum(["drawio", "png", "svg", "xmlsvg"]),
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
        data = saveSchema.parse(await req.json())
    } catch {
        return Response.json(
            { success: false, error: "Invalid input" },
            { status: 400 },
        )
    }

    const { filename, format, sessionId } = data

    // Skip logging if no sessionId - prevents attaching to wrong user's trace
    if (!sessionId) {
        return Response.json({ success: true, logged: false })
    }

    try {
        // Flag the session's latest chat trace as saved; a session without a
        // trace (no chat yet) is skipped
        const logged = await scoreLatestTrace(langfuse, {
            sessionId,
            name: "diagram-saved",
            value: 1,
            comment: `User saved diagram as ${filename}.${format}`,
        })

        return Response.json({ success: true, logged })
    } catch (error) {
        console.error("Langfuse save error:", error)
        return Response.json(
            { success: false, error: "Failed to log save" },
            { status: 500 },
        )
    }
}
