import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { i18n } from "./lib/i18n/config"

// 获取环境变量
const ACCESS_CODE_LIST = process.env.ACCESS_CODE_LIST

export function proxy(request: NextRequest) {
    const { pathname, href } = request.nextUrl

    // 处理根路径重定向到默认语言
    if (pathname === "/") {
        const defaultLang = "zh" // 默认中文
        const loginUrl = new URL(`/${defaultLang}/login`, request.url)
        return NextResponse.redirect(loginUrl)
    }

    // 检查是否是登录页面或API路径
    if (
        pathname.endsWith("/login") ||
        pathname.includes("/login") ||
        pathname.startsWith("/api/")
    ) {
        return NextResponse.next()
    }

    // 获取访问码 - 先从 header 中获取，如果没有再从 cookie 中获取
    const accessCode =
        request.headers.get("x-access-code") ||
        request.cookies.get("next-ai-draw-io-access-code")?.value

    console.log("Proxy check:", {
        pathname,
        accessCode,
        ACCESS_CODE_LIST: !!ACCESS_CODE_LIST,
    })

    // 如果设置了访问码，需要验证
    if (ACCESS_CODE_LIST) {
        const accessCodes = ACCESS_CODE_LIST.split(",")
            .map((code) => code.trim())
            .filter(Boolean)

        // 如果有配置访问码列表但用户没有提供访问码，或者访问码无效
        if (accessCodes.length > 0 && !accessCode) {
            // 获取语言路径
            const pathParts = pathname.split("/").filter(Boolean)
            const lang = i18n.locales.includes(pathParts[0] as any)
                ? pathParts[0]
                : "en"

            // 重定向到登录页面
            console.log("Redirecting to login for:", lang)
            const loginUrl = new URL(`/${lang}/login`, request.url)
            return NextResponse.redirect(loginUrl)
        }

        if (
            accessCodes.length > 0 &&
            accessCode &&
            !accessCodes.includes(accessCode)
        ) {
            // 访问码无效，也重定向到登录
            const pathParts = pathname.split("/").filter(Boolean)
            const lang = i18n.locales.includes(pathParts[0] as any)
                ? pathParts[0]
                : "en"

            console.log("Invalid access code, redirecting to login for:", lang)
            const loginUrl = new URL(`/${lang}/login`, request.url)
            return NextResponse.redirect(loginUrl)
        }
    }

    console.log("Access granted for:", pathname)
    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - login (login page)
         */
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.login).*)",
    ],
}
