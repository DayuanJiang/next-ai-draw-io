import { NextRequest, NextResponse } from "next/server"
import { taskManager } from "@/lib/task-manager"
import { getDiagramImage } from "@/lib/diagram-storage"
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

  // Only png and svg are supported for download
  if (task.format !== "png" && task.format !== "svg") {
    return NextResponse.json(
      { error: `Format "${task.format}" does not support download` },
      { status: 400 }
    )
  }

  const imageBuffer = await getDiagramImage(taskId, task.format)

  if (!imageBuffer) {
    return NextResponse.json(
      { error: "Image file not found" },
      { status: 404 }
    )
  }

  const contentType = task.format === "png" ? "image/png" : "image/svg+xml"

  return new NextResponse(new Uint8Array(imageBuffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${taskId}.${task.format}"`,
      "Cache-Control": "public, max-age=86400, immutable",
      "ETag": `"${taskId}"`,
    },
  })
}
