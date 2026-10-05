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
 * Index of the quote that closes a value starting with a quote, or -1. A
 * backslash before the quote character escapes it, as in dotenv; the
 * backslash stays in the value. As in dotenv, an escaped quote with only a
 * comment or nothing after it still closes the value when no other quote
 * does ("C:\dir\" keeps its trailing backslash).
 */
function findClosingQuote(value: string): number {
    const quote = value[0]
    let lastEscaped = -1
    for (let i = 1; i < value.length; i++) {
        if (value[i] === "\\" && value[i + 1] === quote) {
            i++
            if (/^\s*(#.*)?$/.test(value.slice(i + 1))) lastEscaped = i
        } else if (value[i] === quote) return i
    }
    return lastEscaped
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

            const quote = value[0]
            const closingQuote =
                quote === '"' || quote === "'" ? findClosingQuote(value) : -1
            if (
                closingQuote > 0 &&
                /^\s*(#.*)?$/.test(value.slice(closingQuote + 1))
            ) {
                // Quoted value, then nothing or a comment: keep what is
                // inside the quotes, as dotenv reads it
                value = value.slice(1, closingQuote)
            } else {
                // Unquoted value: drop an inline comment ("value  # comment").
                // A value quoted from start to end with quotes inside (JSON
                // with an apostrophe) loses only the outer two, as in dotenv.
                value = value.replace(/\s+#.*$/, "")
                if (
                    closingQuote > 0 &&
                    value.length > 1 &&
                    value.endsWith(quote)
                ) {
                    value = value.slice(1, -1)
                }
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
