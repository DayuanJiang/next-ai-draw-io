import { NextResponse } from "next/server"

export async function POST(request: Request) {
    const { accessCode } = await request.json()

    // 验证访问码
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []

    // 如果没有配置访问码，直接返回失败（不允许无条件登录）
    if (accessCodes.length === 0) {
        return NextResponse.json(
            { success: false, error: "未配置访问码列表" },
            { status: 401 },
        )
    }

    // 验证访问码
    if (!accessCode || !accessCodes.includes(accessCode)) {
        return NextResponse.json(
            { success: false, error: "无效的访问码" },
            { status: 401 },
        )
    }

    // 创建响应并设置 cookie
    const response = NextResponse.json({ success: true })

    // 设置当前语言检测（简化）
    const currentLang = request.headers.get("x-user-lang") || "en"

    // 设置 cookie，有效期 7 天
    response.cookies.set({
        name: "next-ai-draw-io-access-code",
        value: accessCode,
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
    })

    return response
}
