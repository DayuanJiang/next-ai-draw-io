/**
 * Internationalization support for Electron menu
 * Translations for menu labels that don't use Electron's built-in roles
 */

import { getUserLocale, type UserLocale } from "./config-manager"

export type MenuLocale = UserLocale

const en = {
    // File menu
    file: "File",

    // Edit menu
    edit: "Edit",

    // View menu
    view: "View",

    // Window menu
    window: "Window",

    // Help menu
    help: "Help",
    documentation: "Documentation",
    reportIssue: "Report Issue",
}

type MenuTranslations = typeof en

const translations: Record<MenuLocale, MenuTranslations> = {
    en,

    zh: {
        // File menu
        file: "文件",

        // Edit menu
        edit: "编辑",

        // View menu
        view: "查看",

        // Window menu
        window: "窗口",

        // Help menu
        help: "帮助",
        documentation: "文档",
        reportIssue: "报告问题",
    },

    ja: {
        // File menu
        file: "ファイル",

        // Edit menu
        edit: "編集",

        // View menu
        view: "表示",

        // Window menu
        window: "ウインドウ",

        // Help menu
        help: "ヘルプ",
        documentation: "ドキュメント",
        reportIssue: "問題を報告",
    },

    "zh-Hant": {
        // File menu
        file: "檔案",

        // Edit menu
        edit: "編輯",

        // View menu
        view: "檢視",

        // Window menu
        window: "視窗",

        // Help menu
        help: "說明",
        documentation: "文件",
        reportIssue: "回報問題",
    },
}

/**
 * Get menu translations for a locale
 */
export function getMenuTranslations(locale: MenuLocale): MenuTranslations {
    return translations[locale]
}

/**
 * Get locale from stored preference or system default
 * Checks config file for user's language preference first
 */
export function getPreferredLocale(appLocale: string): MenuLocale {
    const savedLocale = getUserLocale()
    if (savedLocale) {
        return savedLocale
    }

    const lower = appLocale.toLowerCase()

    // Distinguish Traditional Chinese locales (TW, HK, Hant) from Simplified
    if (
        lower.startsWith("zh-hant") ||
        lower.startsWith("zh-tw") ||
        lower.startsWith("zh-hk")
    ) {
        return "zh-Hant"
    }

    const language = lower.split("-")[0]

    if (language === "zh") return "zh"
    if (language === "ja") return "ja"
    return "en"
}
