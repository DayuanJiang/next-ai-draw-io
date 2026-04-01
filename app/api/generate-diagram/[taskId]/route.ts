import { NextRequest, NextResponse } from "next/server"
import { taskManager } from "@/lib/task-manager"
import { validateAccessCode } from "@/lib/access-code"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const accessCodeError = validateAccessCode(req)
  if (accessCodeError) return accessCodeError

  const { taskId } = await params
  const task = taskManager.getTask(taskId)

  if (!task) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }

  return NextResponse.json(task)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const accessCodeError = validateAccessCode(req)
  if (accessCodeError) return accessCodeError

  const { taskId } = await params
  const cancelled = taskManager.cancelTask(taskId)

  if (!cancelled) {
    return NextResponse.json(
      { error: "Task not found or already completed" },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true, taskId })
}
