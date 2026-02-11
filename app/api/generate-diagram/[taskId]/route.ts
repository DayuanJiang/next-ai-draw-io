import { NextRequest, NextResponse } from "next/server"
import { taskManager } from "@/lib/task-manager"

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
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

  const task = taskManager.getTask(params.taskId)

  if (!task) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }

  return NextResponse.json(task)
}
