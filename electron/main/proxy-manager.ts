import { app } from "electron"
import * as fs from "fs"
import * as path from "path"
import type { ProxyConfig } from "../electron.d"

export type { ProxyConfig }

const CONFIG_FILE = "proxy-config.json"

function getConfigPath(): string {
    return path.join(app.getPath("userData"), CONFIG_FILE)
}

/**
 * Load proxy configuration from JSON file
 */
export function loadProxyConfig(): ProxyConfig {
    try {
        const configPath = getConfigPath()
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, "utf-8")
            return JSON.parse(data) as ProxyConfig
        }
    } catch (error) {
        console.error("Failed to load proxy config:", error)
    }
    return {}
}

/**
 * Save proxy configuration to JSON file
 */
export function saveProxyConfig(config: ProxyConfig): void {
    try {
        const configPath = getConfigPath()
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
    } catch (error) {
        console.error("Failed to save proxy config:", error)
        throw error
    }
}

/**
 * Apply proxy configuration to process.env
 * Must be called BEFORE starting the Next.js server
 */
export function applyProxyToEnv(): void {
    const config = loadProxyConfig()

    if (config.httpProxy) {
        process.env.HTTP_PROXY = config.httpProxy
        process.env.http_proxy = config.httpProxy
    } else {
        delete process.env.HTTP_PROXY
        delete process.env.http_proxy
    }

    if (config.httpsProxy) {
        process.env.HTTPS_PROXY = config.httpsProxy
        process.env.https_proxy = config.httpsProxy
    } else {
        delete process.env.HTTPS_PROXY
        delete process.env.https_proxy
    }
}

/**
 * Get current proxy configuration (from process.env)
 */
export function getProxyConfig(): ProxyConfig {
    return {
        httpProxy: process.env.HTTP_PROXY || process.env.http_proxy || "",
        httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy || "",
    }
}
