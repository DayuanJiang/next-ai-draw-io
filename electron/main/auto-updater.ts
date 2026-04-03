import https from "node:https"
import { app, dialog, ipcMain } from "electron"
import electronUpdater from "electron-updater"
import { getMainWindow } from "./window-manager"

const { autoUpdater } = electronUpdater

const CHECK_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours
const STARTUP_DELAY = 10_000 // 10 seconds
const GITHUB_API_URL =
    "https://api.github.com/repos/DayuanJiang/next-ai-draw-io/releases/latest"

let isChecking = false
let updateDownloaded = false

/**
 * Whether this platform supports electron-updater auto-update.
 * macOS: disabled because builds are ad-hoc signed (no Apple Developer cert).
 */
function supportsAutoUpdate(): boolean {
    if (process.platform === "darwin") return false
    if (process.platform === "win32" && process.env.PORTABLE_EXECUTABLE_DIR)
        return false
    if (process.platform === "linux" && !process.env.APPIMAGE) return false
    return true
}

/**
 * Compare two semver-like version strings numerically.
 * Returns true if remote > local.
 */
function isNewerVersion(remote: string, local: string): boolean {
    const r = remote.replace(/^v/, "").split(".").map(Number)
    const l = local.replace(/^v/, "").split(".").map(Number)
    const len = Math.max(r.length, l.length)
    for (let i = 0; i < len; i++) {
        const rv = r[i] || 0
        const lv = l[i] || 0
        if (rv > lv) return true
        if (rv < lv) return false
    }
    return false
}

/**
 * Send update status to the renderer via IPC
 */
function sendStatus(data: Record<string, unknown>) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
        win.webContents.send("update-status", data)
    }
}

/**
 * Check GitHub API for latest release (used on macOS and Linux DEB)
 */
function checkGitHubRelease(manual: boolean) {
    const req = https.get(
        GITHUB_API_URL,
        {
            headers: { "User-Agent": "next-ai-draw-io" },
            timeout: 15000,
        },
        (res) => {
            if (res.statusCode !== 200) {
                console.error(`GitHub API returned status ${res.statusCode}`)
                if (manual) {
                    dialog.showMessageBox({
                        type: "error",
                        title: "Update Check Failed",
                        message:
                            "Could not check for updates. Please try again later.",
                    })
                }
                isChecking = false
                return
            }

            let body = ""
            res.on("data", (chunk: string) => {
                body += chunk
            })
            res.on("end", () => {
                try {
                    const data = JSON.parse(body)
                    const remoteVersion = data.tag_name || ""
                    const localVersion = app.getVersion()

                    if (isNewerVersion(remoteVersion, localVersion)) {
                        sendStatus({
                            status: "available-manual",
                            version: remoteVersion.replace(/^v/, ""),
                            url: data.html_url,
                        })
                    } else if (manual) {
                        dialog.showMessageBox({
                            type: "info",
                            title: "No Updates",
                            message: "You're up to date!",
                            detail: `Version ${localVersion} is the latest version.`,
                        })
                    }
                } catch (err) {
                    console.error("Failed to parse GitHub release:", err)
                    if (manual) {
                        dialog.showMessageBox({
                            type: "error",
                            title: "Update Check Failed",
                            message:
                                "Could not check for updates. Please try again later.",
                        })
                    }
                }
                isChecking = false
            })
        },
    )
    req.on("timeout", () => {
        req.destroy()
        isChecking = false
    })
    req.on("error", (err) => {
        console.error("GitHub API request failed:", err)
        if (manual) {
            dialog.showMessageBox({
                type: "error",
                title: "Update Check Failed",
                message: "Could not check for updates. Please try again later.",
            })
        }
        isChecking = false
    })
    req.end()
}

/**
 * Set up electron-updater event handlers (Windows NSIS / Linux AppImage)
 */
function setupAutoUpdater() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on("update-available", (info) => {
        console.log("Update available:", info.version)
        sendStatus({ status: "available", version: info.version })
        isChecking = false
    })

    autoUpdater.on("update-not-available", () => {
        console.log("No update available")
        isChecking = false
    })

    autoUpdater.on("download-progress", (progress) => {
        sendStatus({
            status: "downloading",
            percent: progress.percent,
        })
    })

    autoUpdater.on("update-downloaded", () => {
        updateDownloaded = true
        console.log("Update downloaded")
        sendStatus({ status: "downloaded" })
        showRestartDialog()
    })

    autoUpdater.on("error", (err) => {
        console.error("Auto-update error:", err)
        sendStatus({ status: "error", message: String(err) })
        isChecking = false
    })

    // IPC: renderer requests download
    ipcMain.handle("updater:start-download", () => {
        return autoUpdater.downloadUpdate()
    })
}

/**
 * Show restart dialog after update downloaded
 */
async function showRestartDialog() {
    const result = await dialog.showMessageBox({
        type: "info",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update Ready",
        message: "A new version has been downloaded.",
        detail: "Restart the app to install the update.",
    })
    if (result.response === 0) {
        autoUpdater.quitAndInstall()
    }
}

/**
 * Run a single update check
 */
function doCheck(manual: boolean) {
    if (isChecking) return
    isChecking = true

    // If update already downloaded, just re-show restart dialog
    if (updateDownloaded && supportsAutoUpdate()) {
        isChecking = false
        showRestartDialog()
        return
    }

    if (supportsAutoUpdate()) {
        autoUpdater.checkForUpdates().catch((err) => {
            console.error("checkForUpdates failed:", err)
            isChecking = false
        })
        // For manual check, show "up to date" if no update found
        if (manual) {
            const onNotAvailable = () => {
                dialog.showMessageBox({
                    type: "info",
                    title: "No Updates",
                    message: "You're up to date!",
                    detail: `Version ${app.getVersion()} is the latest version.`,
                })
                cleanup()
            }
            // Clean up listeners when either event fires, preventing stale listeners
            const onAvailable = () => cleanup()
            const onError = () => cleanup()
            const cleanup = () => {
                autoUpdater.off("update-not-available", onNotAvailable)
                autoUpdater.off("update-available", onAvailable)
                autoUpdater.off("error", onError)
            }
            autoUpdater.once("update-not-available", onNotAvailable)
            autoUpdater.once("update-available", onAvailable)
            autoUpdater.once("error", onError)
        }
    } else {
        checkGitHubRelease(manual)
    }
}

/**
 * Initialize auto-updater. Call once after createWindow().
 */
export function initAutoUpdater() {
    if (!app.isPackaged) return

    if (supportsAutoUpdate()) {
        setupAutoUpdater()
    } else {
        // Register no-op handler so renderer doesn't get an unhandled error
        ipcMain.handle("updater:start-download", () => {})
    }

    // First check after startup delay
    setTimeout(() => doCheck(false), STARTUP_DELAY)

    // Periodic checks
    setInterval(() => doCheck(false), CHECK_INTERVAL)
}

/**
 * Manual update check from menu item
 */
export function checkForUpdatesManual() {
    if (!app.isPackaged) {
        dialog.showMessageBox({
            type: "info",
            title: "Development Mode",
            message: "Auto-update is not available in development mode.",
        })
        return
    }
    doCheck(true)
}
