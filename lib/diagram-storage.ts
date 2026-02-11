import * as fs from "fs"
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

export function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true })
  }
}

export function saveDiagramImage(
  taskId: string,
  buffer: Buffer,
  format: "png" | "svg"
): void {
  ensureStorageDir()
  const filePath = path.join(STORAGE_DIR, `${taskId}.${format}`)
  fs.writeFileSync(filePath, buffer)
}

export function getDiagramImage(
  taskId: string,
  format: "png" | "svg"
): Buffer | null {
  const filePath = path.join(STORAGE_DIR, `${taskId}.${format}`)
  if (!fs.existsSync(filePath)) {
    return null
  }
  return fs.readFileSync(filePath)
}

export function deleteDiagramImage(
  taskId: string,
  format: "png" | "svg"
): boolean {
  const filePath = path.join(STORAGE_DIR, `${taskId}.${format}`)
  if (!fs.existsSync(filePath)) {
    return false
  }
  fs.unlinkSync(filePath)
  return true
}
