import { randomUUID } from "crypto"
import { z } from "zod"
import { rejectCrossSite } from "@/lib/access-code"
import { getLangfuseClient } from "@/lib/langfuse"
import { getUserIdFromRequest } from "@/lib/user-id"

// A front-end error the page recorded by itself, or that the user reported
// (with a note, which may be empty). Each one becomes a Langfuse trace, in
// the chat's session when the page knows it.
const reportSchema = z.object({
    kind: z.enum(["crash", "uncaught", "toast", "chat-error"]),
    message: z.string().max(2000),
    stack: z.string().max(4000).optional(),
    note: z.string().max(2000).optional(),
    page: z.string().max(500).optional(),
    // A chat error's code and model, and the user's last actions (names)
    code: z.string().max(100).optional(),
    model: z.string().max(200).optional(),
    actions: z.array(z.string().max(100)).max(10).optional(),
    version: z.string().max(50).optional(),
    sessionId: z.string().min(1).max(200).optional(),
})

/** Whether reports are kept; the page offers a GitHub issue when not */
export function GET() {
    return Response.json({ enabled: !!getLangfuseClient() })
}

export async function POST(req: Request) {
    const rejected = rejectCrossSite(req)
    if (rejected) return rejected

    const langfuse = getLangfuseClient()
    if (!langfuse) {
        return Response.json({ success: true, logged: false })
    }

    let data: z.infer<typeof reportSchema>
    try {
        data = reportSchema.parse(await req.json())
    } catch {
        return Response.json(
            { success: false, error: "Invalid input" },
            { status: 400 },
        )
    }

    const {
        kind,
        message,
        stack,
        note,
        page,
        version,
        sessionId,
        code,
        model,
        actions,
    } = data
    const reported = note !== undefined
    const timestamp = new Date().toISOString()
    try {
        const result = await langfuse.api.ingestion.batch({
            batch: [
                {
                    type: "trace-create",
                    id: randomUUID(),
                    timestamp,
                    body: {
                        id: randomUUID(),
                        name: reported ? "user-report" : "client-error",
                        sessionId,
                        userId: getUserIdFromRequest(req),
                        input: reported ? { note, message } : { message },
                        metadata: {
                            kind,
                            code,
                            model,
                            actions,
                            page,
                            version,
                            stack,
                            userAgent: req.headers.get("user-agent"),
                        },
                        tags: code ? [kind, code] : [kind],
                        timestamp,
                    },
                },
            ],
        })
        // Langfuse answers a rejected event with 207 and lists it here
        if (result?.errors?.length) {
            throw new Error(JSON.stringify(result.errors))
        }
        return Response.json({ success: true, logged: true })
    } catch (error) {
        console.error("Langfuse client error report failed:", error)
        return Response.json(
            { success: false, error: "Failed to log the report" },
            { status: 500 },
        )
    }
}
