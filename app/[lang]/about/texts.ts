import type { Locale } from "@/lib/i18n/config"

export type LandingTexts = {
    title: string
    description: string
    keywords: string[]
    h1: string
    lede: string
    primary: string
    /** In place of `primary` on a phone, where the editor does not fit */
    phonePrimary: string
    secondary: string
    waysHeading: string
    ways: {
        browser: { title: string; text: string; action: string }
        desktop: { title: string; text: string; action: string }
        agent: { title: string; text: string; action: string }
    }
    examplesHeading: string
    examplesIntro: string
    /** The link to the gallery page */
    examplesMore: string
    /** With its colon, which differs between Latin and CJK text */
    promptLabel: string
    /** Before the name of the model that drew an example */
    modelLabel: string
    moreHeading: string
    more: { title: string; text: string }[]
    /** The link after the last item, to the self-hosting docs */
    selfHostLink: string
    providersHeading: string
    providersText: string
    ctaHeading: string
}

export const TEXTS: Record<Locale, LandingTexts> = {
    en: {
        title: "Next AI Draw.io: draw.io diagrams by chatting with an AI",
        description:
            "Describe a diagram and the AI draws it on a real draw.io canvas: AWS, Azure and GCP architecture diagrams, flowcharts and more. Edit it by hand, ask the AI for changes and undo any of them. Free and open source, also as a desktop app and an MCP server.",
        keywords: [
            "AI diagram generator",
            "draw.io AI",
            "AWS architecture diagram",
            "flowchart generator",
            "draw.io MCP server",
            "text to diagram",
        ],
        h1: "Draw and edit draw.io diagrams by chatting with an AI",
        lede: "Describe a diagram and the AI draws it on a real draw.io canvas. Every change it makes is outlined and saved as a version you can restore.",
        primary: "Open the editor",
        phonePrimary: "Read the docs",
        secondary: "Use it from Claude Code",
        waysHeading: "Three ways to use it",
        ways: {
            browser: {
                title: "In the browser",
                text: "Nothing to install. Add your own API key to lift the demo's daily limit.",
                action: "Open the editor",
            },
            desktop: {
                title: "On your desktop",
                text: "The same app for Windows, macOS and Linux.",
                action: "Download the latest release",
            },
            agent: {
                title: "In your AI agent",
                text: "Claude Code, Cursor, Codex and VS Code draw from your project's files on the same canvas.",
                action: "Other clients and details",
            },
        },
        examplesHeading: "Examples",
        examplesIntro: "Prompts and the diagrams the AI drew from them.",
        examplesMore: "See all examples in the gallery",
        promptLabel: "Prompt:",
        modelLabel: "Model:",
        moreHeading: "Also in the editor",
        more: [
            {
                title: "Start from a picture",
                text: "Upload a screenshot, a whiteboard photo, a PDF or a web page, and the AI redraws it as a diagram you can edit.",
            },
            {
                title: "Real cloud icons",
                text: "Shape libraries for AWS, Azure, GCP, Kubernetes, Cisco and more, so architecture diagrams use the official icons.",
            },
            {
                title: "Animated connectors",
                text: "Connectors can show the direction of the flow, for data pipelines and request paths.",
            },
            {
                title: "Compare versions",
                text: "Open any version next to the canvas to see what changed, then restore it or keep going.",
            },
            {
                title: "Keep it in draw.io",
                text: "Save a .drawio file to keep editing in draw.io, or export PNG and SVG.",
            },
            {
                title: "Host it yourself",
                text: "Open source under Apache-2.0. Run it with Docker, on Cloudflare or fully offline.",
            },
        ],
        selfHostLink: "Self-hosting guides",
        providersHeading: "Works with the AI provider you already use",
        providersText:
            "Pick a provider and a model in Settings and enter your own key. The key is kept in your browser and never stored on the server.",
        ctaHeading: "Describe your next diagram",
    },
    zh: {
        title: "Next AI Draw.io：和 AI 对话绘制 draw.io 图表",
        description:
            "描述您想要的图表，AI 会在真正的 draw.io 画布上画出来：AWS、Azure、GCP 架构图、流程图等。可以手动编辑，也可以让 AI 修改，任何修改都能撤销。免费开源，另有桌面应用和 MCP 服务器。",
        keywords: [
            "AI 画图",
            "AI 图表生成",
            "draw.io AI",
            "AWS 架构图",
            "流程图生成",
            "draw.io MCP",
        ],
        h1: "和 AI 对话，绘制和修改 draw.io 图表",
        lede: "描述您想要的图表，AI 会在真正的 draw.io 画布上画出来。它的每次修改都会被框出来，并保存为可以恢复的版本。",
        primary: "打开编辑器",
        phonePrimary: "查看文档",
        secondary: "在 Claude Code 里使用",
        waysHeading: "三种使用方式",
        ways: {
            browser: {
                title: "在浏览器里",
                text: "无需安装。填入自己的 API Key，就不受演示站每日额度的限制。",
                action: "打开编辑器",
            },
            desktop: {
                title: "在桌面上",
                text: "同一个应用，支持 Windows、macOS 和 Linux。",
                action: "下载最新版本",
            },
            agent: {
                title: "在 AI 代理里",
                text: "Claude Code、Cursor、Codex 和 VS Code 可以根据项目里的文件，在同一块画布上画图。",
                action: "其他客户端和详细说明",
            },
        },
        examplesHeading: "示例",
        examplesIntro: "提示词，以及 AI 根据它们画出的图表。",
        examplesMore: "在图库里查看全部示例",
        promptLabel: "提示词：",
        modelLabel: "模型：",
        moreHeading: "编辑器里还有",
        more: [
            {
                title: "从图片开始",
                text: "上传截图、白板照片、PDF 或网页，AI 会把它重画成可以编辑的图表。",
            },
            {
                title: "真实的云图标",
                text: "内置 AWS、Azure、GCP、Kubernetes、Cisco 等图形库，架构图用的是官方图标。",
            },
            {
                title: "动画连接线",
                text: "连接线可以显示流向，适合数据管道和请求路径。",
            },
            {
                title: "对比版本",
                text: "把任意版本和画布放在一起，看清改了什么，再决定恢复还是继续。",
            },
            {
                title: "继续在 draw.io 里用",
                text: "保存为 .drawio 文件后可以继续在 draw.io 里编辑，也可以导出 PNG 和 SVG。",
            },
            {
                title: "自己部署",
                text: "基于 Apache-2.0 开源。可以用 Docker、Cloudflare 部署，也可以完全离线运行。",
            },
        ],
        selfHostLink: "部署指南",
        providersHeading: "支持您正在用的 AI 服务商",
        providersText:
            "在设置里选择服务商和模型，填入自己的 Key 即可。Key 只保存在您的浏览器里，不会存到服务器上。",
        ctaHeading: "描述您的下一张图",
    },
    ja: {
        title: "Next AI Draw.io：AI と話して draw.io の図を描く",
        description:
            "描きたい図を伝えると、AI が本物の draw.io キャンバスに描きます。AWS、Azure、GCP のアーキテクチャ図やフローチャートなどに対応。手で編集することも、AI に修正を頼むこともでき、どの変更も取り消せます。無料のオープンソースで、デスクトップアプリと MCP サーバーもあります。",
        keywords: [
            "AI 作図",
            "AI ダイアグラム",
            "draw.io AI",
            "AWS 構成図",
            "フローチャート 作成",
            "draw.io MCP",
        ],
        h1: "AI と話しながら draw.io の図を描いて編集する",
        lede: "描きたい図を伝えると、AI が本物の draw.io キャンバスに描きます。AI の変更はすべて枠で示され、元に戻せるバージョンとして保存されます。",
        primary: "エディタを開く",
        phonePrimary: "ドキュメントを見る",
        secondary: "Claude Code から使う",
        waysHeading: "3 つの使い方",
        ways: {
            browser: {
                title: "ブラウザで",
                text: "インストール不要です。自分の API キーを入れると、デモの 1 日あたりの上限がなくなります。",
                action: "エディタを開く",
            },
            desktop: {
                title: "デスクトップで",
                text: "同じアプリを Windows、macOS、Linux で使えます。",
                action: "最新版をダウンロード",
            },
            agent: {
                title: "AI エージェントから",
                text: "Claude Code、Cursor、Codex、VS Code が、プロジェクトのファイルをもとに同じキャンバスに描きます。",
                action: "ほかのクライアントと詳細",
            },
        },
        examplesHeading: "例",
        examplesIntro: "プロンプトと、そこから AI が描いた図です。",
        examplesMore: "ギャラリーですべての例を見る",
        promptLabel: "プロンプト：",
        modelLabel: "モデル：",
        moreHeading: "エディタのその他の機能",
        more: [
            {
                title: "画像から始める",
                text: "スクリーンショット、ホワイトボードの写真、PDF、Web ページをアップロードすると、AI が編集できる図に描き直します。",
            },
            {
                title: "本物のクラウドアイコン",
                text: "AWS、Azure、GCP、Kubernetes、Cisco などの図形ライブラリを内蔵。構成図に公式アイコンが使われます。",
            },
            {
                title: "アニメーションするコネクタ",
                text: "コネクタで流れの向きを示せます。データパイプラインやリクエストの経路に便利です。",
            },
            {
                title: "バージョンを比較",
                text: "どのバージョンもキャンバスと並べて変更点を確認し、復元するか続けるかを選べます。",
            },
            {
                title: "draw.io でそのまま使える",
                text: ".drawio ファイルとして保存すれば draw.io で編集を続けられます。PNG や SVG にも書き出せます。",
            },
            {
                title: "自分でホストする",
                text: "Apache-2.0 のオープンソースです。Docker や Cloudflare で動かせるほか、完全にオフラインでも使えます。",
            },
        ],
        selfHostLink: "セルフホストのガイド",
        providersHeading: "いつもの AI プロバイダーで使えます",
        providersText:
            "設定でプロバイダーとモデルを選び、自分のキーを入れるだけです。キーはブラウザに保存され、サーバーには保存されません。",
        ctaHeading: "次の図を AI に伝えてみましょう",
    },
    "zh-Hant": {
        title: "Next AI Draw.io：和 AI 對話繪製 draw.io 圖表",
        description:
            "描述您想要的圖表，AI 會在真正的 draw.io 畫布上畫出來：AWS、Azure、GCP 架構圖、流程圖等。可以手動編輯，也可以讓 AI 修改，任何修改都能復原。免費開源，另有桌面應用程式和 MCP 伺服器。",
        keywords: [
            "AI 畫圖",
            "AI 圖表產生",
            "draw.io AI",
            "AWS 架構圖",
            "流程圖產生",
            "draw.io MCP",
        ],
        h1: "和 AI 對話，繪製和修改 draw.io 圖表",
        lede: "描述您想要的圖表，AI 會在真正的 draw.io 畫布上畫出來。它的每次修改都會被框出來，並儲存為可以還原的版本。",
        primary: "開啟編輯器",
        phonePrimary: "查看文件",
        secondary: "在 Claude Code 裡使用",
        waysHeading: "三種使用方式",
        ways: {
            browser: {
                title: "在瀏覽器裡",
                text: "無需安裝。填入自己的 API Key，就不受展示網站每日額度的限制。",
                action: "開啟編輯器",
            },
            desktop: {
                title: "在桌面上",
                text: "同一個應用程式，支援 Windows、macOS 和 Linux。",
                action: "下載最新版本",
            },
            agent: {
                title: "在 AI 代理裡",
                text: "Claude Code、Cursor、Codex 和 VS Code 可以根據專案裡的檔案，在同一塊畫布上畫圖。",
                action: "其他用戶端和詳細說明",
            },
        },
        examplesHeading: "範例",
        examplesIntro: "提示詞，以及 AI 根據它們畫出的圖表。",
        examplesMore: "在圖庫裡查看全部範例",
        promptLabel: "提示詞：",
        modelLabel: "模型：",
        moreHeading: "編輯器裡還有",
        more: [
            {
                title: "從圖片開始",
                text: "上傳截圖、白板照片、PDF 或網頁，AI 會把它重畫成可以編輯的圖表。",
            },
            {
                title: "真實的雲端圖示",
                text: "內建 AWS、Azure、GCP、Kubernetes、Cisco 等圖形庫，架構圖用的是官方圖示。",
            },
            {
                title: "動畫連接線",
                text: "連接線可以顯示流向，適合資料管線和請求路徑。",
            },
            {
                title: "比較版本",
                text: "把任意版本和畫布放在一起，看清改了什麼，再決定還原還是繼續。",
            },
            {
                title: "繼續在 draw.io 裡用",
                text: "儲存為 .drawio 檔案後可以繼續在 draw.io 裡編輯，也可以匯出 PNG 和 SVG。",
            },
            {
                title: "自行架設",
                text: "以 Apache-2.0 授權開源。可以用 Docker、Cloudflare 架設，也可以完全離線執行。",
            },
        ],
        selfHostLink: "架設指南",
        providersHeading: "支援您正在用的 AI 服務商",
        providersText:
            "在設定裡選擇服務商和模型，填入自己的 Key 即可。Key 只儲存在您的瀏覽器裡，不會存到伺服器上。",
        ctaHeading: "描述您的下一張圖",
    },
}
