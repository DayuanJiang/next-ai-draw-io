import { promises as fs } from "fs"
import * as path from "path"

/**
 * ⚠️ 警告：本地文件存储仅适用于开发环境
 *
 * 在生产环境（特别是 serverless 平台如 Vercel、Cloudflare Workers）中，
 * 本地文件系统是临时的，文件可能在部署后丢失。
 *
 * 生产环境建议使用对象存储服务：
 * - AWS S3
 * - Cloudflare R2
 * - Vercel Blob Storage
 * - 其他兼容 S3 的对象存储
 */
const STORAGE_DIR = path.join(process.cwd(), ".next", "cache", "diagrams")

export async function ensureStorageDir(): Promise<void> {
  try {
    await fs.access(STORAGE_DIR)
  } catch {
    await fs.mkdir(STORAGE_DIR, { recursive: true })
  }
}

export async function saveDiagramImage(
  taskId: string,
  buffer: Buffer,
  format: "png" | "svg"
): Promise<void> {
  await ensureStorageDir()
  const filePath = path.join(STORAGE_DIR, `${taskId}.${format}`)
  await fs.writeFile(filePath, buffer)
}

export async function getDiagramImage(
  taskId: string,
  format: "png" | "svg"
): Promise<Buffer | null> {
  const filePath = path.join(STORAGE_DIR, `${taskId}.${format}`)
  try {
    return await fs.readFile(filePath)
  } catch {
    return null
  }
}

export async function deleteDiagramImage(
  taskId: string,
  format: "png" | "svg"
): Promise<boolean> {
  const filePath = path.join(STORAGE_DIR, `${taskId}.${format}`)
  try {
    await fs.unlink(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * 清理指定 taskId 的所有格式文件
 */
export async function cleanupDiagramFiles(taskId: string): Promise<void> {
  await deleteDiagramImage(taskId, "png")
  await deleteDiagramImage(taskId, "svg")
}

/**
 * 清理过期的图表文件（基于文件修改时间）
 */
export async function cleanupOldDiagramFiles(maxAgeMs = 60 * 60 * 1000): Promise<number> {
  try {
    await ensureStorageDir()
    const files = await fs.readdir(STORAGE_DIR)
    const now = Date.now()
    let cleaned = 0

    for (const file of files) {
      const filePath = path.join(STORAGE_DIR, file)
      try {
        const stat = await fs.stat(filePath)
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath)
          cleaned++
        }
      } catch {
        // 文件可能已被删除，跳过
      }
    }

    if (cleaned > 0) {
      console.log(`[diagram-storage] 清理了 ${cleaned} 个过期文件`)
    }
    return cleaned
  } catch {
    return 0
  }
}
