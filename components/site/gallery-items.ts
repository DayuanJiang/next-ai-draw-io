import type { Locale } from "@/lib/i18n/config"

// The docs gallery: diagrams the AI drew, each from one prompt. A plain
// module, so the server and the gallery component can both read it.

export type GalleryCategory =
    | "cloud"
    | "software"
    | "process"
    | "business"
    | "ai"
    | "drawing"

export type GalleryItem = {
    id: string
    /** The exported SVG, under public/ */
    src: string
    category: GalleryCategory
    /**
     * "mcp": Claude Code through the MCP server, which checked a screenshot
     * of its result; "web": the web app
     */
    via: "mcp" | "web"
    /** As typed; prompts stay in English in every language */
    prompt: string
    /** The prompt came with a file, so it cannot be tried alone */
    attachment?: "pdf"
    title: Record<Locale, string>
}

export const GALLERY_CATEGORIES: {
    id: GalleryCategory
    label: Record<Locale, string>
}[] = [
    {
        id: "cloud",
        label: {
            en: "Cloud and infrastructure",
            zh: "云与基础设施",
            ja: "クラウドとインフラ",
            "zh-Hant": "雲端與基礎架構",
        },
    },
    {
        id: "software",
        label: {
            en: "Software design",
            zh: "软件设计",
            ja: "ソフトウェア設計",
            "zh-Hant": "軟體設計",
        },
    },
    {
        id: "process",
        label: {
            en: "Processes",
            zh: "流程",
            ja: "業務フロー",
            "zh-Hant": "流程",
        },
    },
    {
        id: "business",
        label: {
            en: "Planning and business",
            zh: "规划与业务",
            ja: "計画とビジネス",
            "zh-Hant": "規劃與業務",
        },
    },
    {
        id: "ai",
        label: {
            en: "AI and research",
            zh: "AI 与研究",
            ja: "AI と研究",
            "zh-Hant": "AI 與研究",
        },
    },
    {
        id: "drawing",
        label: {
            en: "Drawings",
            zh: "绘画",
            ja: "イラスト",
            "zh-Hant": "繪畫",
        },
    },
]

/** In the order of the gallery: different kinds of diagram near the top */
export const GALLERY_ITEMS: GalleryItem[] = [
    {
        id: "kubernetes",
        src: "/gallery/kubernetes.svg",
        category: "cloud",
        via: "mcp",
        prompt: "Draw a Kubernetes deployment for a web shop: an ingress, web and API deployments with their services and pods, a Redis StatefulSet with a persistent volume, a ConfigMap, a Secret, and an autoscaler on the API.",
        title: {
            en: "Kubernetes deployment for a web shop",
            zh: "网店的 Kubernetes 部署",
            ja: "Web ショップの Kubernetes デプロイ",
            "zh-Hant": "網店的 Kubernetes 部署",
        },
    },
    {
        id: "er-shop",
        src: "/gallery/er-shop.svg",
        category: "software",
        via: "mcp",
        prompt: "Draw an ER diagram for an online shop: customers, addresses, orders, order items, products, categories and payments, with primary and foreign keys and the cardinality of each relationship.",
        title: {
            en: "ER diagram of an online shop",
            zh: "网店的 ER 图",
            ja: "オンラインショップの ER 図",
            "zh-Hant": "網店的 ER 圖",
        },
    },
    {
        id: "transformer",
        src: "/animated_connectors.svg",
        category: "ai",
        via: "web",
        prompt: "Give me an animated connector diagram of transformer's architecture.",
        title: {
            en: "Transformer architecture with animated connectors",
            zh: "带动画连线的 Transformer 架构",
            ja: "アニメーション付きの Transformer 構成",
            "zh-Hant": "帶動畫連線的 Transformer 架構",
        },
    },
    {
        id: "bpmn-expense",
        src: "/gallery/bpmn-expense.svg",
        category: "process",
        via: "mcp",
        prompt: "Draw a BPMN process for an expense claim: an employee submits it, the manager approves or rejects it, finance checks the receipts and pays, and the claim goes back to the employee when receipts are missing.",
        title: {
            en: "BPMN expense claim process",
            zh: "BPMN 报销流程",
            ja: "BPMN の経費精算プロセス",
            "zh-Hant": "BPMN 報銷流程",
        },
    },
    {
        id: "mindmap-launch",
        src: "/gallery/mindmap-launch.svg",
        category: "business",
        via: "mcp",
        prompt: "Draw a mind map for planning a product launch: goals, audience, messaging, channels, timeline, budget and metrics, each with a few ideas.",
        title: {
            en: "Product launch mind map",
            zh: "产品发布思维导图",
            ja: "製品ローンチのマインドマップ",
            "zh-Hant": "產品發表心智圖",
        },
    },
    {
        id: "oauth-sequence",
        src: "/gallery/oauth-sequence.svg",
        category: "software",
        via: "mcp",
        prompt: "Draw a sequence diagram of an OAuth 2.0 login with PKCE between the user, a browser app, the identity provider and an API.",
        title: {
            en: "OAuth 2.0 login with PKCE",
            zh: "OAuth 2.0 PKCE 登录时序图",
            ja: "OAuth 2.0 PKCE ログインのシーケンス図",
            "zh-Hant": "OAuth 2.0 PKCE 登入時序圖",
        },
    },
    {
        id: "aws",
        src: "/aws_demo.svg",
        category: "cloud",
        via: "web",
        prompt: "Generate an AWS architecture diagram with AWS icons. In this diagram, users connect to a frontend hosted on an instance.",
        title: {
            en: "AWS architecture with AWS icons",
            zh: "使用 AWS 图标的架构图",
            ja: "AWS アイコンの構成図",
            "zh-Hant": "使用 AWS 圖示的架構圖",
        },
    },
    {
        id: "org-chart",
        src: "/gallery/org-chart.svg",
        category: "business",
        via: "mcp",
        prompt: "Draw an org chart for a 25-person startup: the CEO, a CTO with two engineering teams, a head of product with designers, a head of sales with account executives, and operations.",
        title: {
            en: "Org chart of a startup",
            zh: "创业公司组织架构图",
            ja: "スタートアップの組織図",
            "zh-Hant": "新創公司組織圖",
        },
    },
    {
        id: "rag",
        src: "/rag_prod.svg",
        category: "ai",
        via: "web",
        prompt: "Generate a RAG architecture diagram for chat application. Use connected diagram for data ingestion",
        title: {
            en: "RAG for a chat application",
            zh: "聊天应用的 RAG 架构",
            ja: "チャットアプリの RAG 構成",
            "zh-Hant": "聊天應用的 RAG 架構",
        },
    },
    {
        id: "swimlane-hiring",
        src: "/gallery/swimlane-hiring.svg",
        category: "process",
        via: "mcp",
        prompt: "Draw a swimlane diagram of a hiring process across the candidate, the recruiter, the hiring manager and the interview panel, from application to offer.",
        title: {
            en: "Hiring process in swimlanes",
            zh: "招聘流程泳道图",
            ja: "採用プロセスのスイムレーン図",
            "zh-Hant": "招募流程泳道圖",
        },
    },
    {
        id: "uml-library",
        src: "/gallery/uml-library.svg",
        category: "software",
        via: "mcp",
        prompt: "Draw a UML class diagram for a library system: Book, Copy, Member, Loan, Reservation, Librarian and Fine, with their main attributes, methods and the relationships between them.",
        title: {
            en: "UML class diagram of a library",
            zh: "图书馆系统的 UML 类图",
            ja: "図書館システムの UML クラス図",
            "zh-Hant": "圖書館系統的 UML 類別圖",
        },
    },
    {
        id: "gantt-app",
        src: "/gallery/gantt-app.svg",
        category: "business",
        via: "mcp",
        prompt: "Draw a Gantt chart for a 12-week mobile app launch: discovery, design, three development sprints, beta testing, app store review and launch, with milestones.",
        title: {
            en: "12-week app launch plan",
            zh: "12 周应用发布计划",
            ja: "12 週間のアプリ公開計画",
            "zh-Hant": "12 週應用發表計畫",
        },
    },
    {
        id: "cicd-github",
        src: "/gallery/cicd-github.svg",
        category: "cloud",
        via: "mcp",
        prompt: "Draw a CI/CD pipeline with GitHub Actions: on a pull request run lint, unit tests and a security scan in parallel, build a Docker image, deploy to staging, wait for approval, then deploy to production on AWS, with a rollback path.",
        title: {
            en: "CI/CD with GitHub Actions",
            zh: "GitHub Actions 的 CI/CD 流水线",
            ja: "GitHub Actions の CI/CD パイプライン",
            "zh-Hant": "GitHub Actions 的 CI/CD 流水線",
        },
    },
    {
        id: "order-states",
        src: "/gallery/order-states.svg",
        category: "software",
        via: "mcp",
        prompt: "Draw a state machine for an e-commerce order: created, payment pending, paid, packed, shipped, delivered, cancelled, refund requested and refunded, with the events between them.",
        title: {
            en: "Order state machine",
            zh: "订单状态机",
            ja: "注文の状態遷移図",
            "zh-Hant": "訂單狀態機",
        },
    },
    {
        id: "office-network",
        src: "/gallery/office-network.svg",
        category: "cloud",
        via: "mcp",
        prompt: "Draw a network diagram of a small office with Cisco icons: the internet, a firewall, a router, a core switch, Wi-Fi access points, laptops, a file server, a printer and a separate guest VLAN.",
        title: {
            en: "Small office network",
            zh: "小型办公室网络",
            ja: "小規模オフィスのネットワーク",
            "zh-Hant": "小型辦公室網路",
        },
    },
    {
        id: "resnet50",
        src: "/resnet50.svg",
        category: "ai",
        via: "web",
        prompt: "Give me an animated architecture diagram of the ResNet50 model.",
        title: {
            en: "ResNet50 model architecture",
            zh: "ResNet50 模型架构",
            ja: "ResNet50 のモデル構成",
            "zh-Hant": "ResNet50 模型架構",
        },
    },
    {
        id: "scrum",
        src: "/agile_scrum.svg",
        category: "process",
        via: "web",
        prompt: "Generate agile scrum workflow diagram for software development team.",
        title: {
            en: "Agile Scrum workflow",
            zh: "敏捷 Scrum 工作流程",
            ja: "アジャイル Scrum のワークフロー",
            "zh-Hant": "敏捷 Scrum 工作流程",
        },
    },
    {
        id: "auth",
        src: "/auth.svg",
        category: "cloud",
        via: "web",
        prompt: "Generate authentication process using React with AWS. Use Serverless architecture.",
        title: {
            en: "Serverless sign-in with React and AWS",
            zh: "React 与 AWS 的无服务器登录",
            ja: "React と AWS のサーバーレス認証",
            "zh-Hant": "React 與 AWS 的無伺服器登入",
        },
    },
    {
        id: "inno",
        src: "/inno.svg",
        category: "business",
        via: "web",
        prompt: "Create visualization of Henry Chesbrough's Open Innovation model.",
        title: {
            en: "Open Innovation model",
            zh: "开放式创新模型",
            ja: "オープンイノベーション・モデル",
            "zh-Hant": "開放式創新模型",
        },
    },
    {
        id: "azure",
        src: "/azure_demo.svg",
        category: "cloud",
        via: "web",
        prompt: "Generate an Azure architecture diagram with Azure icons. In this diagram, users connect to a frontend hosted on an instance.",
        title: {
            en: "Azure architecture with Azure icons",
            zh: "使用 Azure 图标的架构图",
            ja: "Azure アイコンの構成図",
            "zh-Hant": "使用 Azure 圖示的架構圖",
        },
    },
    {
        id: "gcp",
        src: "/gcp_demo.svg",
        category: "cloud",
        via: "web",
        prompt: "Generate a GCP architecture diagram with GCP icons. In this diagram, users connect to a frontend hosted on an instance.",
        title: {
            en: "Google Cloud architecture with GCP icons",
            zh: "使用 GCP 图标的架构图",
            ja: "GCP アイコンの構成図",
            "zh-Hant": "使用 GCP 圖示的架構圖",
        },
    },
    {
        id: "paper",
        src: "/paper_demo.svg",
        category: "ai",
        via: "web",
        prompt: "Summarize this paper as a diagram",
        attachment: "pdf",
        title: {
            en: "A research paper as a diagram",
            zh: "把论文画成图",
            ja: "論文を図にまとめる",
            "zh-Hant": "把論文畫成圖",
        },
    },
    {
        id: "cat",
        src: "/cat_demo.svg",
        category: "drawing",
        via: "web",
        prompt: "Draw a cute cat for me.",
        title: {
            en: "A cat drawn with shapes",
            zh: "用图形画的小猫",
            ja: "図形で描いた猫",
            "zh-Hant": "用圖形畫的小貓",
        },
    },
]

export type GalleryTexts = {
    all: string
    prompt: string
    tryPrompt: string
    copy: string
    copied: string
    byMcp: string
    byWeb: string
    fromPdf: string
    enlarge: string
    close: string
}

export const GALLERY_TEXTS: Record<Locale, GalleryTexts> = {
    en: {
        all: "All",
        prompt: "Prompt",
        tryPrompt: "Try this prompt",
        copy: "Copy the prompt",
        copied: "Copied",
        byMcp: "Claude Code with the MCP server",
        byWeb: "Web app",
        fromPdf: "With the paper attached as a PDF",
        enlarge: "Enlarge",
        close: "Close",
    },
    zh: {
        all: "全部",
        prompt: "提示词",
        tryPrompt: "试试这个提示词",
        copy: "复制提示词",
        copied: "已复制",
        byMcp: "Claude Code 与 MCP 服务器",
        byWeb: "网页版",
        fromPdf: "同时附上了论文的 PDF",
        enlarge: "放大",
        close: "关闭",
    },
    ja: {
        all: "すべて",
        prompt: "プロンプト",
        tryPrompt: "このプロンプトを試す",
        copy: "プロンプトをコピー",
        copied: "コピーしました",
        byMcp: "Claude Code と MCP サーバー",
        byWeb: "Web アプリ",
        fromPdf: "論文の PDF を添付",
        enlarge: "拡大",
        close: "閉じる",
    },
    "zh-Hant": {
        all: "全部",
        prompt: "提示詞",
        tryPrompt: "試試這個提示詞",
        copy: "複製提示詞",
        copied: "已複製",
        byMcp: "Claude Code 與 MCP 伺服器",
        byWeb: "網頁版",
        fromPdf: "同時附上了論文的 PDF",
        enlarge: "放大",
        close: "關閉",
    },
}
