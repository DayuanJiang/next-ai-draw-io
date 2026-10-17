import type { Locale } from "@/lib/i18n/config"

export const GITHUB_URL = "https://github.com/DayuanJiang/next-ai-draw-io"
export const RELEASES_URL = `${GITHUB_URL}/releases/latest`
export const NPM_URL =
    "https://www.npmjs.com/package/@next-ai-drawio/mcp-server"
export const SPONSOR_URL = "https://github.com/sponsors/DayuanJiang"
export const MCP_INSTALL =
    "claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest"

// One-click installs: these pages open VS Code or Cursor, which then adds the
// server. The MCP server README links to the same addresses.
const MCP_SERVER = {
    command: "npx",
    args: ["@next-ai-drawio/mcp-server@latest"],
}
export const MCP_VSCODE_INSTALL_URL = `https://insiders.vscode.dev/redirect?url=${encodeURIComponent(
    `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "drawio", ...MCP_SERVER }))}`,
)}`
export const MCP_CURSOR_INSTALL_URL = `https://cursor.com/en/install-mcp?name=drawio&config=${encodeURIComponent(
    btoa(JSON.stringify(MCP_SERVER)),
)}`

// Each language's name in itself, for the language links
export const LANGUAGE_NAMES: Record<Locale, string> = {
    en: "English",
    zh: "简体中文",
    ja: "日本語",
    "zh-Hant": "繁體中文",
}

export type SiteTexts = {
    nav: {
        docs: string
        mcp: string
        gallery: string
        openEditor: string
        language: string
        /** The button that opens the links on a phone */
        menu: string
        /** The docs' list of pages on a phone */
        pages: string
    }
    copy: { copy: string; copied: string }
    footer: {
        tagline: string
        product: string
        editor: string
        desktop: string
        mcp: string
        docs: string
        project: string
        github: string
        npm: string
        issues: string
        support: string
        sponsor: string
        sponsorText: string
        contact: string
        license: string
    }
}

export const SITE_TEXTS: Record<Locale, SiteTexts> = {
    en: {
        nav: {
            docs: "Docs",
            mcp: "MCP server",
            gallery: "Gallery",
            openEditor: "Open the editor",
            language: "Language",
            menu: "Menu",
            pages: "All pages",
        },
        copy: { copy: "Copy the command", copied: "Copied" },
        footer: {
            tagline: "Draw and edit draw.io diagrams by chatting with an AI.",
            product: "Product",
            editor: "Editor",
            desktop: "Desktop app",
            mcp: "MCP server",
            docs: "Docs",
            project: "Project",
            github: "GitHub",
            npm: "npm package",
            issues: "Report an issue",
            support: "Support",
            sponsor: "Sponsor",
            sponsorText:
                "If this project helps you, sponsoring it keeps the live demo running.",
            contact: "Contact: me[at]jiang.jp",
            license: "Open source under the Apache-2.0 license.",
        },
    },
    zh: {
        nav: {
            docs: "文档",
            mcp: "MCP 服务器",
            gallery: "图库",
            openEditor: "打开编辑器",
            language: "语言",
            menu: "菜单",
            pages: "全部页面",
        },
        copy: { copy: "复制命令", copied: "已复制" },
        footer: {
            tagline: "和 AI 对话，绘制和修改 draw.io 图表。",
            product: "产品",
            editor: "编辑器",
            desktop: "桌面应用",
            mcp: "MCP 服务器",
            docs: "文档",
            project: "项目",
            github: "GitHub",
            npm: "npm 包",
            issues: "反馈问题",
            support: "支持",
            sponsor: "赞助",
            sponsorText:
                "如果这个项目对您有帮助，您的赞助可以让在线演示站继续运行。",
            contact: "联系：me[at]jiang.jp",
            license: "基于 Apache-2.0 许可证开源。",
        },
    },
    ja: {
        nav: {
            docs: "ドキュメント",
            mcp: "MCP サーバー",
            gallery: "ギャラリー",
            openEditor: "エディタを開く",
            language: "言語",
            menu: "メニュー",
            pages: "すべてのページ",
        },
        copy: { copy: "コマンドをコピー", copied: "コピーしました" },
        footer: {
            tagline: "AI と話しながら draw.io の図を描いて編集できます。",
            product: "製品",
            editor: "エディタ",
            desktop: "デスクトップアプリ",
            mcp: "MCP サーバー",
            docs: "ドキュメント",
            project: "プロジェクト",
            github: "GitHub",
            npm: "npm パッケージ",
            issues: "問題を報告",
            support: "サポート",
            sponsor: "スポンサー",
            sponsorText:
                "このプロジェクトが役に立ったら、スポンサーになってライブデモの運営を支えてください。",
            contact: "連絡先：me[at]jiang.jp",
            license: "Apache-2.0 ライセンスのオープンソースです。",
        },
    },
    "zh-Hant": {
        nav: {
            docs: "文件",
            mcp: "MCP 伺服器",
            gallery: "圖庫",
            openEditor: "開啟編輯器",
            language: "語言",
            menu: "選單",
            pages: "所有頁面",
        },
        copy: { copy: "複製指令", copied: "已複製" },
        footer: {
            tagline: "和 AI 對話，繪製和修改 draw.io 圖表。",
            product: "產品",
            editor: "編輯器",
            desktop: "桌面應用程式",
            mcp: "MCP 伺服器",
            docs: "文件",
            project: "專案",
            github: "GitHub",
            npm: "npm 套件",
            issues: "回報問題",
            support: "支援",
            sponsor: "贊助",
            sponsorText:
                "如果這個專案對您有幫助，您的贊助可以讓線上展示網站繼續運作。",
            contact: "聯絡：me[at]jiang.jp",
            license: "以 Apache-2.0 授權開源。",
        },
    },
}
