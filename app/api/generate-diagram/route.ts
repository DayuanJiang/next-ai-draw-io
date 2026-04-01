import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { taskManager } from "@/lib/task-manager"
import { getUserIdFromRequest } from "@/lib/user-id"
import { checkAndIncrementRequest, isQuotaEnabled } from "@/lib/dynamo-quota-manager"
import { generateDiagramXML } from "@/lib/diagram-generator"
import { renderDiagramToImage } from "@/lib/diagram-renderer"
import { taskQueue } from "@/lib/task-queue"
import { validateAccessCode } from "@/lib/access-code"
import type { ClientOverrides } from "@/lib/ai-providers"

export const maxDuration = 120

const requestSchema = z.object({
    description: z.string().min(1).max(5000),
    format: z.enum(["xml", "png", "svg"]).default("xml"),
    options: z.object({
        width: z.number().min(100).max(4096).optional(),
        height: z.number().min(100).max(4096).optional(),
    }).optional(),
    model: z.object({
        provider: z.string().optional(),
        modelId: z.string().optional(),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        awsAccessKeyId: z.string().optional(),
        awsSecretAccessKey: z.string().optional(),
        awsRegion: z.string().optional(),
        awsSessionToken: z.string().optional(),
        vertexApiKey: z.string().optional(),
    }).optional(),
})

export async function POST(req: NextRequest) {
    // Check access code if configured
    const accessCodeError = validateAccessCode(req)
    if (accessCodeError) return accessCodeError

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
            { error: "Invalid request", details: validation.error.issues },
            { status: 400 }
        )
    }

    const { description, format, options, model } = validation.data

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

    // Build model overrides from request
    const modelOverrides: ClientOverrides | undefined = model ? {
        provider: model.provider,
        modelId: model.modelId,
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        awsAccessKeyId: model.awsAccessKeyId,
        awsSecretAccessKey: model.awsSecretAccessKey,
        awsRegion: model.awsRegion,
        awsSessionToken: model.awsSessionToken,
        vertexApiKey: model.vertexApiKey,
    } : undefined

    // Process task asynchronously with queue
    taskQueue.add(() => processTask(task.taskId, description, format, options, modelOverrides)).catch((error) => {
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
    format: "xml" | "png" | "svg",
    options?: { width?: number; height?: number },
    modelOverrides?: ClientOverrides
): Promise<void> {
    try {
        const task = taskManager.getTask(taskId)
        if (task?.status === "cancelled") return

        taskManager.updateTask(taskId, {
            status: "processing",
            progress: 10,
        })

        const xml = await generateDiagramXML(description, modelOverrides)

        const taskAfterGen = taskManager.getTask(taskId)
        if (taskAfterGen?.status === "cancelled") return

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

        const { url, size } = await renderDiagramToImage(taskId, xml, format, options)

        const taskAfterRender = taskManager.getTask(taskId)
        if (taskAfterRender?.status === "cancelled") return

        taskManager.updateTask(taskId, {
            status: "completed",
            result: { url, size, format },
            completedAt: new Date(),
        })
    } catch (error: any) {
        taskManager.updateTask(taskId, {
            status: "failed",
            error: error.message,
            failedAt: new Date(),
        })
    }
}
