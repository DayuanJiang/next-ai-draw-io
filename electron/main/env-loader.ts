import fs from "node:fs"
import path from "node:path"
import { app } from "electron"

/**
 * Load environment variables from .env file
 * Searches multiple locations in priority order
 */
export function loadEnvFile(): void {
    const possiblePaths = [
        // Next to the executable (for portable installations)
        path.join(path.dirname(app.getPath("exe")), ".env"),
        // User data directory (persists across updates)
        path.join(app.getPath("userData"), ".env"),
        // Development: project root
        path.join(app.getAppPath(), ".env.local"),
        path.join(app.getAppPath(), ".env"),
    ]

    for (const envPath of possiblePaths) {
        if (fs.existsSync(envPath)) {
            console.log(`Loading environment from: ${envPath}`)
            loadEnvFromFile(envPath)
            return
        }
    }

    console.log("No .env file found, using system environment variables")
}

/**
 * Parse and load environment variables from a file
 */
function loadEnvFromFile(filePath: string): void {
    try {
        const content = fs.readFileSync(filePath, "utf-8")
        const lines = content.split("\n")

        for (const line of lines) {
            const trimmed = line.trim()

            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith("#")) continue

            const equalIndex = trimmed.indexOf("=")
            if (equalIndex === -1) continue

            const key = trimmed.slice(0, equalIndex).trim()
            let value = trimmed.slice(equalIndex + 1).trim()

            // Remove surrounding quotes
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1)
            }

            // Don't override existing environment variables
            if (!(key in process.env)) {
                process.env[key] = value
            }
        }
    } catch (error) {
        console.error(`Failed to load env file ${filePath}:`, error)
    }
}
