import type { Locale } from "@/lib/i18n/config"
import { getDictionary } from "@/lib/i18n/dictionaries"
import { formatMessage } from "@/lib/i18n/utils"
import { describeChangeSummary, describeTotals } from "@/lib/version-text"
import type { DemoTexts } from "./demo-player"

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
        steps: [
            { title: "生成", text: "伝えた内容を AI が図にします" },
            { title: "手で編集", text: "draw.io と同じように図形を移動" },
            {
                title: "AI に修正を頼む",
                text: "図形を選んで変更を頼みます",
            },
            {
                title: "バージョン履歴",
                text: "以前のバージョンにいつでも戻せます",
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

// The scenes the docs can show, by the name used in their Markdown; here, since a
// client module would give the server only a reference to it
export const DEMO_SCENES: Record<string, number> = {
    generate: 0,
    "hand-edit": 1,
    "ai-edit": 2,
    versions: 3,
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
