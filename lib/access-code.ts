import { NextRequest, NextResponse } from "next/server"

// 缓存解析后的访问码 Set，避免每次请求都 split
let cachedAccessCodes: Set<string> | null = null
let cachedRawValue: string | undefined

export function getAccessCodes(): Set<string> {
  const raw = process.env.ACCESS_CODE_LIST

  // 环境变量未变时返回缓存
  if (cachedAccessCodes && cachedRawValue === raw) {
    return cachedAccessCodes
  }

  cachedRawValue = raw
  cachedAccessCodes = new Set(
    raw?.split(",").map((code) => code.trim()).filter(Boolean) || []
  )
  return cachedAccessCodes
}

/**
 * 检查访问码是否有效
 */
export function isValidAccessCode(code: string | null): boolean {
  const codes = getAccessCodes()
  if (codes.size === 0) return true // 未配置访问码，跳过验证
  return !!code && codes.has(code)
}

/**
 * 验证请求中的访问码（用于 generate-diagram API 路由）。
 * @returns null 表示验证通过，NextResponse 表示验证失败的响应
 */
export function validateAccessCode(req: NextRequest): NextResponse | null {
  const codes = getAccessCodes()
  if (codes.size === 0) return null

  const accessCodeHeader = req.headers.get("x-access-code")
  if (!accessCodeHeader || !codes.has(accessCodeHeader)) {
    return NextResponse.json(
      { error: "Invalid or missing access code" },
      { status: 401 }
    )
  }

  return null
}
