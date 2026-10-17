import type { Locale } from "@/lib/i18n/config"

export type GalleryPageTexts = {
    title: string
    description: string
    keywords: string[]
    h1: string
    lede: string
    /** How the diagrams were drawn */
    note: string
    tipsHeading: string
    tips: { title: string; text: string }[]
    /** Before the links to the docs pages */
    more: string
    moreLinks: { editor: string; aws: string; flowcharts: string }
}

// The quoted prompt fragments stay in English, as the prompts do
export const TEXTS: Record<Locale, GalleryPageTexts> = {
    en: {
        title: "Gallery: example diagrams and their prompts",
        description:
            "Diagrams the AI drew in Next AI Draw.io, each from one prompt: AWS, Azure, Google Cloud and Kubernetes architectures, ER, UML and sequence diagrams, BPMN, swimlanes, Gantt charts, mind maps and more. Copy a prompt or try it in the editor.",
        keywords: [
            "draw.io examples",
            "AI diagram examples",
            "diagram prompts",
            "AWS architecture diagram example",
            "ER diagram example",
            "sequence diagram example",
            "BPMN example",
        ],
        h1: "Example diagrams and the prompts behind them",
        lede: "Each diagram here came from one prompt. Open one to see it larger, copy its prompt, or open the editor with the prompt already in the chat input and change it before you send it.",
        note: "Every diagram was drawn by Claude Code through the MCP server, with the model named on its card. As the server asks it to, Claude Code looked at a screenshot of each result and fixed overlaps. The same prompt gives a somewhat different diagram each time, and other models draw in their own way.",
        tipsHeading: "Write your own prompt",
        tips: [
            {
                title: "Name the parts",
                text: "“customers, addresses, orders, order items, products, categories and payments”",
            },
            {
                title: "Say how they connect",
                text: "“the manager approves or rejects it, finance checks the receipts and pays”",
            },
            {
                title: "Name the kind of diagram",
                text: "ER diagram, sequence diagram, BPMN, swimlanes, Gantt chart, customer journey map.",
            },
            {
                title: "Ask for icons by name",
                text: "AWS, Azure, GCP, Kubernetes or Cisco icons, when they matter.",
            },
        ],
        more: "More on writing requests in the docs:",
        moreLinks: {
            editor: "Draw and edit",
            aws: "AWS architecture diagrams",
            flowcharts: "Flowcharts and sequence diagrams",
        },
    },
    zh: {
        title: "示例图库：每张图和它的提示词",
        description:
            "在 Next AI Draw.io 里由 AI 根据一句提示词画出的图：AWS、Azure、Google Cloud 和 Kubernetes 架构图，ER 图、UML 和时序图，BPMN、泳道图、甘特图、思维导图等。可以复制提示词，或直接在编辑器里试试。",
        keywords: [
            "draw.io 示例",
            "AI 画图示例",
            "画图提示词",
            "AWS 架构图示例",
            "ER 图示例",
            "时序图示例",
            "BPMN 示例",
        ],
        h1: "示例图库：每张图和它的提示词",
        lede: "这里的每张图都是根据一句提示词画出来的。点开一张可以放大查看；也可以复制它的提示词，或者打开编辑器，提示词会预先填好在聊天输入框里，您可以修改后再发送。",
        note: "每张图都是 Claude Code 通过 MCP 服务器画的，用的模型写在卡片上。按照服务器的要求，Claude Code 看了每张图画出来的截图，并修正了重叠的地方。同一句提示词每次画出来的图都会有些不同，换用其他模型，画法也会不一样。",
        tipsHeading: "自己写提示词",
        tips: [
            {
                title: "列出图里有哪些部分",
                text: "“customers, addresses, orders, order items, products, categories and payments”",
            },
            {
                title: "说明各部分怎样连接",
                text: "“the manager approves or rejects it, finance checks the receipts and pays”",
            },
            {
                title: "说出图的类型",
                text: "ER 图、时序图、BPMN、泳道图、甘特图、用户旅程地图。",
            },
            {
                title: "需要图标时点名",
                text: "需要时写明 AWS、Azure、GCP、Kubernetes 或 Cisco 图标。",
            },
        ],
        more: "怎样写请求，文档里还有：",
        moreLinks: {
            editor: "绘制和编辑",
            aws: "AWS 架构图",
            flowcharts: "流程图和时序图",
        },
    },
    ja: {
        title: "ギャラリー：サンプル図とそのプロンプト",
        description:
            "Next AI Draw.io で AI が 1 つのプロンプトから描いた図：AWS、Azure、Google Cloud、Kubernetes の構成図、ER 図、UML、シーケンス図、BPMN、スイムレーン、ガントチャート、マインドマップなど。プロンプトをコピーしたり、エディタで試したりできます。",
        keywords: [
            "draw.io サンプル",
            "AI 作図 サンプル",
            "作図 プロンプト",
            "AWS 構成図 サンプル",
            "ER 図 サンプル",
            "シーケンス図 サンプル",
            "BPMN サンプル",
        ],
        h1: "サンプル図とそのプロンプト",
        lede: "ここにある図は、どれも 1 つのプロンプトから描かれました。図を開いて拡大したり、プロンプトをコピーしたりできます。エディタを開くと、そのプロンプトがチャットの入力欄に入った状態になるので、手を加えてから送信できます。",
        note: "どの図も Claude Code が MCP サーバーを通して描きました。使ったモデルはカードに書いてあります。サーバーの指示に従って、Claude Code は描いた結果のスクリーンショットを確認し、重なりを直しています。同じプロンプトでも描くたびに少しずつ違う図になり、ほかのモデルでは描き方も変わります。",
        tipsHeading: "自分でプロンプトを書く",
        tips: [
            {
                title: "図に入れる要素を挙げる",
                text: "「customers, addresses, orders, order items, products, categories and payments」",
            },
            {
                title: "要素どうしのつながりを書く",
                text: "「the manager approves or rejects it, finance checks the receipts and pays」",
            },
            {
                title: "図の種類を書く",
                text: "ER 図、シーケンス図、BPMN、スイムレーン、ガントチャート、カスタマージャーニーマップ。",
            },
            {
                title: "アイコンは名前で指定する",
                text: "必要なら AWS、Azure、GCP、Kubernetes、Cisco のアイコンを指定します。",
            },
        ],
        more: "依頼の書き方はドキュメントにもあります：",
        moreLinks: {
            editor: "描画と編集",
            aws: "AWS 構成図",
            flowcharts: "フローチャートとシーケンス図",
        },
    },
    "zh-Hant": {
        title: "範例圖庫：每張圖和它的提示詞",
        description:
            "在 Next AI Draw.io 裡由 AI 根據一句提示詞畫出的圖：AWS、Azure、Google Cloud 和 Kubernetes 架構圖，ER 圖、UML 和時序圖，BPMN、泳道圖、甘特圖、心智圖等。可以複製提示詞，或直接在編輯器裡試試。",
        keywords: [
            "draw.io 範例",
            "AI 畫圖範例",
            "畫圖提示詞",
            "AWS 架構圖範例",
            "ER 圖範例",
            "時序圖範例",
            "BPMN 範例",
        ],
        h1: "範例圖庫：每張圖和它的提示詞",
        lede: "這裡的每張圖都是根據一句提示詞畫出來的。點開一張可以放大查看；也可以複製它的提示詞，或者開啟編輯器，提示詞會預先填好在聊天輸入框裡，您可以修改後再送出。",
        note: "每張圖都是 Claude Code 透過 MCP 伺服器畫的，用的模型寫在卡片上。依照伺服器的要求，Claude Code 看了每張圖畫出來的截圖，並修正了重疊的地方。同一句提示詞每次畫出來的圖都會有些不同，換用其他模型，畫法也會不一樣。",
        tipsHeading: "自己寫提示詞",
        tips: [
            {
                title: "列出圖裡有哪些部分",
                text: "「customers, addresses, orders, order items, products, categories and payments」",
            },
            {
                title: "說明各部分怎樣連接",
                text: "「the manager approves or rejects it, finance checks the receipts and pays」",
            },
            {
                title: "說出圖的類型",
                text: "ER 圖、時序圖、BPMN、泳道圖、甘特圖、使用者旅程地圖。",
            },
            {
                title: "需要圖示時點名",
                text: "需要時寫明 AWS、Azure、GCP、Kubernetes 或 Cisco 圖示。",
            },
        ],
        more: "怎樣寫請求，文件裡還有：",
        moreLinks: {
            editor: "繪製和編輯",
            aws: "AWS 架構圖",
            flowcharts: "流程圖和時序圖",
        },
    },
}
