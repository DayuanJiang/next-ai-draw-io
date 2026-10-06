/** True on macOS and iOS, where shortcuts use ⌘ instead of Ctrl */
export const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.userAgent)

/** Prefix for shortcut labels: "⌘" on Apple platforms, "Ctrl+" elsewhere */
export const modKey = isMac ? "⌘" : "Ctrl+"
