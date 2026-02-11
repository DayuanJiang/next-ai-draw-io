import * as fs from "fs"
import * as path from "path"

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
