/**
 * 登录响应数据（对应后端 LoginRespModel）
 */
export interface LoginResponse {
    token: string // token
    userId: string // 用户ID
    cn: string // 中文名
    email: string // 邮箱
    dept: string // 部门
    title: string // 职位
}

/**
 * IT认证中心配置
 */
export const AUTH_CONFIG = {
    appKey: process.env.NEXT_PUBLIC_AUTH_APP_KEY as string,
    baseUrl: process.env.NEXT_PUBLIC_AUTH_BASE_URL as string,
}

/**
 * 获取登录页面URL
 */
export const getLoginUrl = (): string => {
    return `${AUTH_CONFIG.baseUrl}/#/Login?appKey=${AUTH_CONFIG.appKey}&callbackUrl=https://ai.vesync.com/draw-io/zh`
}

/**
 * 跳转到登录页
 */
export function redirectToLogin(): void {
    window.location.href = getLoginUrl()
}

/**
 * 检查是否在浏览器环境中
 * @returns 是否在浏览器环境
 */
export function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

/**
 * 检查是否是开发环境
 * @returns 是否是开发环境
 */
export function isDevEnvironment(): boolean {
    console.log("🔧 环境：", process.env.NODE_ENV)
    return process.env.NODE_ENV === "development"
}

/**
 * 初始化开发环境
 */
export function initAuthEnvironment(): void {
    if (!isBrowser()) return

    const isDev = isDevEnvironment()
    if (isDev) {
        if (!localStorage.getItem("vesync_user_token")) {
            console.log("🔧 开发环境：自动填充默认token")
            localStorage.setItem("vesync_user_token", "dev_token_" + Date.now())
        }
        if (!localStorage.getItem("vesync_user_info")) {
            console.log("🔧 开发环境：自动填充默认用户信息")
            localStorage.setItem(
                "vesync_user_info",
                JSON.stringify({
                    userId: "dev_user_001",
                    cn: "开发测试用户",
                    email: "dev@vesync.com",
                    dept: "研发中心",
                    title: "开发工程师",
                }),
            )
        }
    } else {
        redirectToLogin()
    }
}

/**
 * 获取用户信息
 * @returns 用户信息
 */
export function getUserInfo(): LoginResponse {
    if (!isBrowser()) return {} as LoginResponse
    const veSyncUserInfo: LoginResponse = JSON.parse(
        localStorage.getItem("vesync_user_info") || "{}",
    )
    console.log("🔧 获取用户信息：", veSyncUserInfo)
    return veSyncUserInfo
}

export function setUserInfo(userInfo: LoginResponse): void {
    if (!isBrowser()) return
    localStorage.setItem("vesync_user_info", JSON.stringify(userInfo))
}

/**
 * 获取token
 */
export function getToken(): string {
    if (!isBrowser()) return ""
    return localStorage.getItem("vesync_user_token") || ""
}

export function setToken(token: string): void {
    if (!isBrowser()) return
    localStorage.setItem("vesync_user_token", token)
}

/**
 * 检查是否已登录（需要同时存在token和用户信息）
 */
export function isLoggedIn(): boolean {
    if (!isBrowser()) return false
    const token = getToken()
    const userInfo = getUserInfo()
    return !!token && !!userInfo && Object.keys(userInfo).length > 0
}

/**
 * 退出登录
 * 清除本地存储的用户信息和token，然后跳转到登录页
 */
export function logout(): void {
    if (!isBrowser()) return

    // 清除用户信息和token
    localStorage.removeItem("vesync_user_token")
    localStorage.removeItem("vesync_user_info")

    // 跳转到登录页
    redirectToLogin()
}

// 生成唯一traceId
export const getTraceId = () => {
    return `traceId-${Date.now()}`
}

// 获取账号ID
export const getAccountId = () => {
    const userInfo = getUserInfo()
    return userInfo.userId
}

// 获取账号ID
export const getEmail = () => {
    const userInfo = getUserInfo()
    return userInfo.email
}

// 获取用户名
export const getCn = () => {
    const userInfo = getUserInfo()
    return userInfo.cn
}

// 获取应用密钥
export const getAppKey = () => {
    return process.env.NEXT_PUBLIC_AUTH_APP_KEY as string
}

// 获取应用类型
export const getApiType = () => {
    return process.env.NEXT_PUBLIC_API_TYPE as string
}

// 获取部门
export const getDept = () => {
    const userInfo = getUserInfo()
    return userInfo.dept
}
