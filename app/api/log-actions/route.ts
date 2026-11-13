import { randomUUID } from "crypto"
import { z } from "zod"
import { rejectCrossSite } from "@/lib/access-code"
import { getLangfuseClient } from "@/lib/langfuse"
import { getUserIdFromRequest } from "@/lib/user-id"

// The names of what a user did in the editor since the page last sent them
// ("send", "export png"), each with how long ago it was. They become one
// Langfuse trace, in the chat's session when the page knows it, next to its
// chat traces.
const actionsSchema = z.object({
    actions: z
        .array(
            z.object({
                name: z.string().min(1).max(60),
                ago: z.number().min(0),
            }),
        )
        .min(1)
        .max(50),
    page: z.string().max(500).optional(),
    version: z.string().max(50).optional(),
    sessionId: z.string().min(1).max(200).optional(),
})

export async function POST(req: Request) {
    const rejected = rejectCrossSite(req)
    if (rejected) return rejected

    const langfuse = getLangfuseClient()
    if (!langfuse) {
        return Response.json({ success: true, logged: false })
    }

    let data: z.infer<typeof actionsSchema>
    try {
        data = actionsSchema.parse(await req.json())
    } catch {
        return Response.json(
            { success: false, error: "Invalid input" },
            { status: 400 },
        )
    }

    const { actions, page, version, sessionId } = data
    const now = Date.now()
    const timestamp = new Date(now).toISOString()
    try {
        const result = await langfuse.api.ingestion.batch({
            batch: [
                {
                    type: "trace-create",
                    id: randomUUID(),
                    timestamp,
                    body: {
                        id: randomUUID(),
                        name: "user-actions",
                        sessionId,
                        userId: getUserIdFromRequest(req),
                        // Oldest first, timed by the server's clock
                        input: actions.map((action) => ({
                            name: action.name,
                            at: new Date(now - action.ago).toISOString(),
                        })),
                        metadata: {
                            page,
                            version,
                            userAgent: req.headers.get("user-agent"),
                        },
                        // To find the traces with a given action
                        tags: [...new Set(actions.map((a) => a.name))],
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
        console.error("Langfuse usage log failed:", error)
        return Response.json(
            { success: false, error: "Failed to log the actions" },
            { status: 500 },
        )
    }
}
