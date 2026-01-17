/**
 * Internationalization support for Electron menu
 * Translations for menu labels that don't use Electron's built-in roles
 */

import { getUserLocale } from "./config-manager"

export type MenuLocale = "en" | "zh" | "ja"

export interface MenuTranslations {
    // App menu (macOS only)
    settings: string
    services: string
    hide: string
    hideOthers: string
    unhide: string
    quit: string

    // File menu
    file: string
    close: string

    // Edit menu
    edit: string

    // View menu
    view: string

    // Configuration menu
    configuration: string
    switchPreset: string
    managePresets: string
    addConfigurationPreset: string

    // Window menu
    window: string

    // Help menu
    help: string
    documentation: string
    reportIssue: string
}

const translations: Record<MenuLocale, MenuTranslations> = {
    en: {
        // App menu
        settings: "Settings...",
        services: "Services",
        hide: "Hide",
        hideOthers: "Hide Others",
        unhide: "Show All",
        quit: "Quit",

        // File menu
        file: "File",
        close: "Close",

        // Edit menu
        edit: "Edit",

        // View menu
        view: "View",

        // Configuration menu
        configuration: "Configuration",
        switchPreset: "Switch Preset",
        managePresets: "Manage Presets...",
        addConfigurationPreset: "Add Configuration Preset...",

        // Window menu
        window: "Window",

        // Help menu
        help: "Help",
        documentation: "Documentation",
        reportIssue: "Report Issue",
    },

    zh: {
        // App menu
        settings: "设置...",
        services: "服务",
        hide: "隐藏",
        hideOthers: "隐藏其他",
        unhide: "全部显示",
        quit: "退出",

        // File menu
        file: "文件",
        close: "关闭",

        // Edit menu
        edit: "编辑",

        // View menu
        view: "查看",

        // Configuration menu
        configuration: "配置",
        switchPreset: "切换预设",
        managePresets: "管理预设...",
        addConfigurationPreset: "添加配置预设...",

        // Window menu
        window: "窗口",

        // Help menu
        help: "帮助",
        documentation: "文档",
        reportIssue: "报告问题",
    },

    ja: {
        // App menu
        settings: "設定...",
        services: "サービス",
        hide: "隠す",
        hideOthers: "他を隠す",
        unhide: "すべて表示",
        quit: "終了",

        // File menu
        file: "ファイル",
        close: "閉じる",

        // Edit menu
        edit: "編集",

        // View menu
        view: "表示",

        // Configuration menu
        configuration: "設定",
        switchPreset: "プリセット切り替え",
        managePresets: "プリセット管理...",
        addConfigurationPreset: "設定プリセットを追加...",

        // Window menu
        window: "ウインドウ",

        // Help menu
        help: "ヘルプ",
        documentation: "ドキュメント",
        reportIssue: "問題を報告",
    },
}

/**
 * Get menu translations for a given locale
 * Falls back to English if locale is not supported
 */
export function getMenuTranslations(locale: string): MenuTranslations {
    // Normalize locale (e.g., "zh-CN" -> "zh", "ja-JP" -> "ja")
    const normalizedLocale = locale.toLowerCase().split("-")[0] as MenuLocale

    // Return translations if supported, otherwise fallback to English
    return translations[normalizedLocale] || translations.en
}

/**
 * Detect system locale from Electron app
 * Returns one of: "en", "zh", "ja"
 */
export function detectSystemLocale(appLocale: string): MenuLocale {
    const normalized = appLocale.toLowerCase().split("-")[0]

    if (normalized === "zh") return "zh"
    if (normalized === "ja") return "ja"
    return "en"
}

/**
 * Get locale from stored preference or system default
 * Checks config file for user's language preference first
 */
export function getPreferredLocale(appLocale: string): MenuLocale {
    // Try to get from saved preference first
    const savedLocale = getUserLocale()
    if (savedLocale) {
        return savedLocale
    }

    // Fall back to system locale
    return detectSystemLocale(appLocale)
}
