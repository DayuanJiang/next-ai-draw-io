import { app } from "electron"
import * as fs from "fs"
import * as path from "path"

export const USER_LOCALES = ["en", "zh", "ja", "zh-Hant"] as const
export type UserLocale = (typeof USER_LOCALES)[number]

// Earlier versions kept their configuration presets in this file too; the
// name stays so the saved language survives the upgrade
const CONFIG_FILE = "config-presets.json"

function getConfigPath(): string {
    return path.join(app.getPath("userData"), CONFIG_FILE)
}

/**
 * Load the config file as an object ({} if it is missing or invalid)
 */
function loadConfig(): Record<string, unknown> {
    try {
        const configPath = getConfigPath()
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, "utf-8"))
            if (data && typeof data === "object" && !Array.isArray(data)) {
                return data
            }
            console.error("Ignoring invalid config file:", data)
        }
    } catch (error) {
        console.error("Failed to load config file:", error)
    }
    return {}
}

/**
 * Get the menu locale the user chose, if any
 */
export function getUserLocale(): UserLocale | undefined {
    const { userLocale } = loadConfig()
    return (USER_LOCALES as readonly unknown[]).includes(userLocale)
        ? (userLocale as UserLocale)
        : undefined
}

/**
 * Save the menu locale the user chose
 */
export function setUserLocale(locale: UserLocale): void {
    const config = { ...loadConfig(), userLocale: locale }
    const configPath = getConfigPath()
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    // Write a temp file and rename it, so a crash mid-write can't leave
    // a truncated file
    const tempPath = `${configPath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8")
    fs.renameSync(tempPath, configPath)
}
