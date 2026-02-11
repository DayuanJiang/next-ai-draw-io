import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { taskManager } from "@/lib/task-manager"
import { getUserIdFromRequest } from "@/lib/user-id"
import { checkAndIncrementRequest, isQuotaEnabled } from "@/lib/dynamo-quota-manager"
import { generateDiagramXML } from "@/lib/diagram-generator"

export const maxDuration = 120

const requestSchema = z.object({
    description: z.string().min(1).max(5000),
    format: z.enum(["xml", "png", "svg"]).default("xml"),
    options: z.object({
        width: z.number().min(100).max(4096).optional(),
        height: z.number().min(100).max(4096).optional(),
    }).optional(),
})

export async function POST(req: NextRequest) {
    // Check access code if configured
    const accessCodes = process.env.ACCESS_CODE_LIST?.split(",")
        .map((code) => code.trim())
        .filter(Boolean) || []

    if (accessCodes.length > 0) {
        const accessCodeHeader = req.headers.get("x-access-code")
        if (!accessCodeHeader || !accessCodes.includes(accessCodeHeader)) {
            return NextResponse.json(
                { error: "Invalid or missing access code" },
                { status: 401 }
            )
        }
    }

    // Parse and validate request body
    let body
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        )
    }

    const validation = requestSchema.safeParse(body)
    if (!validation.success) {
        return NextResponse.json(
            { error: "Invalid request", details: validation.error.errors },
            { status: 400 }
        )
    }

    const { description, format, options } = validation.data

    // Check quota if enabled
    if (isQuotaEnabled()) {
        const userId = getUserIdFromRequest(req)
        const quotaResult = await checkAndIncrementRequest(userId, {
            requests: Number(process.env.DAILY_REQUEST_LIMIT || 999999),
            tokens: Number(process.env.DAILY_TOKEN_LIMIT || 999999),
            tpm: Number(process.env.TPM_LIMIT || 999999),
        })

        if (!quotaResult.allowed) {
            return NextResponse.json(
                { error: quotaResult.error, type: quotaResult.type },
                { status: 429 }
            )
        }
    }

    // Create task
    const task = taskManager.createTask(format, description, options)

    // Process task asynchronously
    processTask(task.taskId, description, format).catch((error) => {
        console.error(`[generate-diagram] Task ${task.taskId} failed:`, error)
        taskManager.updateTask(task.taskId, {
            status: "failed",
            error: error.message,
            failedAt: new Date(),
        })
    })

    // Return task ID and status immediately
    return NextResponse.json({
        taskId: task.taskId,
        status: task.status,
    })
}

async function processTask(
    taskId: string,
    description: string,
    format: "xml" | "png" | "svg"
): Promise<void> {
    try {
        taskManager.updateTask(taskId, {
            status: "processing",
            progress: 10,
        })

        const xml = await generateDiagramXML(description)

        taskManager.updateTask(taskId, {
            progress: 50,
        })

        if (format === "xml") {
            taskManager.updateTask(taskId, {
                status: "completed",
                result: xml,
                completedAt: new Date(),
            })
            return
        }

        // TODO: Implement image conversion in Task 7
        throw new Error(`Format ${format} not yet implemented`)
    } catch (error: any) {
        taskManager.updateTask(taskId, {
            status: "failed",
            error: error.message,
            failedAt: new Date(),
        })
    }
}
