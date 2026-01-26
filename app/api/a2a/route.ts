import { generateText } from "ai"
import {
    addTaskArtifact,
    addTaskMessage,
    cancelTask,
    createTask,
    getTask,
    listTasks,
    type Task,
    type TaskMessage,
    updateTaskState,
} from "@/lib/a2a-task-manager"
import { getAIModel } from "@/lib/ai-providers"
import { getSystemPrompt } from "@/lib/system-prompts"

export const maxDuration = 120

// Valid A2A methods
const VALID_METHODS = [
    "tasks/send",
    "tasks/get",
    "tasks/cancel",
    "tasks/list",
] as const
type A2AMethod = (typeof VALID_METHODS)[number]

// Validate A2A request manually (zod v4 has breaking changes)
function validateA2ARequest(body: unknown):
    | {
          valid: true
          id: string | number
          method: A2AMethod
          params?: Record<string, unknown>
      }
    | { valid: false; error: string } {
    if (typeof body !== "object" || body === null) {
        return { valid: false, error: "Request must be an object" }
    }

    const req = body as Record<string, unknown>

    if (req.jsonrpc !== "2.0") {
        return { valid: false, error: "jsonrpc must be '2.0'" }
    }

    if (typeof req.id !== "string" && typeof req.id !== "number") {
        return { valid: false, error: "id must be a string or number" }
    }

    if (
        typeof req.method !== "string" ||
        !VALID_METHODS.includes(req.method as A2AMethod)
    ) {
        return { valid: false, error: "Invalid method" }
    }

    return {
        valid: true,
        id: req.id as string | number,
        method: req.method as A2AMethod,
        params: req.params as Record<string, unknown> | undefined,
    }
}

// Helper to create JSON-RPC response
function jsonRpcResponse(id: string | number, result: unknown) {
    return Response.json({
        jsonrpc: "2.0",
        id,
        result,
    })
}

// Helper to create JSON-RPC error response
function jsonRpcError(
    id: string | number | null,
    code: number,
    message: string,
) {
    return Response.json({
        jsonrpc: "2.0",
        id,
        error: { code, message },
    })
}

// Convert Task to A2A Task format
function formatTaskResponse(task: Task) {
    return {
        id: task.id,
        sessionId: task.sessionId,
        status: {
            state: task.state,
            ...(task.error && {
                message: {
                    role: "agent",
                    parts: [{ type: "text", text: task.error }],
                },
            }),
        },
        artifacts: task.artifacts,
        history: task.messages,
    }
}

// Process diagram generation task
async function processTask(task: Task, userMessage: string): Promise<void> {
    try {
        updateTaskState(task.id, "working")
        console.log("[A2A] Processing task:", task.id)

        const { model, providerOptions, modelId } = getAIModel({})
        const systemMessage = getSystemPrompt(modelId, false)

        // Simplified prompt for A2A - ask AI to generate XML directly
        const prompt = `${systemMessage}

Current diagram XML (empty - starting fresh):
"""
"""

User request: ${userMessage}

Please generate a draw.io diagram. Output ONLY the mxCell XML elements, no wrapper tags.
Start your response with the XML directly.`

        // Use generateText for simpler non-streaming response
        const result = await generateText({
            model,
            prompt,
            ...(providerOptions && { providerOptions }),
            ...(process.env.TEMPERATURE !== undefined && {
                temperature: parseFloat(process.env.TEMPERATURE),
            }),
        })

        const fullText = result.text
        console.log("[A2A] AI response length:", fullText.length)

        // Try to extract XML from response
        let diagramXml = ""
        const xmlMatch = fullText.match(/<mxCell[\s\S]*<\/mxCell>/g)
        if (xmlMatch) {
            diagramXml = xmlMatch.join("\n")
        }

        // Add agent response message
        const agentMessage: TaskMessage = {
            role: "agent",
            parts: [{ type: "text", text: fullText }],
        }
        addTaskMessage(task.id, agentMessage)

        // Add diagram as artifact if XML found
        if (diagramXml) {
            addTaskArtifact(task.id, {
                name: "diagram.xml",
                description: "Generated draw.io diagram in XML format",
                parts: [
                    {
                        type: "data",
                        data: diagramXml,
                        mimeType: "application/xml",
                    },
                ],
            })
        }

        updateTaskState(task.id, "completed")
        console.log("[A2A] Task completed:", task.id)
    } catch (error) {
        console.error("[A2A] Task error:", error)
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
        updateTaskState(task.id, "failed", errorMessage)
    }
}

// Handle tasks/send - Create and execute a new task
async function handleTasksSend(
    id: string | number,
    params: Record<string, unknown>,
) {
    const message = params.message as
        | { role: string; parts: Array<{ type: string; text?: string }> }
        | undefined
    const sessionId = params.sessionId as string | undefined

    if (!message || !message.parts || message.parts.length === 0) {
        return jsonRpcError(
            id,
            -32602,
            "Invalid params: message with parts is required",
        )
    }

    const textPart = message.parts.find((p) => p.type === "text")
    if (!textPart || !textPart.text) {
        return jsonRpcError(
            id,
            -32602,
            "Invalid params: text message is required",
        )
    }

    // Create task
    const task = createTask(textPart.text, sessionId)

    // Process task asynchronously
    processTask(task, textPart.text)

    // Return immediately with task info
    return jsonRpcResponse(id, formatTaskResponse(task))
}

// Handle tasks/get - Get task status
function handleTasksGet(id: string | number, params: Record<string, unknown>) {
    const taskId = params.id as string | undefined

    if (!taskId) {
        return jsonRpcError(id, -32602, "Invalid params: task id is required")
    }

    const task = getTask(taskId)
    if (!task) {
        return jsonRpcError(id, -32001, "Task not found")
    }

    return jsonRpcResponse(id, formatTaskResponse(task))
}

// Handle tasks/cancel - Cancel a task
function handleTasksCancel(
    id: string | number,
    params: Record<string, unknown>,
) {
    const taskId = params.id as string | undefined

    if (!taskId) {
        return jsonRpcError(id, -32602, "Invalid params: task id is required")
    }

    const task = cancelTask(taskId)
    if (!task) {
        return jsonRpcError(id, -32001, "Task not found")
    }

    return jsonRpcResponse(id, formatTaskResponse(task))
}

// Handle tasks/list - List tasks
function handleTasksList(id: string | number, params: Record<string, unknown>) {
    const sessionId = params.sessionId as string | undefined
    const tasks = listTasks(sessionId)

    return jsonRpcResponse(
        id,
        tasks.map((t) => formatTaskResponse(t)),
    )
}

export async function POST(req: Request) {
    try {
        const body = await req.json()
        console.log("[A2A] Received request:", JSON.stringify(body, null, 2))

        // Validate JSON-RPC request
        const validation = validateA2ARequest(body)
        if (!validation.valid) {
            console.log("[A2A] Invalid request:", validation.error)
            return jsonRpcError(null, -32600, validation.error)
        }

        const { id, method, params } = validation
        console.log("[A2A] Method:", method)

        switch (method) {
            case "tasks/send":
                return await handleTasksSend(id, params || {})
            case "tasks/get":
                return handleTasksGet(id, params || {})
            case "tasks/cancel":
                return handleTasksCancel(id, params || {})
            case "tasks/list":
                return handleTasksList(id, params || {})
            default:
                return jsonRpcError(id, -32601, "Method not found")
        }
    } catch (error) {
        console.error("[A2A] API error:", error)
        const message =
            error instanceof Error ? error.message : "Internal error"
        return jsonRpcError(null, -32603, message)
    }
}

// GET endpoint for Agent Card discovery
export async function GET() {
    return Response.json({
        name: "AI Draw.io Agent",
        description: "An AI-powered diagram generation agent",
        url: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:6002",
        version: "1.0.0",
        capabilities: {
            streaming: false, // A2A uses polling for now
            pushNotifications: false,
            stateTransitionHistory: true,
        },
        skills: [
            {
                id: "generate-diagram",
                name: "Generate Diagram",
                description:
                    "Generate a draw.io diagram from a text description",
            },
        ],
        defaultInputModes: ["text"],
        defaultOutputModes: ["text", "data"],
    })
}
