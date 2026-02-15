/**
 * Internationalization support for Electron menu
 * Translations for menu labels that don't use Electron's built-in roles
 */

import { getUserLocale } from "./config-manager"

export type MenuLocale = "en" | "zh" | "ja" | "zh-Hant"

export interface MenuTranslations {
    // App menu (macOS only)
    settings: string

    // File menu
    file: string

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

        // File menu
        file: "File",

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

        // File menu
        file: "文件",

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

        // File menu
        file: "ファイル",

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

    "zh-Hant": {
        // App menu
        settings: "設定...",

        // File menu
        file: "檔案",

        // Edit menu
        edit: "編輯",

        // View menu
        view: "檢視",

        // Configuration menu
        configuration: "配置",
        switchPreset: "切換預設",
        managePresets: "管理預設...",
        addConfigurationPreset: "新增配置預設...",

        // Window menu
        window: "視窗",

        // Help menu
        help: "說明",
        documentation: "文件",
        reportIssue: "回報問題",
    },
}

/**
 * Get menu translations for a given locale
 * Falls back to English if locale is not supported
 */
export function getMenuTranslations(locale: string): MenuTranslations {
    // Check for zh-Hant before normalizing
    if (
        locale === "zh-Hant" ||
        locale.toLowerCase().startsWith("zh-hant") ||
        locale.toLowerCase().startsWith("zh-tw") ||
        locale.toLowerCase().startsWith("zh-hk")
    ) {
        return translations["zh-Hant"]
    }

    // Normalize locale (e.g., "zh-CN" -> "zh", "ja-JP" -> "ja")
    const normalized = locale.toLowerCase().split("-")[0]

    if (normalized === "zh") return translations.zh
    if (normalized === "ja") return translations.ja
    return translations.en
}

/**
 * Detect system locale from Electron app
 * Returns one of: "en", "zh", "ja", "zh-Hant"
 */
export function detectSystemLocale(appLocale: string): MenuLocale {
    const lower = appLocale.toLowerCase()

    // Distinguish Traditional Chinese locales (TW, HK, Hant) from Simplified
    if (
        lower.startsWith("zh-hant") ||
        lower.startsWith("zh-tw") ||
        lower.startsWith("zh-hk")
    ) {
        return "zh-Hant"
    }

    const normalized = lower.split("-")[0]

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
