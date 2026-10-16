import type { Locale } from "@/lib/i18n/config"

export type ExampleId = "resnet50" | "rag" | "auth" | "scrum" | "inno"

export type LandingTexts = {
    title: string
    description: string
    keywords: string[]
    h1: string
    lede: string
    primary: string
    secondary: string
    /** The demo's steps and conversation; its other texts are the editor's */
    demo: {
        steps: { title: string; text: string }[]
        prompts: { draw: string; cache: string }
        replies: { draw: string; cache: string }
    }
    waysHeading: string
    ways: {
        browser: { title: string; text: string; action: string }
        desktop: { title: string; text: string; action: string }
        agent: { title: string; text: string; action: string }
    }
    examplesHeading: string
    examplesIntro: string
    /** With its colon, which differs between Latin and CJK text */
    promptLabel: string
    examples: Record<ExampleId, { title: string; alt: string }>
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
        secondary: "Use it from Claude Code",
        demo: {
            steps: [
                { title: "Generate", text: "The AI draws what you describe" },
                { title: "Edit by hand", text: "Drag shapes as in draw.io" },
                {
                    title: "Edit with AI",
                    text: "Select a shape, ask for a change",
                },
                {
                    title: "Version history",
                    text: "Undo or redo any AI change",
                },
            ],
            prompts: {
                draw: "Draw a serverless REST API on AWS",
                cache: "Add a cache in front of this",
            },
            replies: {
                draw: "A serverless REST API: API Gateway in front of Lambda, Cognito for sign-in, DynamoDB for data and S3 for files.",
                cache: "Added ElastiCache between Lambda and DynamoDB for reads, and kept S3 where you moved it.",
            },
        },
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
        promptLabel: "Prompt:",
        examples: {
            resnet50: {
                title: "Animated ResNet50 model architecture",
                alt: "Architecture diagram of the ResNet50 model",
            },
            rag: {
                title: "RAG for a chat application",
                alt: "RAG architecture diagram",
            },
            auth: {
                title: "Authentication with React and AWS",
                alt: "Authentication architecture diagram",
            },
            scrum: {
                title: "Agile Scrum process",
                alt: "Agile Scrum diagram",
            },
            inno: { title: "Open innovation", alt: "Open innovation diagram" },
        },
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
        secondary: "在 Claude Code 里使用",
        demo: {
            steps: [
                { title: "生成", text: "AI 按您的描述画图" },
                { title: "手动编辑", text: "像在 draw.io 里一样拖动图形" },
                { title: "让 AI 修改", text: "选中图形，告诉 AI 怎么改" },
                { title: "版本历史", text: "撤销或重做 AI 的任何修改" },
            ],
            prompts: {
                draw: "在 AWS 上画一个无服务器 REST API",
                cache: "在它前面加一层缓存",
            },
            replies: {
                draw: "一个无服务器 REST API：API Gateway 在 Lambda 前面，Cognito 负责登录，DynamoDB 存数据，S3 存文件。",
                cache: "在 Lambda 和 DynamoDB 之间加了用于读取的 ElastiCache，S3 保持在您移动后的位置。",
            },
        },
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
        promptLabel: "提示词：",
        examples: {
            resnet50: {
                title: "ResNet50 模型架构动画",
                alt: "ResNet50 模型架构图",
            },
            rag: { title: "聊天应用的 RAG 架构", alt: "RAG 架构图" },
            auth: { title: "React 和 AWS 认证流程", alt: "认证架构图" },
            scrum: { title: "敏捷 Scrum 流程", alt: "敏捷 Scrum 流程图" },
            inno: { title: "开放式创新", alt: "开放式创新图" },
        },
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
        secondary: "Claude Code から使う",
        demo: {
            steps: [
                { title: "生成", text: "伝えた内容を AI が図にします" },
                { title: "手で編集", text: "draw.io と同じように図形を移動" },
                {
                    title: "AI に修正を頼む",
                    text: "図形を選んで変更を頼みます",
                },
                {
                    title: "バージョン履歴",
                    text: "AI の変更を取り消し・やり直し",
                },
            ],
            prompts: {
                draw: "AWS でサーバーレスの REST API を描いて",
                cache: "この前にキャッシュを追加して",
            },
            replies: {
                draw: "サーバーレスの REST API です。Lambda の前に API Gateway、サインインに Cognito、データに DynamoDB、ファイルに S3 を置きました。",
                cache: "Lambda と DynamoDB の間に読み取り用の ElastiCache を追加し、S3 は移動された位置のままにしました。",
            },
        },
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
        promptLabel: "プロンプト：",
        examples: {
            resnet50: {
                title: "ResNet50 モデルアーキテクチャのアニメーション",
                alt: "ResNet50 モデルのアーキテクチャ図",
            },
            rag: {
                title: "チャットアプリの RAG 構成",
                alt: "RAG アーキテクチャ図",
            },
            auth: {
                title: "React と AWS による認証",
                alt: "認証アーキテクチャ図",
            },
            scrum: {
                title: "アジャイルスクラムのプロセス",
                alt: "アジャイルスクラム図",
            },
            inno: {
                title: "オープンイノベーション",
                alt: "オープンイノベーション図",
            },
        },
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
        secondary: "在 Claude Code 裡使用",
        demo: {
            steps: [
                { title: "產生", text: "AI 依照您的描述畫圖" },
                { title: "手動編輯", text: "像在 draw.io 裡一樣拖曳圖形" },
                { title: "讓 AI 修改", text: "選取圖形，告訴 AI 怎麼改" },
                { title: "版本紀錄", text: "復原或重做 AI 的任何修改" },
            ],
            prompts: {
                draw: "在 AWS 上畫一個無伺服器 REST API",
                cache: "在它前面加一層快取",
            },
            replies: {
                draw: "一個無伺服器 REST API：API Gateway 在 Lambda 前面，Cognito 負責登入，DynamoDB 存資料，S3 存檔案。",
                cache: "在 Lambda 和 DynamoDB 之間加了用於讀取的 ElastiCache，S3 維持在您移動後的位置。",
            },
        },
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
        promptLabel: "提示詞：",
        examples: {
            resnet50: {
                title: "ResNet50 模型架構動畫",
                alt: "ResNet50 模型架構圖",
            },
            rag: { title: "聊天應用的 RAG 架構", alt: "RAG 架構圖" },
            auth: { title: "React 和 AWS 認證流程", alt: "認證架構圖" },
            scrum: { title: "敏捷 Scrum 流程", alt: "敏捷 Scrum 流程圖" },
            inno: { title: "開放式創新", alt: "開放式創新圖" },
        },
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
