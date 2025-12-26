"use client"

import { AlertCircle, ArrowRight, Eye, EyeOff, Lock } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getApiEndpoint } from "@/lib/base-path"
import { i18n, type Locale } from "@/lib/i18n/config"
import { STORAGE_KEYS } from "@/lib/storage"

export default function LoginPage() {
    const router = useRouter()
    const pathname = usePathname()
    const [accessCode, setAccessCode] = useState("")
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [currentLang, setCurrentLang] = useState<Locale>("en")
    const [showPassword, setShowPassword] = useState(false)
    const [isMounted, setIsMounted] = useState(false)

    // 确保只在客户端渲染
    useEffect(() => {
        setIsMounted(true)
        if (typeof window !== "undefined") {
            // 从路径获取当前语言
            const pathParts = pathname.split("/").filter(Boolean)
            const lang = i18n.locales.includes(pathParts[0] as any)
                ? pathParts[0]
                : "en"
            setCurrentLang(lang as Locale)

            // 保存当前语言到localStorage，以便退出时使用
            localStorage.setItem("next-ai-draw-io-login-lang", lang)
        }
    }, [pathname])

    ;("use client")

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (
                e.key === "Enter" &&
                document.activeElement?.id === "access-code"
            ) {
                const form = document.querySelector("form")
                if (!form) return

                const button = form.querySelector<HTMLButtonElement>(
                    'button[type="submit"]',
                )

                if (button && !button.disabled) {
                    button.click()
                }
            }
        }

        document.addEventListener("keydown", handleKeyDown)

        return () => {
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (!accessCode.trim()) {
            setError("请输入访问码")
            return
        }

        setIsLoading(true)

        try {
            console.log("验证访问码:", accessCode)

            // 验证访问码 - 调用API进行验证
            const response = await fetch(getApiEndpoint("/api/login"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ accessCode }),
            })

            console.log("验证响应状态:", response.status)

            const data = await response.json()
            console.log("验证结果:", data)

            if (!response.ok) {
                throw new Error(data.error || "验证失败")
            }

            if (data.success) {
                // 登录成功 - 设置cookie和localStorage
                localStorage.setItem(STORAGE_KEYS.accessCode, accessCode)

                // 重定向到首页 - 保持相同的语言
                const pathParts = pathname.split("/").filter(Boolean)
                const lang = pathParts[0] || ""
                const redirectUrl = lang ? `/${lang}` : "/"
                console.log("重定向到:", redirectUrl, "原始pathname:", pathname)
                window.location.href = redirectUrl
            } else {
                throw new Error(data.error || "无效的访问码")
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "验证失败，请重试"
            setError(message)
            console.error("登录验证错误:", err)
        } finally {
            setIsLoading(false)
        }
    }
    useEffect(() => {
        const styleId = "login-animations-style"

        if (document.getElementById(styleId)) return

        const style = document.createElement("style")
        style.id = styleId
        style.textContent = `
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fade-in 0.3s ease-out;
    }
    .animation-delay-2000 {
      animation-delay: 2s;
    }
  `

        document.head.appendChild(style)
    }, [])

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200 dark:bg-blue-900 rounded-full blur-3xl opacity-30 animate-pulse" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200 dark:bg-purple-900 rounded-full blur-3xl opacity-30 animate-pulse animation-delay-2000" />
            </div>

            {/* Main content */}
            <div className="relative z-10 max-w-md w-full mx-4">
                {/* Logo and title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl mb-6 shadow-lg transform hover:scale-105 transition-transform duration-300">
                        <Lock className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-2">
                        next-ai-draw-io
                    </h1>
                    <p className="text-lg text-blue-600 dark:text-blue-400 font-medium mb-2">
                        🗄️ NAS版本
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 text-sm">
                        安全访问 · 私有部署 · AI 驱动
                    </p>
                </div>

                {/* Login card */}
                <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 shadow-2xl shadow-blue-500/10 dark:shadow-blue-900/20 rounded-2xl overflow-hidden">
                    <CardHeader className="text-center py-6 border-b border-slate-100 dark:border-slate-700">
                        <CardTitle className="text-xl text-slate-800 dark:text-white font-semibold">
                            安全访问验证
                        </CardTitle>{" "}
                    </CardHeader>

                    <form onSubmit={handleSubmit} className="relative">
                        <CardContent className="space-y-5 py-6 px-6">
                            <div className={isMounted ? "space-y-2" : ""}>
                                <Label
                                    htmlFor="access-code"
                                    className="text-slate-700 dark:text-slate-300 font-medium"
                                >
                                    访问码
                                </Label>
                                <div className="group relative">
                                    <Input
                                        id="access-code"
                                        type={
                                            showPassword ? "text" : "password"
                                        }
                                        placeholder="请输入访问码"
                                        value={accessCode}
                                        onChange={(e) =>
                                            setAccessCode(e.target.value)
                                        }
                                        autoComplete="off"
                                        className="bg-slate-50/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 pr-12 rounded-xl focus:border-blue-400 dark:focus:border-blue-500 focus:ring-blue-400 dark:focus:ring-blue-500 transition-all duration-200 group-focus-within:border-blue-400 dark:group-focus-within:border-blue-500"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowPassword(!showPassword)
                                        }
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
                                        aria-label={
                                            showPassword
                                                ? "隐藏密码"
                                                : "显示密码"
                                        }
                                        disabled={isLoading}
                                    >
                                        {isMounted &&
                                            (showPassword ? (
                                                <EyeOff className="h-4 w-4" />
                                            ) : (
                                                <Eye className="h-4 w-4" />
                                            ))}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 animate-fade-in">
                                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                    <span className="flex-1">{error}</span>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed"
                                disabled={isLoading || !accessCode.trim()}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    {isLoading ? (
                                        <>
                                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                            验证中...
                                        </>
                                    ) : (
                                        <>
                                            验证
                                            <ArrowRight className="h-4 w-4" />
                                        </>
                                    )}
                                </span>
                            </Button>

                            {isMounted && (
                                <div className="text-center">
                                    <p className="text-xs text-slate-500 dark:text-slate-500">
                                        按回车键快速验证
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </form>
                </Card>

                {/* Footer */}
                <div className="text-center mt-8">
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                        Author by ⚡ DayuanJiang & lxchinesszz
                    </p>
                </div>
            </div>
        </div>
    )
}
