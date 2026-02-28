// A2A Task Manager - Simple in-memory task state management

export type TaskState =
    | "submitted"
    | "working"
    | "input-required"
    | "completed"
    | "failed"
    | "canceled"

export interface TaskMessage {
    role: "user" | "agent"
    parts: Array<{
        type: "text" | "data"
        text?: string
        data?: unknown
        mimeType?: string
    }>
}

export interface TaskArtifact {
    name: string
    description?: string
    parts: Array<{
        type: "text" | "data"
        text?: string
        data?: unknown
        mimeType?: string
    }>
}

export interface Task {
    id: string
    sessionId: string
    state: TaskState
    messages: TaskMessage[]
    artifacts: TaskArtifact[]
    createdAt: string
    updatedAt: string
    error?: string
}

// Simple in-memory store (can be replaced with Redis/DB for production)
const tasks = new Map<string, Task>()

export function generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function createTask(userMessage: string, sessionId?: string): Task {
    const task: Task = {
        id: generateTaskId(),
        sessionId: sessionId || generateSessionId(),
        state: "submitted",
        messages: [
            {
                role: "user",
                parts: [{ type: "text", text: userMessage }],
            },
        ],
        artifacts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }
    tasks.set(task.id, task)
    return task
}

export function getTask(taskId: string): Task | undefined {
    return tasks.get(taskId)
}

export function updateTaskState(
    taskId: string,
    state: TaskState,
    error?: string,
): Task | undefined {
    const task = tasks.get(taskId)
    if (task) {
        task.state = state
        task.updatedAt = new Date().toISOString()
        if (error) {
            task.error = error
        }
        tasks.set(taskId, task)
    }
    return task
}

export function addTaskMessage(
    taskId: string,
    message: TaskMessage,
): Task | undefined {
    const task = tasks.get(taskId)
    if (task) {
        task.messages.push(message)
        task.updatedAt = new Date().toISOString()
        tasks.set(taskId, task)
    }
    return task
}

export function addTaskArtifact(
    taskId: string,
    artifact: TaskArtifact,
): Task | undefined {
    const task = tasks.get(taskId)
    if (task) {
        task.artifacts.push(artifact)
        task.updatedAt = new Date().toISOString()
        tasks.set(taskId, task)
    }
    return task
}

export function cancelTask(taskId: string): Task | undefined {
    return updateTaskState(taskId, "canceled")
}

export function listTasks(sessionId?: string): Task[] {
    const allTasks = Array.from(tasks.values())
    if (sessionId) {
        return allTasks.filter((t) => t.sessionId === sessionId)
    }
    return allTasks
}

// Cleanup old tasks (call periodically)
export function cleanupOldTasks(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now()
    for (const [id, task] of tasks.entries()) {
        const age = now - new Date(task.createdAt).getTime()
        if (age > maxAgeMs) {
            tasks.delete(id)
        }
    }
}
