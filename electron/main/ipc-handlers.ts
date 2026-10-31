import { app, type IpcMainInvokeEvent, ipcMain } from "electron"
import { buildAppMenu } from "./app-menu"
import { setUserLocale, USER_LOCALES, type UserLocale } from "./config-manager"
import { restartNextServer } from "./next-server"
import { savePreviewAsPdf } from "./pdf-export"
import { noteNoChats, rememberChatPort } from "./port-manager"
import {
    applyProxyToEnv,
    getProxyConfig,
    type ProxyConfig,
    saveProxyConfig,
} from "./proxy-manager"
import { isAppUrl } from "./window-manager"

/**
 * Register an IPC handler that only answers the app's own pages (on the app
 * server). A main window that somehow ends up on an external site still
 * gets the preload API, so its calls must be rejected here.
 */
function handle<Args extends unknown[]>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: Args) => unknown,
): void {
    ipcMain.handle(channel, (event, ...args) => {
        const url = event.senderFrame?.url
        if (!isAppUrl(url)) {
            throw new Error(`Blocked "${channel}" from untrusted page: ${url}`)
        }
        return listener(event, ...(args as Args))
    })
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(): void {
    // ==================== Where the chats are ====================

    // The page saved a chat, or loaded without any: decides which port
    // (and so which origin's chats) the next launch opens
    handle("chat-saved", () => rememberChatPort())
    handle("chats-loaded", (_event, count: unknown) => {
        if (count === 0) noteNoChats()
    })

    // ==================== Proxy Settings ====================

    handle("get-proxy", () => {
        return getProxyConfig()
    })

    handle("set-proxy", async (_event, config: ProxyConfig) => {
        const isOptionalString = (value: unknown) =>
            value === undefined || typeof value === "string"
        if (
            typeof config !== "object" ||
            config === null ||
            !isOptionalString(config.httpProxy) ||
            !isOptionalString(config.httpsProxy)
        ) {
            return { success: false, error: "Invalid proxy settings" }
        }

        try {
            // Save config to file
            saveProxyConfig({
                httpProxy: config.httpProxy,
                httpsProxy: config.httpsProxy,
            })

            // Apply to current process environment
            applyProxyToEnv()

            if (!app.isPackaged) {
                // In development, env vars are already applied
                // Next.js dev server may need manual restart
                return { success: true }
            }

            // Production: restart Next.js server to pick up new env vars
            await restartNextServer()
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to apply proxy settings",
            }
        }
    })

    // ==================== User Locale ====================

    handle("set-user-locale", (_event, locale: string) => {
        if (!(USER_LOCALES as readonly string[]).includes(locale)) {
            return { success: false, error: "Invalid locale" }
        }

        try {
            setUserLocale(locale as UserLocale)
            // Rebuild the menu to reflect the new locale
            buildAppMenu()
            return { success: true }
        } catch (error) {
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to set locale",
            }
        }
    })

    // ==================== PDF Export ====================

    handle("save-preview-as-pdf", (event, fileName: unknown) =>
        savePreviewAsPdf(
            event.sender,
            typeof fileName === "string" ? fileName : "diagram.pdf",
        ),
    )
}
