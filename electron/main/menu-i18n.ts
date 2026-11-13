/**
 * Internationalization support for Electron menu
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

    // Title of the error box when the exported PDF could not be saved
    pdfSaveFailed: "Could not save the PDF",
}

/**
 * Labels of the items that Electron runs by a role (Undo, Reload, Quit...).
 * Electron labels them in English on every system, so each other language
 * brings its own. The app's name is written out: app.name is the package
 * name (next-ai-draw-io) in the packaged app.
 */
export type RoleLabels = Record<
    | "about"
    | "services"
    | "hide"
    | "hideOthers"
    | "unhide"
    | "quit"
    | "close"
    | "undo"
    | "redo"
    | "cut"
    | "copy"
    | "paste"
    | "pasteAndMatchStyle"
    | "delete"
    | "selectAll"
    | "reload"
    | "forceReload"
    | "toggleDevTools"
    | "resetZoom"
    | "zoomIn"
    | "zoomOut"
    | "togglefullscreen"
    | "minimize"
    | "zoom"
    | "front",
    string
>

// English has no role labels: Electron's own are English already
type MenuTranslations = typeof en & { roles?: RoleLabels }

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

        pdfSaveFailed: "无法保存 PDF",

        roles: {
            about: "关于 Next AI Draw.io",
            services: "服务",
            hide: "隐藏 Next AI Draw.io",
            hideOthers: "隐藏其他",
            unhide: "全部显示",
            quit: "退出 Next AI Draw.io",
            close: "关闭窗口",
            undo: "撤销",
            redo: "重做",
            cut: "剪切",
            copy: "复制",
            paste: "粘贴",
            pasteAndMatchStyle: "粘贴并匹配样式",
            delete: "删除",
            selectAll: "全选",
            reload: "重新加载",
            forceReload: "强制重新加载",
            toggleDevTools: "切换开发者工具",
            resetZoom: "实际大小",
            zoomIn: "放大",
            zoomOut: "缩小",
            togglefullscreen: "切换全屏",
            minimize: "最小化",
            zoom: "缩放",
            front: "前置全部窗口",
        },
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

        pdfSaveFailed: "PDF を保存できませんでした",

        roles: {
            about: "Next AI Draw.io について",
            services: "サービス",
            hide: "Next AI Draw.io を非表示",
            hideOthers: "ほかを非表示",
            unhide: "すべてを表示",
            quit: "Next AI Draw.io を終了",
            close: "ウインドウを閉じる",
            undo: "取り消す",
            redo: "やり直す",
            cut: "切り取り",
            copy: "コピー",
            paste: "貼り付け",
            pasteAndMatchStyle: "貼り付けてスタイルを合わせる",
            delete: "削除",
            selectAll: "すべて選択",
            reload: "再読み込み",
            forceReload: "強制的に再読み込み",
            toggleDevTools: "開発者ツールを切り替え",
            resetZoom: "実際のサイズ",
            zoomIn: "拡大",
            zoomOut: "縮小",
            togglefullscreen: "全画面表示を切り替え",
            minimize: "最小化",
            zoom: "拡大/縮小",
            front: "すべてを手前に移動",
        },
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

        pdfSaveFailed: "無法儲存 PDF",

        roles: {
            about: "關於 Next AI Draw.io",
            services: "服務",
            hide: "隱藏 Next AI Draw.io",
            hideOthers: "隱藏其他",
            unhide: "顯示全部",
            quit: "結束 Next AI Draw.io",
            close: "關閉視窗",
            undo: "復原",
            redo: "重做",
            cut: "剪下",
            copy: "複製",
            paste: "貼上",
            pasteAndMatchStyle: "貼上並符合樣式",
            delete: "刪除",
            selectAll: "全選",
            reload: "重新載入",
            forceReload: "強制重新載入",
            toggleDevTools: "切換開發人員工具",
            resetZoom: "實際大小",
            zoomIn: "放大",
            zoomOut: "縮小",
            togglefullscreen: "切換全螢幕",
            minimize: "最小化",
            zoom: "縮放",
            front: "將全部視窗移至最前",
        },
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
