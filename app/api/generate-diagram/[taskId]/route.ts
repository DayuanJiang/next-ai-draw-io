import { NextRequest, NextResponse } from "next/server"
import { taskManager } from "@/lib/task-manager"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
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
