# Generate Diagram API 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 创建一个异步 API 接口，接收文本描述并返回生成的图表（XML 或图片格式）

**架构:** 使用内存存储的任务队列系统，支持异步任务处理。客户端通过轮询方式查询任务状态。使用 Puppeteer 进行服务器端图片渲染。

**技术栈:** Next.js App Router, TypeScript, Puppeteer, 现有的 AI SDK 和认证系统

---

## Task 1: 创建任务管理系统

**文件:**
- Create: `lib/task-manager.ts`

**Step 1: 编写任务管理器接口定义**

```typescript
// lib/task-manager.ts
export type TaskStatus = "pending" | "processing" | "completed" | "failed"
export type TaskFormat = "xml" | "png" | "svg"

export interface TaskOptions {
    width?: number
    height?: number
}

export interface Task {
    taskId: string
    status: TaskStatus
    format: TaskFormat
    description: string
    options?: TaskOptions
    result?: {
        xml?: string
        url?: string
        size?: number
    }
    error?: string
    progress?: number
    createdAt: string
    completedAt?: string
    failedAt?: string
}

export interface TaskManager {
    createTask(description: string, format: TaskFormat, options?: TaskOptions): Task
    getTask(taskId: string): Task | undefined
    updateTask(taskId: string, updates: Partial<Task>): void
    deleteTask(taskId: string): void
    cleanupOldTasks(maxAgeMs: number): void
}
```

**Step 2: 实现内存存储的任务管理器**

```typescript
// lib/task-manager.ts (继续)
class InMemoryTaskManager implements TaskManager {
    private tasks: Map<string, Task> = new Map()

    createTask(description: string, format: TaskFormat, options?: TaskOptions): Task {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const task: Task = {
            taskId,
            status: "pending",
            format,
            description,
            options,
            createdAt: new Date().toISOString(),
        }
        this.tasks.set(taskId, task)
        return task
    }

    getTask(taskId: string): Task | undefined {
        return this.tasks.get(taskId)
    }

    updateTask(taskId: string, updates: Partial<Task>): void {
        const task = this.tasks.get(taskId)
        if (task) {
            Object.assign(task, updates)
        }
    }

    deleteTask(taskId: string): void {
        this.tasks.delete(taskId)
    }

    cleanupOldTasks(maxAgeMs: number = 3600000): void {
        const now = Date.now()
        for (const [taskId, task] of this.tasks.entries()) {
            const createdAt = new Date(task.createdAt).getTime()
            if (now - createdAt > maxAgeMs) {
                this.tasks.delete(taskId)
            }
        }
    }
}

export const taskManager = new InMemoryTaskManager()

// 定期清理过期任务（1小时）
if (typeof setInterval !== "undefined") {
    setInterval(() => {
        taskManager.cleanupOldTasks()
    }, 3600000)
}
```

**Step 3: 提交任务管理器代码**

```bash
git add lib/task-manager.ts
git commit -m "feat: add in-memory task manager for async diagram generation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: 创建 POST /api/generate-diagram 端点

**文件:**
- Create: `app/api/generate-diagram/route.ts`

**Step 1: 创建基础路由结构**

```typescript
// app/api/generate-diagram/route.ts
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { taskManager } from "@/lib/task-manager"
import { getUserIdFromRequest } from "@/lib/user-id"
import {
    checkAndIncrementRequest,
    isQuotaEnabled,
} from "@/lib/dynamo-quota-manager"

export const maxDuration = 120

const requestSchema = z.object({
    description: z.string().min(1).max(5000),
    format: z.enum(["xml", "png", "svg"]).default("xml"),
    options: z
        .object({
            width: z.number().min(100).max(4096).optional(),
            height: z.number().min(100).max(4096).optional(),
        })
        .optional(),
})

export async function POST(req: NextRequest) {
    try {
        // 1. 检查访问码
        const accessCodes =
            process.env.ACCESS_CODE_LIST?.split(",")
                .map((code) => code.trim())
                .filter(Boolean) || []
        if (accessCodes.length > 0) {
            const accessCodeHeader = req.headers.get("x-access-code")
            if (!accessCodeHeader || !accessCodes.includes(accessCodeHeader)) {
                return NextResponse.json(
                    {
                        error: "Invalid or missing access code",
                    },
                    { status: 401 },
                )
            }
        }

        // 2. 解析请求体
        const body = await req.json()
        const validatedData = requestSchema.parse(body)

        // 3. 检查配额
        const userId = getUserIdFromRequest(req)
        if (isQuotaEnabled() && userId !== "anonymous") {
            const quotaCheck = await checkAndIncrementRequest(userId, {
                requests: Number(process.env.DAILY_REQUEST_LIMIT) || 10,
                tokens: Number(process.env.DAILY_TOKEN_LIMIT) || 200000,
                tpm: Number(process.env.TPM_LIMIT) || 20000,
            })
            if (!quotaCheck.allowed) {
                return NextResponse.json(
                    {
                        error: quotaCheck.error,
                        type: quotaCheck.type,
                        used: quotaCheck.used,
                        limit: quotaCheck.limit,
                    },
                    { status: 429 },
                )
            }
        }

        // 4. 创建任务
        const task = taskManager.createTask(
            validatedData.description,
            validatedData.format,
            validatedData.options,
        )

        // 5. 异步处理任务（不阻塞响应）
        processTask(task.taskId, validatedData.description, validatedData.format)
            .catch((error) => {
                taskManager.updateTask(task.taskId, {
                    status: "failed",
                    error: error.message,
                    failedAt: new Date().toISOString(),
                })
            })

        // 6. 立即返回任务 ID
        return NextResponse.json({
            taskId: task.taskId,
            status: task.status,
            message: "任务已创建，正在处理中",
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.errors },
                { status: 400 },
            )
        }
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        )
    }
}

// 异步处理任务的函数（稍后实现）
async function processTask(
    taskId: string,
    description: string,
    format: string,
): Promise<void> {
    // TODO: 在 Task 3 中实现
}
```

**Step 2: 提交 POST 端点代码**

```bash
git add app/api/generate-diagram/route.ts
git commit -m "feat: add POST /api/generate-diagram endpoint

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: 创建 GET /api/generate-diagram/[taskId] 端点

**文件:**
- Create: `app/api/generate-diagram/[taskId]/route.ts`

**Step 1: 创建查询任务状态端点**

```typescript
// app/api/generate-diagram/[taskId]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { taskManager } from "@/lib/task-manager"

export async function GET(
    req: NextRequest,
    { params }: { params: { taskId: string } },
) {
    try {
        const { taskId } = params

        // 1. 检查访问码
        const accessCodes =
            process.env.ACCESS_CODE_LIST?.split(",")
                .map((code) => code.trim())
                .filter(Boolean) || []
        if (accessCodes.length > 0) {
            const accessCodeHeader = req.headers.get("x-access-code")
            if (!accessCodeHeader || !accessCodes.includes(accessCodeHeader)) {
                return NextResponse.json(
                    {
                        error: "Invalid or missing access code",
                    },
                    { status: 401 },
                )
            }
        }

        // 2. 查询任务
        const task = taskManager.getTask(taskId)
        if (!task) {
            return NextResponse.json(
                { error: "Task not found" },
                { status: 404 },
            )
        }

        // 3. 返回任务状态
        return NextResponse.json(task)
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        )
    }
}
```

**Step 2: 提交 GET 端点代码**

```bash
git add app/api/generate-diagram/[taskId]/route.ts
git commit -m "feat: add GET /api/generate-diagram/[taskId] endpoint

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: 创建图片下载端点

**文件:**
- Create: `app/api/generate-diagram/[taskId]/download/route.ts`
- Create: `lib/diagram-storage.ts`

**Step 1: 创建图片存储管理器**

```typescript
// lib/diagram-storage.ts
import fs from "fs/promises"
import path from "path"

const STORAGE_DIR = path.join(process.cwd(), ".next", "cache", "diagrams")

export async function ensureStorageDir(): Promise<void> {
    await fs.mkdir(STORAGE_DIR, { recursive: true })
}

export async function saveDiagramImage(
    taskId: string,
    buffer: Buffer,
    format: "png" | "svg",
): Promise<string> {
    await ensureStorageDir()
    const filename = `${taskId}.${format}`
    const filepath = path.join(STORAGE_DIR, filename)
    await fs.writeFile(filepath, buffer)
    return filepath
}

export async function getDiagramImage(
    taskId: string,
    format: "png" | "svg",
): Promise<Buffer | null> {
    const filename = `${taskId}.${format}`
    const filepath = path.join(STORAGE_DIR, filename)
    try {
        return await fs.readFile(filepath)
    } catch (error) {
        return null
    }
}

export async function deleteDiagramImage(
    taskId: string,
    format: "png" | "svg",
): Promise<void> {
    const filename = `${taskId}.${format}`
    const filepath = path.join(STORAGE_DIR, filename)
    try {
        await fs.unlink(filepath)
    } catch (error) {
        // 忽略文件不存在的错误
    }
}
```

**Step 2: 创建下载端点**

```typescript
// app/api/generate-diagram/[taskId]/download/route.ts
import { NextRequest, NextResponse } from "next/server"
import { taskManager } from "@/lib/task-manager"
import { getDiagramImage } from "@/lib/diagram-storage"

export async function GET(
    req: NextRequest,
    { params }: { params: { taskId: string } },
) {
    try {
        const { taskId } = params

        // 1. 检查访问码
        const accessCodes =
            process.env.ACCESS_CODE_LIST?.split(",")
                .map((code) => code.trim())
                .filter(Boolean) || []
        if (accessCodes.length > 0) {
            const accessCodeHeader = req.headers.get("x-access-code")
            if (!accessCodeHeader || !accessCodes.includes(accessCodeHeader)) {
                return NextResponse.json(
                    {
                        error: "Invalid or missing access code",
                    },
                    { status: 401 },
                )
            }
        }

        // 2. 查询任务
        const task = taskManager.getTask(taskId)
        if (!task) {
            return NextResponse.json(
                { error: "Task not found" },
                { status: 404 },
            )
        }

        // 3. 检查任务状态
        if (task.status !== "completed") {
            return NextResponse.json(
                { error: "Task not completed yet" },
                { status: 400 },
            )
        }

        // 4. 检查格式
        if (task.format === "xml") {
            return NextResponse.json(
                { error: "XML format does not support download" },
                { status: 400 },
            )
        }

        // 5. 读取图片文件
        const buffer = await getDiagramImage(taskId, task.format as "png" | "svg")
        if (!buffer) {
            return NextResponse.json(
                { error: "Image file not found" },
                { status: 404 },
            )
        }

        // 6. 返回图片文件
        const contentType =
            task.format === "png" ? "image/png" : "image/svg+xml"
        return new NextResponse(buffer, {
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${taskId}.${task.format}"`,
            },
        })
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        )
    }
}
```

**Step 3: 提交图片存储和下载端点代码**

```bash
git add lib/diagram-storage.ts app/api/generate-diagram/[taskId]/download/route.ts
git commit -m "feat: add diagram storage and download endpoint

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: 实现 AI 图表生成逻辑

**文件:**
- Create: `lib/diagram-generator.ts`
- Modify: `app/api/generate-diagram/route.ts`

**Step 1: 创建图表生成器**

```typescript
// lib/diagram-generator.ts
import { streamText } from "ai"
import { getAIModel } from "@/lib/ai-providers"
import { getSystemPrompt } from "@/lib/system-prompts"

export async function generateDiagramXML(
    description: string,
): Promise<string> {
    // 1. 获取 AI 模型
    const model = getAIModel()

    // 2. 构建系统提示
    const systemPrompt = getSystemPrompt({
        xml: "",
        previousXml: "",
        isMinimalDiagram: true,
    })

    // 3. 构建用户消息
    const userMessage = {
        role: "user" as const,
        parts: [
            {
                type: "text" as const,
                text: description,
            },
        ],
    }

    // 4. 调用 AI 模型生成图表
    const result = await streamText({
        model,
        messages: [
            {
                role: "system",
                content: systemPrompt,
            },
            userMessage,
        ],
        maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS) || 8192,
    })

    // 5. 提取 XML
    let xml = ""
    for await (const chunk of result.textStream) {
        // 查找 display_diagram 工具调用
        if (chunk.includes("<mxfile")) {
            const match = chunk.match(/<mxfile[\s\S]*?<\/mxfile>/i)
            if (match) {
                xml = match[0]
                break
            }
        }
    }

    if (!xml) {
        throw new Error("Failed to generate diagram XML")
    }

    return xml
}
```

**Step 2: 更新 processTask 函数**

```typescript
// app/api/generate-diagram/route.ts (更新 processTask 函数)
import { generateDiagramXML } from "@/lib/diagram-generator"

async function processTask(
    taskId: string,
    description: string,
    format: string,
): Promise<void> {
    try {
        // 1. 更新任务状态为处理中
        taskManager.updateTask(taskId, {
            status: "processing",
            progress: 10,
        })

        // 2. 生成 XML
        const xml = await generateDiagramXML(description)

        taskManager.updateTask(taskId, {
            progress: 50,
        })

        // 3. 如果格式是 XML，直接返回
        if (format === "xml") {
            taskManager.updateTask(taskId, {
                status: "completed",
                result: { xml },
                completedAt: new Date().toISOString(),
            })
            return
        }

        // 4. 如果格式是图片，继续处理（在 Task 6 中实现）
        // TODO: 在 Task 6 中实现图片生成
        throw new Error("Image generation not implemented yet")
    } catch (error) {
        taskManager.updateTask(taskId, {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            failedAt: new Date().toISOString(),
        })
    }
}
```

**Step 3: 提交图表生成逻辑**

```bash
git add lib/diagram-generator.ts app/api/generate-diagram/route.ts
git commit -m "feat: implement AI diagram generation logic

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: 安装和配置 Puppeteer

**文件:**
- Modify: `package.json`

**Step 1: 安装 Puppeteer**

```bash
npm install puppeteer
```

**Step 2: 提交依赖更新**

```bash
git add package.json package-lock.json
git commit -m "feat: add puppeteer for server-side diagram rendering

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: 实现图片生成逻辑

**文件:**
- Create: `lib/diagram-renderer.ts`
- Modify: `app/api/generate-diagram/route.ts`

**Step 1: 创建图片渲染器**

```typescript
// lib/diagram-renderer.ts
import puppeteer from "puppeteer"
import { saveDiagramImage } from "@/lib/diagram-storage"

export async function renderDiagramToImage(
    taskId: string,
    xml: string,
    format: "png" | "svg",
    options?: { width?: number; height?: number },
): Promise<{ url: string; size: number }> {
    let browser
    try {
        // 1. 启动无头浏览器
        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        })

        const page = await browser.newPage()

        // 2. 设置视口大小
        await page.setViewport({
            width: options?.width || 1920,
            height: options?.height || 1080,
        })

        // 3. 加载 Draw.io embed URL
        const drawioUrl =
            process.env.NEXT_PUBLIC_DRAWIO_BASE_URL ||
            "https://embed.diagrams.net"
        await page.goto(
            `${drawioUrl}/?embed=1&proto=json&spin=0&libraries=0`,
            {
                waitUntil: "networkidle0",
                timeout: 30000,
            },
        )

        // 4. 等待 Draw.io 加载完成
        await page.waitForSelector("iframe", { timeout: 10000 })

        // 5. 注入 XML
        await page.evaluate((xmlContent) => {
            const iframe = document.querySelector("iframe") as HTMLIFrameElement
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(
                    JSON.stringify({
                        action: "load",
                        xml: xmlContent,
                    }),
                    "*",
                )
            }
        }, xml)

        // 6. 等待渲染完成
        await page.waitForTimeout(2000)

        // 7. 截图或导出 SVG
        let buffer: Buffer
        if (format === "png") {
            buffer = await page.screenshot({
                type: "png",
                fullPage: true,
            })
        } else {
            // SVG 导出（简化实现，实际可能需要更复杂的逻辑）
            const svgContent = await page.evaluate(() => {
                const svg = document.querySelector("svg")
                return svg ? svg.outerHTML : ""
            })
            buffer = Buffer.from(svgContent, "utf-8")
        }

        // 8. 保存图片
        await saveDiagramImage(taskId, buffer, format)

        // 9. 返回结果
        return {
            url: `/api/generate-diagram/${taskId}/download`,
            size: buffer.length,
        }
    } finally {
        if (browser) {
            await browser.close()
        }
    }
}
```

**Step 2: 更新 processTask 函数以支持图片生成**

```typescript
// app/api/generate-diagram/route.ts (更新 processTask 函数)
import { renderDiagramToImage } from "@/lib/diagram-renderer"

async function processTask(
    taskId: string,
    description: string,
    format: string,
): Promise<void> {
    try {
        // 1. 更新任务状态为处理中
        taskManager.updateTask(taskId, {
            status: "processing",
            progress: 10,
        })

        // 2. 生成 XML
        const xml = await generateDiagramXML(description)

        taskManager.updateTask(taskId, {
            progress: 50,
        })

        // 3. 如果格式是 XML，直接返回
        if (format === "xml") {
            taskManager.updateTask(taskId, {
                status: "completed",
                result: { xml },
                completedAt: new Date().toISOString(),
            })
            return
        }

        // 4. 如果格式是图片，渲染图片
        const task = taskManager.getTask(taskId)
        const imageResult = await renderDiagramToImage(
            taskId,
            xml,
            format as "png" | "svg",
            task?.options,
        )

        taskManager.updateTask(taskId, {
            status: "completed",
            result: imageResult,
            completedAt: new Date().toISOString(),
        })
    } catch (error) {
        taskManager.updateTask(taskId, {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            failedAt: new Date().toISOString(),
        })
    }
}
```

**Step 3: 提交图片渲染逻辑**

```bash
git add lib/diagram-renderer.ts app/api/generate-diagram/route.ts
git commit -m "feat: implement diagram image rendering with Puppeteer

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: 添加 API 文档

**文件:**
- Create: `docs/api/generate-diagram.md`

**Step 1: 编写 API 文档**

```markdown
# Generate Diagram API 文档

## 概述

Generate Diagram API 提供异步图表生成功能，支持 XML 和图片格式输出。

## 认证

所有请求需要在 header 中包含访问码（如果配置了 `ACCESS_CODE_LIST`）：

```
x-access-code: your-access-code
```

## 端点

### 1. 创建图表生成任务

**POST** `/api/generate-diagram`

**请求体:**
```json
{
  "description": "创建一个用户登录流程图",
  "format": "xml",  // "xml" | "png" | "svg"
  "options": {
    "width": 1920,   // 可选，图片宽度
    "height": 1080   // 可选，图片高度
  }
}
```

**响应:**
```json
{
  "taskId": "task_abc123",
  "status": "pending",
  "message": "任务已创建，正在处理中"
}
```

### 2. 查询任务状态

**GET** `/api/generate-diagram/{taskId}`

**响应（进行中）:**
```json
{
  "taskId": "task_abc123",
  "status": "processing",
  "progress": 50,
  "message": "正在生成图表..."
}
```

**响应（完成 - XML）:**
```json
{
  "taskId": "task_abc123",
  "status": "completed",
  "format": "xml",
  "result": {
    "xml": "<mxfile>...</mxfile>"
  },
  "createdAt": "2026-02-10T08:00:00Z",
  "completedAt": "2026-02-10T08:00:03Z"
}
```

**响应（完成 - 图片）:**
```json
{
  "taskId": "task_abc123",
  "status": "completed",
  "format": "png",
  "result": {
    "url": "/api/generate-diagram/task_abc123/download",
    "size": 102400
  },
  "createdAt": "2026-02-10T08:00:00Z",
  "completedAt": "2026-02-10T08:00:05Z"
}
```

### 3. 下载图片

**GET** `/api/generate-diagram/{taskId}/download`

返回图片文件（PNG 或 SVG）。

## 使用示例

```javascript
// 1. 创建任务
const response = await fetch('/api/generate-diagram', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-access-code': 'your-access-code'
  },
  body: JSON.stringify({
    description: '创建一个用户登录流程图',
    format: 'png'
  })
})
const { taskId } = await response.json()

// 2. 轮询任务状态
const pollTask = async () => {
  const response = await fetch(`/api/generate-diagram/${taskId}`, {
    headers: {
      'x-access-code': 'your-access-code'
    }
  })
  const task = await response.json()

  if (task.status === 'completed') {
    console.log('图表生成完成:', task.result)
    return task
  } else if (task.status === 'failed') {
    console.error('图表生成失败:', task.error)
    return task
  } else {
    // 继续轮询
    await new Promise(resolve => setTimeout(resolve, 1000))
    return pollTask()
  }
}

const result = await pollTask()
```

## 错误码

- `400` - 请求参数错误
- `401` - 访问码无效或缺失
- `404` - 任务不存在
- `429` - 超出配额限制
- `500` - 服务器内部错误

## 配额限制

API 使用现有的配额管理系统，限制如下：
- 每日请求数：`DAILY_REQUEST_LIMIT`（默认 10）
- 每日令牌数：`DAILY_TOKEN_LIMIT`（默认 200000）
- 每分钟令牌数：`TPM_LIMIT`（默认 20000）
```

**Step 2: 提交 API 文档**

```bash
git add docs/api/generate-diagram.md
git commit -m "docs: add Generate Diagram API documentation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 完成

计划已完成并保存到 `docs/plans/2026-02-10-generate-diagram-api.md`。

**两种执行选项:**

**1. Subagent-Driven（当前会话）** - 我为每个任务派发新的 subagent，任务间进行代码审查，快速迭代

**2. Parallel Session（独立会话）** - 在新会话中使用 executing-plans，批量执行并设置检查点

**您选择哪种方式？**
