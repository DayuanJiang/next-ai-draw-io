import { NextRequest, NextResponse } from "next/server"
import { taskManager } from "@/lib/task-manager"
import { getDiagramImage } from "@/lib/diagram-storage"

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

  if (task.status !== "completed") {
    return NextResponse.json(
      { error: "Task not completed yet" },
      { status: 400 }
    )
  }

  if (task.format === "xml") {
    return NextResponse.json(
      { error: "XML format does not support download" },
      { status: 400 }
    )
  }

  const imageBuffer = getDiagramImage(taskId, task.format)

  if (!imageBuffer) {
    return NextResponse.json(
      { error: "Image file not found" },
      { status: 404 }
    )
  }

  const contentType = task.format === "png" ? "image/png" : "image/svg+xml"

  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${params.taskId}.${task.format}"`,
    },
  })
}
