import fs from "node:fs"
import path from "node:path"
import { parse } from "dotenv"
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
        const parsed = parse(fs.readFileSync(filePath, "utf-8"))
        for (const [key, value] of Object.entries(parsed)) {
            // Don't override existing environment variables
            if (!(key in process.env)) {
                process.env[key] = value
            }
        }
    } catch (error) {
        console.error(`Failed to load env file ${filePath}:`, error)
    }
}
