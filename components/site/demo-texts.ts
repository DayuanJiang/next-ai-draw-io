import type { Locale } from "@/lib/i18n/config"
import { getDictionary } from "@/lib/i18n/dictionaries"
import { formatMessage } from "@/lib/i18n/utils"
import { describeChangeSummary, describeTotals } from "@/lib/version-text"
import type { DemoTexts } from "./demo-player"
import type { McpDemoTexts } from "./mcp-demo"

// The demo's own texts: its steps, the conversation and the replay button
const TEXTS: Record<
    Locale,
    Pick<DemoTexts, "replay" | "steps" | "prompts" | "replies">
> = {
    en: {
        replay: "Replay",
        steps: [
            { title: "Generate", text: "The AI draws what you describe" },
            { title: "Edit by hand", text: "Drag shapes as in draw.io" },
            {
                title: "Edit with AI",
                text: "Select a shape, ask for a change",
            },
            {
                title: "Version history",
                text: "Go back to any earlier version",
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
    zh: {
        replay: "重播",
        steps: [
            { title: "生成", text: "AI 按您的描述画图" },
            { title: "手动编辑", text: "像在 draw.io 里一样拖动图形" },
            { title: "让 AI 修改", text: "选中图形，告诉 AI 怎么改" },
            { title: "版本历史", text: "随时恢复到之前的版本" },
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
    ja: {
        replay: "もう一度再生",
        // A phone's narrow step tab breaks a title only where it has a
        // space or a zero-width space
        steps: [
            { title: "生成", text: "伝えた内容を AI が図にします" },
            { title: "手で編集", text: "draw.io と同じように図形を移動" },
            {
                title: "AI に\u200b修正を\u200b頼む",
                text: "図形を選んで変更を頼みます",
            },
            {
                title: "バージョン\u200b履歴",
                text: "以前のバージョンに戻せます",
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
    "zh-Hant": {
        replay: "重播",
        steps: [
            { title: "產生", text: "AI 依照您的描述畫圖" },
            { title: "手動編輯", text: "像在 draw.io 裡一樣拖曳圖形" },
            { title: "讓 AI 修改", text: "選取圖形，告訴 AI 怎麼改" },
            { title: "版本紀錄", text: "隨時還原到之前的版本" },
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
}

const EMPTY = {
    shapesAdded: 0,
    edgesAdded: 0,
    shapesChanged: 0,
    edgesChanged: 0,
    shapesRemoved: 0,
    edgesRemoved: 0,
}

/** The demo's texts in a language; its version cards and chat use the editor's own */
export async function demoTexts(lang: Locale): Promise<DemoTexts> {
    const dict = await getDictionary(lang)
    const v = dict.versions
    return {
        ...TEXTS[lang],
        drawing: v.drawing,
        changing: v.editing,
        placeholder: dict.chat.placeholder,
        selected: formatMessage(dict.selection.one, { label: "DynamoDB" }),
        versions: {
            created: v.created,
            edited: v.edited,
            undo: v.undo,
            restoreV1: formatMessage(v.restoreVersion, { n: 1 }),
            restoreV2: formatMessage(v.restoreVersion, { n: 2 }),
            editedSince: v.editedSince,
            drawSummary: describeTotals(
                { ...EMPTY, shapesAdded: 7, edgesAdded: 5 },
                v,
            ),
            cacheSummary: describeChangeSummary(
                { ...EMPTY, shapesAdded: 1, edgesAdded: 1 },
                v,
            ),
        },
    }
}

// The flowchart demo's request and answer
const FLOWCHART_TEXTS: Record<Locale, { prompt: string; reply: string }> = {
    en: {
        prompt: "Draw a flowchart for a refund request: reject orders older than 30 days, otherwise refund and email the customer",
        reply: "A refund flow from left to right: support checks the order, a decision on its age, then a rejection, or a refund and an email to the customer.",
    },
    zh: {
        prompt: "画一个退款申请的流程图：超过 30 天的订单拒绝，否则退款并给客户发邮件",
        reply: "一个从左到右的退款流程：客服核对订单，按订单时间判断，然后拒绝申请，或者退款并给客户发邮件。",
    },
    ja: {
        prompt: "返金申請のフローチャートを描いて。30 日を過ぎた注文は却下し、それ以外は返金してお客様にメールする",
        reply: "左から右への返金フローです。サポートが注文を確認し、注文日で分岐して、却下するか、返金してお客様にメールします。",
    },
    "zh-Hant": {
        prompt: "畫一個退款申請的流程圖：超過 30 天的訂單拒絕，否則退款並寄電子郵件給客戶",
        reply: "一個從左到右的退款流程：客服核對訂單，依訂單時間判斷，然後拒絕申請，或者退款並寄電子郵件給客戶。",
    },
}

// The MCP demo's request and the agent's words; tool names stay in English
const MCP_TEXTS: Record<Locale, Omit<McpDemoTexts, "replay">> = {
    en: {
        prompt: "Read this repo and draw its architecture",
        intro: "I'll read the project first, then draw it.",
        done: "The architecture is in the preview: API Gateway calls Lambda, Cognito handles sign-in, DynamoDB holds the data and S3 the files.",
    },
    zh: {
        prompt: "读一下这个仓库，画出它的架构",
        intro: "我先读一下项目，然后画出来。",
        done: "架构图已经在预览里了：API Gateway 调用 Lambda，Cognito 负责登录，DynamoDB 存数据，S3 存文件。",
    },
    ja: {
        prompt: "このリポジトリを読んでアーキテクチャを図にして",
        intro: "まずプロジェクトを読んでから描きます。",
        done: "アーキテクチャ図をプレビューに描きました。API Gateway が Lambda を呼び出し、Cognito がサインイン、DynamoDB がデータ、S3 がファイルを担当します。",
    },
    "zh-Hant": {
        prompt: "讀一下這個儲存庫，畫出它的架構",
        intro: "我先讀一下專案，然後畫出來。",
        done: "架構圖已經在預覽裡了：API Gateway 呼叫 Lambda，Cognito 負責登入，DynamoDB 存資料，S3 存檔案。",
    },
}

/** Every demo the docs can show, in a language */
export async function docsDemos(lang: Locale) {
    const editor = await demoTexts(lang)
    const v = (await getDictionary(lang)).versions
    const flow = FLOWCHART_TEXTS[lang]
    return {
        editor,
        flowchart: {
            ...editor,
            prompts: { ...editor.prompts, draw: flow.prompt },
            replies: { ...editor.replies, draw: flow.reply },
            versions: {
                ...editor.versions,
                drawSummary: describeTotals(
                    { ...EMPTY, shapesAdded: 8, edgesAdded: 8 },
                    v,
                ),
            },
        } satisfies DemoTexts,
        mcp: { ...MCP_TEXTS[lang], replay: editor.replay },
    }
}

export type DocsDemos = Awaited<ReturnType<typeof docsDemos>>
