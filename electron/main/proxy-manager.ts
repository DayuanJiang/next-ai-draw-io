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
 * Returns null if the user never saved proxy settings (or the file is invalid)
 */
export function loadProxyConfig(): ProxyConfig | null {
    try {
        const configPath = getConfigPath()
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, "utf-8"))
            if (data && typeof data === "object" && !Array.isArray(data)) {
                return data as ProxyConfig
            }
            console.error("Ignoring invalid proxy config:", data)
        }
    } catch (error) {
        console.error("Failed to load proxy config:", error)
    }
    return null
}

/**
 * Save proxy configuration to JSON file
 */
export function saveProxyConfig(config: ProxyConfig): void {
    try {
        const configPath = getConfigPath()
        // Write a temp file and rename it, so a crash mid-write can't leave
        // a truncated file
        const tempPath = `${configPath}.tmp`
        fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8")
        fs.renameSync(tempPath, configPath)
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

    // No saved settings: keep proxy vars inherited from the system or .env
    if (!config) {
        return
    }

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
