import fs from "fs"
import path from "path"

// File-based admin settings, overlaid onto process.env (dotenv-style).
// Precedence: settings file > env var > built-in default.
// Keys are exactly the env var names.

interface SettingsFile {
    version: 1
    values: Record<string, string>
}

interface SettingsState {
    // Original env values snapshotted before the first overlay, so removing
    // a key from the settings file restores the env default. null = was unset.
    originalEnv: Record<string, string | null>
    // Keys currently overlaid, so we can restore ones removed from the file.
    overlaidKeys: Set<string>
    cachedSettings: Record<string, string> | null
}

// Kept on globalThis because the build can load this module more than once
// (instrumentation.ts and the API routes get separate copies); per-module
// state would make a route forget what instrumentation overlaid at startup.
const globalState = globalThis as typeof globalThis & {
    __adminSettingsState?: SettingsState
}
globalState.__adminSettingsState ??= {
    originalEnv: {},
    overlaidKeys: new Set(),
    cachedSettings: null,
}
const state = globalState.__adminSettingsState

export function getSettingsPath(): string {
    const custom = process.env.SETTINGS_FILE
    if (custom && custom.trim().length > 0) return custom
    return path.join(process.cwd(), "data", "settings.json")
}

export function loadSettings(): Record<string, string> {
    if (state.cachedSettings) return state.cachedSettings
    try {
        const raw = fs.readFileSync(getSettingsPath(), "utf8")
        const parsed = JSON.parse(raw) as SettingsFile
        // Keep only string values — a hand-edited or corrupted file could
        // hold null/arrays/numbers that would otherwise be overlaid onto
        // process.env and coerce to junk like "[object Object]".
        const values: Record<string, string> = {}
        const rawValues =
            parsed &&
            typeof parsed.values === "object" &&
            parsed.values &&
            !Array.isArray(parsed.values)
                ? parsed.values
                : {}
        for (const [key, value] of Object.entries(rawValues)) {
            if (typeof value === "string") values[key] = value
        }
        state.cachedSettings = values
    } catch (err: any) {
        if (err?.code !== "ENOENT") {
            console.error("[admin-settings] Failed to read settings file:", err)
        }
        state.cachedSettings = {}
    }
    return state.cachedSettings
}

export function applyToEnv(): void {
    const values = loadSettings()
    const { originalEnv } = state

    // Restore env for keys that were overlaid before but are now gone
    for (const key of state.overlaidKeys) {
        if (!(key in values)) {
            const original = originalEnv[key]
            if (original === null) delete process.env[key]
            else process.env[key] = original
        }
    }

    for (const [key, value] of Object.entries(values)) {
        if (!(key in originalEnv)) {
            originalEnv[key] = process.env[key] ?? null
        }
        process.env[key] = value
    }

    state.overlaidKeys = new Set(Object.keys(values))
}

// The effective env value if the file entry were removed (for fallback display)
export function getEnvFallback(key: string): string | null {
    if (state.overlaidKeys.has(key)) return state.originalEnv[key] ?? null
    return process.env[key] ?? null
}

// Whether a key's current value comes from the file, the environment, or is unset
export function getValueSource(key: string): "file" | "env" | "default" {
    if (key in loadSettings()) return "file"
    return getEnvFallback(key) !== null ? "env" : "default"
}

export function saveSettings(updates: Record<string, string | null>): void {
    const current = { ...loadSettings() }
    for (const [key, value] of Object.entries(updates)) {
        if (value === null) delete current[key]
        else current[key] = value
    }

    const filePath = getSettingsPath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.tmp`
    const data: SettingsFile = { version: 1, values: current }
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 })
    fs.renameSync(tmpPath, filePath)

    state.cachedSettings = current
    applyToEnv()
}

let writableCache: boolean | null = null

export function isSettingsWritable(): boolean {
    if (writableCache !== null) return writableCache
    try {
        const filePath = getSettingsPath()
        if (fs.existsSync(filePath) && !fs.statSync(filePath).isFile()) {
            writableCache = false
            return writableCache
        }
        const dir = path.dirname(filePath)
        fs.mkdirSync(dir, { recursive: true })
        fs.accessSync(dir, fs.constants.W_OK)
        writableCache = true
    } catch {
        writableCache = false
    }
    return writableCache
}

// Test-only: reset module state
export function _resetForTests(): void {
    state.cachedSettings = null
    writableCache = null
    for (const key of state.overlaidKeys) {
        const original = state.originalEnv[key]
        if (original === null) delete process.env[key]
        else if (original !== undefined) process.env[key] = original
    }
    state.overlaidKeys = new Set()
    state.originalEnv = {}
}
