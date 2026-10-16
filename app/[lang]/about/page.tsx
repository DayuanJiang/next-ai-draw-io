import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { GitHubIcon } from "@/components/icons/github"
import Image from "@/components/image-with-basepath"
import type { Locale } from "@/lib/i18n/config"
import { hasLocale } from "@/lib/i18n/dictionaries"
import { localeAlternates, OG_IMAGE, OG_LOCALE } from "@/lib/seo"

type ExampleId = "resnet50" | "rag" | "auth" | "scrum" | "inno"

type AboutTexts = {
    title: string
    description: string
    keywords: string[]
    nav: { editor: string; about: string; github: string }
    tagline: string
    byok: { title: string; body: string; note: string }
    intro: string
    // Punctuation differs between Latin and CJK text
    colon: string
    parenOpen: string
    parenClose: string
    featuresHeading: string
    features: { title: string; text: string }[]
    examplesHeading: string
    examplesIntro: string
    examples: Record<ExampleId, { title: string; alt: string }>
    howHeading: string
    howIntro: string
    tech: { nextjs: string; aiSdk: string; drawio: string }
    howOutro: string
    providersHeading: string
    doubao: string
    bedrock: string
    // Text around the OPENAI_BASE_URL code span
    openai: { before: string; after: string }
    // Text around the claude-sonnet-4-5 code span
    modelNote: { before: string; after: string }
    supportHeading: string
    // Text around the sponsor link
    sponsor: { before: string; link: string; after: string }
    // Text around the GitHub repository link
    contact: { before: string; link: string; after: string }
    openEditor: string
    footer: string
}

const texts: Record<"en" | "zh" | "ja", AboutTexts> = {
    en: {
        title: "About - Next AI Draw.io",
        description:
            "AI-Powered Diagram Creation Tool - Chat, Draw, Visualize. Create AWS, GCP, and Azure architecture diagrams with natural language.",
        keywords: [
            "AI diagram",
            "draw.io",
            "AWS architecture",
            "GCP diagram",
            "Azure diagram",
            "LLM",
        ],
        nav: { editor: "Editor", about: "About", github: "View on GitHub" },
        tagline: "AI-Powered Diagram Creation Tool - Chat, Draw, Visualize",
        byok: {
            title: "Bring Your Own API Key",
            body: "You can also use your own API key with any supported provider. Click the Settings icon in the chat panel to configure your provider and API key.",
            note: "Your key is stored locally in your browser and is never stored on the server.",
        },
        intro: "A Next.js web application that integrates AI capabilities with draw.io diagrams. Create, modify, and enhance diagrams through natural language commands and AI-assisted visualization.",
        colon: ": ",
        parenOpen: " (",
        parenClose: ")",
        featuresHeading: "Features",
        features: [
            {
                title: "LLM-Powered Diagram Creation",
                text: "Leverage Large Language Models to create and manipulate draw.io diagrams directly through natural language commands",
            },
            {
                title: "Image-Based Diagram Replication",
                text: "Upload existing diagrams or images and have the AI replicate and enhance them automatically",
            },
            {
                title: "Versions and Undo",
                text: "Every AI change becomes a version in the chat that you can compare, restore or undo; Ctrl+Z on the canvas takes it back too",
            },
            {
                title: "Interactive Chat Interface",
                text: "Communicate with AI to refine your diagrams in real-time",
            },
            {
                title: "AWS Architecture Diagram Support",
                text: "Specialized support for generating AWS architecture diagrams",
            },
            {
                title: "Animated Connectors",
                text: "Create dynamic and animated connectors between diagram elements for better visualization",
            },
        ],
        examplesHeading: "Examples",
        examplesIntro:
            "Here are some example prompts and their generated diagrams:",
        examples: {
            resnet50: {
                title: "Animated ResNet50 Model Architecture",
                alt: "Architecture diagram for ResNet50 model",
            },
            rag: {
                title: "RAG Technique Diagram",
                alt: "RAG Architecture Diagram",
            },
            auth: {
                title: "Authentication using React and AWS",
                alt: "Authentication Architecture Diagram",
            },
            scrum: { title: "Agile Scrum Process", alt: "Agile Scrum Diagram" },
            inno: { title: "Open Innovation", alt: "Open Innovation Diagram" },
        },
        howHeading: "How It Works",
        howIntro: "The application uses the following technologies:",
        tech: {
            nextjs: "For the frontend framework and routing",
            aiSdk: "For streaming AI responses and multi-provider support",
            drawio: "The editor, bundled with the app so it can be driven directly",
        },
        howOutro:
            "Diagrams are represented as XML that can be rendered in draw.io. The AI processes your commands and generates or modifies this XML accordingly.",
        providersHeading: "Multi-Provider Support",
        doubao: "ByteDance Doubao",
        bedrock: "AWS Bedrock (default)",
        openai: { before: "OpenAI / OpenAI-compatible APIs (via ", after: ")" },
        modelNote: {
            before: "Note that ",
            after: " has trained on draw.io diagrams with AWS logos, so if you want to create AWS architecture diagrams, this is the best choice.",
        },
        supportHeading: "Support & Contact",
        sponsor: {
            before: "If you find this project useful, please consider",
            link: "sponsoring",
            after: "to help host the live demo site!",
        },
        contact: {
            before: "For support or inquiries, please open an issue on the",
            link: "GitHub repository",
            after: "or contact: me[at]jiang.jp",
        },
        openEditor: "Open Editor",
        footer: "Next AI Draw.io - Open Source AI-Powered Diagram Generator",
    },
    zh: {
        title: "关于 - Next AI Draw.io",
        description:
            "AI驱动的图表创建工具 - 对话、绘制、可视化。使用自然语言创建AWS、GCP和Azure架构图。",
        keywords: [
            "AI图表",
            "draw.io",
            "AWS架构",
            "GCP图表",
            "Azure图表",
            "LLM",
        ],
        nav: { editor: "编辑器", about: "关于", github: "在GitHub上查看" },
        tagline: "AI驱动的图表创建工具 - 对话、绘制、可视化",
        byok: {
            title: "使用自己的 API Key",
            body: "您也可以使用自己的 API Key，支持多种服务商。点击聊天面板中的设置图标即可配置。",
            note: "您的 Key 仅保存在浏览器本地，不会被存储在服务器上。",
        },
        intro: "一个集成了AI功能的Next.js网页应用，与draw.io图表无缝结合。通过自然语言命令和AI辅助可视化来创建、修改和增强图表。",
        colon: "：",
        parenOpen: "（",
        parenClose: "）",
        featuresHeading: "功能特性",
        features: [
            {
                title: "LLM驱动的图表创建",
                text: "利用大语言模型通过自然语言命令直接创建和操作draw.io图表",
            },
            {
                title: "基于图像的图表复制",
                text: "上传现有图表或图像，让AI自动复制和增强",
            },
            {
                title: "版本与撤销",
                text: "AI 的每次修改都会成为聊天里的一个版本，可以对比、恢复或撤销；在画布上按 Ctrl+Z 也能撤回",
            },
            {
                title: "交互式聊天界面",
                text: "与AI实时对话来完善您的图表",
            },
            { title: "AWS架构图支持", text: "专门支持生成AWS架构图" },
            {
                title: "动画连接器",
                text: "在图表元素之间创建动态动画连接器，实现更好的可视化效果",
            },
        ],
        examplesHeading: "示例",
        examplesIntro: "以下是一些示例提示词及其生成的图表：",
        examples: {
            resnet50: {
                title: "ResNet50模型架构动画",
                alt: "ResNet50模型架构图",
            },
            rag: { title: "RAG技术图", alt: "RAG架构图" },
            auth: { title: "React和AWS认证流程", alt: "认证架构图" },
            scrum: { title: "敏捷Scrum流程", alt: "敏捷Scrum流程图" },
            inno: { title: "开放式创新", alt: "开放式创新图" },
        },
        howHeading: "工作原理",
        howIntro: "本应用使用以下技术：",
        tech: {
            nextjs: "用于前端框架和路由",
            aiSdk: "用于流式AI响应和多提供商支持",
            drawio: "内置在应用里的编辑器，应用可以直接控制它",
        },
        howOutro:
            "图表以XML格式表示，可在draw.io中渲染。AI处理您的命令并相应地生成或修改此XML。",
        providersHeading: "多提供商支持",
        doubao: "字节跳动豆包",
        bedrock: "AWS Bedrock（默认）",
        openai: { before: "OpenAI / OpenAI兼容API（通过 ", after: "）" },
        modelNote: {
            before: "注意：",
            after: " 已在带有AWS标志的draw.io图表上进行训练，因此如果您想创建AWS架构图，这是最佳选择。",
        },
        supportHeading: "支持与联系",
        sponsor: {
            before: "如果您觉得这个项目有用，请考虑",
            link: "赞助",
            after: "来帮助托管在线演示站点！",
        },
        contact: {
            before: "如需支持或咨询，请在",
            link: "GitHub仓库",
            after: "上提交issue或联系：me[at]jiang.jp",
        },
        openEditor: "打开编辑器",
        footer: "Next AI Draw.io - 开源AI驱动的图表生成器",
    },
    ja: {
        title: "概要 - Next AI Draw.io",
        description:
            "AI搭載のダイアグラム作成ツール - チャット、描画、可視化。自然言語でAWS、GCP、Azureアーキテクチャ図を作成。",
        keywords: [
            "AIダイアグラム",
            "draw.io",
            "AWSアーキテクチャ",
            "GCPダイアグラム",
            "Azureダイアグラム",
            "LLM",
        ],
        nav: { editor: "エディタ", about: "概要", github: "GitHubで見る" },
        tagline: "AI搭載のダイアグラム作成ツール - チャット、描画、可視化",
        byok: {
            title: "自分のAPIキーを使用",
            body: "お好みのプロバイダーで自分のAPIキーを使用することもできます。チャットパネルの設定アイコンをクリックして設定してください。",
            note: "キーはブラウザのローカルに保存され、サーバーには保存されません。",
        },
        intro: "AI機能とdraw.ioダイアグラムを統合したNext.jsウェブアプリケーションです。自然言語コマンドとAI支援の可視化により、ダイアグラムを作成、修正、強化できます。",
        colon: "：",
        parenOpen: "（",
        parenClose: "）",
        featuresHeading: "機能",
        features: [
            {
                title: "LLM搭載のダイアグラム作成",
                text: "大規模言語モデルを活用して、自然言語コマンドで直接draw.ioダイアグラムを作成・操作",
            },
            {
                title: "画像ベースのダイアグラム複製",
                text: "既存のダイアグラムや画像をアップロードし、AIが自動的に複製・強化",
            },
            {
                title: "バージョンと取り消し",
                text: "AI の変更はそれぞれチャット内のバージョンになり、比較・復元・取り消しができます。キャンバスで Ctrl+Z を押しても元に戻せます",
            },
            {
                title: "インタラクティブなチャットインターフェース",
                text: "AIとリアルタイムでコミュニケーションしてダイアグラムを改善",
            },
            {
                title: "AWSアーキテクチャダイアグラムサポート",
                text: "AWSアーキテクチャダイアグラムの生成を専門的にサポート",
            },
            {
                title: "アニメーションコネクタ",
                text: "より良い可視化のためにダイアグラム要素間に動的でアニメーション化されたコネクタを作成",
            },
        ],
        examplesHeading: "例",
        examplesIntro:
            "以下はいくつかのプロンプト例と生成されたダイアグラムです：",
        examples: {
            resnet50: {
                title: "ResNet50モデルアーキテクチャアニメーション",
                alt: "ResNet50モデルアーキテクチャ図",
            },
            rag: { title: "RAG技術ダイアグラム", alt: "RAGアーキテクチャ図" },
            auth: {
                title: "ReactとAWSによる認証",
                alt: "認証アーキテクチャ図",
            },
            scrum: {
                title: "アジャイルスクラムプロセス",
                alt: "アジャイルスクラム図",
            },
            inno: {
                title: "オープンイノベーション",
                alt: "オープンイノベーション図",
            },
        },
        howHeading: "仕組み",
        howIntro: "本アプリケーションは以下の技術を使用しています：",
        tech: {
            nextjs: "フロントエンドフレームワークとルーティング",
            aiSdk: "ストリーミングAIレスポンスとマルチプロバイダーサポート",
            drawio: "アプリに同梱されたエディター。アプリから直接操作できます",
        },
        howOutro:
            "ダイアグラムはdraw.ioでレンダリングできるXMLとして表現されます。AIがコマンドを処理し、それに応じてこのXMLを生成または変更します。",
        providersHeading: "マルチプロバイダーサポート",
        doubao: "ByteDance Doubao",
        bedrock: "AWS Bedrock（デフォルト）",
        openai: { before: "OpenAI / OpenAI互換API（", after: "経由）" },
        modelNote: {
            before: "注：",
            after: "はAWSロゴ付きのdraw.ioダイアグラムで学習されているため、AWSアーキテクチャダイアグラムを作成したい場合は最適な選択です。",
        },
        supportHeading: "サポート＆お問い合わせ",
        sponsor: {
            before: "このプロジェクトが役に立ったら、ライブデモサイトのホスティングを支援するために",
            link: "スポンサー",
            after: "をご検討ください！",
        },
        contact: {
            before: "サポートやお問い合わせについては、",
            link: "GitHubリポジトリ",
            after: "でissueを開くか、ご連絡ください：me[at]jiang.jp",
        },
        openEditor: "エディタを開く",
        footer: "Next AI Draw.io - オープンソースAI搭載ダイアグラムジェネレーター",
    },
}

// The example prompts stay in English in every language
const examples: { id: ExampleId; src: string; prompt: ReactNode }[] = [
    {
        id: "resnet50",
        src: "/resnet50.svg",
        prompt: (
            <>
                Give me an <strong>animated</strong> architecture diagram of the
                ResNet50 model.
            </>
        ),
    },
    {
        id: "rag",
        src: "/rag_prod.svg",
        prompt: (
            <>
                Generate a RAG architecture diagram for{" "}
                <strong>chat application</strong>. Use connected diagram for
                data ingestion
            </>
        ),
    },
    {
        id: "auth",
        src: "/auth.svg",
        prompt: (
            <>
                Generate authentication process using React with{" "}
                <strong>AWS</strong>. Use Serverless architecture.
            </>
        ),
    },
    {
        id: "scrum",
        src: "/agile_scrum.svg",
        prompt: (
            <>
                Generate agile scrum workflow diagram for software development
                team.
            </>
        ),
    },
    {
        id: "inno",
        src: "/inno.svg",
        prompt: (
            <>
                Create visualization of Henry Chesbrough&apos;s Open Innovation
                model.
            </>
        ),
    },
]

// Traditional Chinese has no About text of its own and shows the Simplified one
function textsFor(rawLang: string): AboutTexts {
    const lang: Locale = hasLocale(rawLang) ? rawLang : "en"
    return texts[lang === "zh-Hant" ? "zh" : lang]
}

type Props = { params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params
    const locale: Locale = hasLocale(lang) ? lang : "en"
    const t = textsFor(lang)
    // openGraph and twitter replace the layout's whole objects, so the
    // shared fields are repeated here
    return {
        title: t.title,
        description: t.description,
        keywords: t.keywords,
        alternates: localeAlternates(locale, "/about"),
        openGraph: {
            title: t.title,
            description: t.description,
            type: "website",
            url: `/${locale}/about`,
            siteName: "Next AI Draw.io",
            locale: OG_LOCALE[locale],
            images: [{ ...OG_IMAGE, alt: t.title }],
        },
        twitter: {
            card: "summary_large_image",
            title: t.title,
            description: t.description,
            images: [OG_IMAGE.url],
        },
    }
}

export default async function About({ params }: Props) {
    const { lang } = await params
    const t = textsFor(lang)
    const [hero, ...grid] = examples

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Navigation */}
            <header className="bg-white border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <Link
                            href={`/${lang}`}
                            className="text-xl font-bold text-gray-900 hover:text-gray-700"
                        >
                            Next AI Draw.io
                        </Link>
                        <nav className="flex items-center gap-6 text-sm">
                            <Link
                                href={`/${lang}`}
                                className="text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                {t.nav.editor}
                            </Link>
                            <Link
                                href={`/${lang}/about`}
                                className="text-blue-600 font-semibold"
                            >
                                {t.nav.about}
                            </Link>
                            <a
                                href="https://github.com/DayuanJiang/next-ai-draw-io"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-600 hover:text-gray-900 transition-colors"
                                aria-label={t.nav.github}
                            >
                                <GitHubIcon className="w-5 h-5" />
                            </a>
                        </nav>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <article className="prose prose-lg max-w-none">
                    {/* Title */}
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-gray-900 mb-2">
                            Next AI Draw.io
                        </h1>
                        <p className="text-xl text-gray-600 font-medium">
                            {t.tagline}
                        </p>
                    </div>

                    <div className="relative mb-8 rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-[1px] shadow-lg">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-yellow-400 opacity-20" />
                        <div className="relative rounded-2xl bg-white/80 backdrop-blur-sm p-6">
                            {/* Bring Your Own Key */}
                            <div className="text-center">
                                <h4 className="text-base font-bold text-gray-900 mb-2">
                                    {t.byok.title}
                                </h4>
                                <p className="text-sm text-gray-600 mb-2 max-w-md mx-auto">
                                    {t.byok.body}
                                </p>
                                <p className="text-xs text-gray-500 max-w-md mx-auto">
                                    {t.byok.note}
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="text-gray-700">{t.intro}</p>

                    {/* Features */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        {t.featuresHeading}
                    </h2>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2">
                        {t.features.map((feature) => (
                            <li key={feature.title}>
                                <strong>{feature.title}</strong>
                                {t.colon}
                                {feature.text}
                            </li>
                        ))}
                    </ul>

                    {/* Examples */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        {t.examplesHeading}
                    </h2>
                    <p className="text-gray-700 mb-6">{t.examplesIntro}</p>

                    <div className="space-y-8">
                        {/* First example on its own */}
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                {t.examples[hero.id].title}
                            </h3>
                            <p className="text-gray-600 mb-4">
                                <strong>Prompt:</strong> {hero.prompt}
                            </p>
                            <div className="bg-neutral-950 rounded-lg p-4 inline-block">
                                <Image
                                    src={hero.src}
                                    alt={t.examples[hero.id].alt}
                                    width={480}
                                    height={360}
                                    className="mx-auto"
                                />
                            </div>
                        </div>

                        {/* Diagram Grid */}
                        <div className="grid md:grid-cols-2 gap-6">
                            {grid.map((example) => (
                                <div key={example.id} className="text-center">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                        {t.examples[example.id].title}
                                    </h3>
                                    <p className="text-gray-600 text-sm mb-4">
                                        <strong>Prompt:</strong>{" "}
                                        {example.prompt}
                                    </p>
                                    <div className="bg-neutral-950 rounded-lg p-4 flex items-center justify-center w-full h-[400px]">
                                        <Image
                                            src={example.src}
                                            alt={t.examples[example.id].alt}
                                            width={480}
                                            height={360}
                                            className="max-w-full max-h-full object-contain"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* How It Works */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        {t.howHeading}
                    </h2>
                    <p className="text-gray-700 mb-4">{t.howIntro}</p>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2">
                        <li>
                            <strong>Next.js</strong>
                            {t.colon}
                            {t.tech.nextjs}
                        </li>
                        <li>
                            <strong>Vercel AI SDK</strong>
                            {t.parenOpen}
                            <code>ai</code> + <code>@ai-sdk/*</code>
                            {t.parenClose}
                            {t.colon}
                            {t.tech.aiSdk}
                        </li>
                        <li>
                            <strong>draw.io</strong>
                            {t.colon}
                            {t.tech.drawio}
                        </li>
                    </ul>
                    <p className="text-gray-700 mt-4">{t.howOutro}</p>

                    {/* Multi-Provider Support */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        {t.providersHeading}
                    </h2>
                    <ul className="list-disc pl-6 text-gray-700 space-y-1">
                        <li>{t.doubao}</li>
                        <li>{t.bedrock}</li>
                        <li>
                            {t.openai.before}
                            <code>OPENAI_BASE_URL</code>
                            {t.openai.after}
                        </li>
                        <li>Anthropic</li>
                        <li>Google AI</li>
                        <li>Google Vertex AI</li>
                        <li>Azure OpenAI</li>
                        <li>Ollama</li>
                        <li>OpenRouter</li>
                        <li>DeepSeek</li>
                        <li>SiliconFlow</li>
                        <li>ModelScope</li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                        {t.modelNote.before}
                        <code>claude-sonnet-4-5</code>
                        {t.modelNote.after}
                    </p>

                    {/* Support */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        {t.supportHeading}
                    </h2>
                    <p className="text-gray-700">
                        {t.sponsor.before}{" "}
                        <a
                            href="https://github.com/sponsors/DayuanJiang"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            {t.sponsor.link}
                        </a>{" "}
                        {t.sponsor.after}
                    </p>
                    <p className="text-gray-700 mt-2">
                        {t.contact.before}{" "}
                        <a
                            href="https://github.com/DayuanJiang/next-ai-draw-io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            {t.contact.link}
                        </a>{" "}
                        {t.contact.after}
                    </p>

                    {/* CTA */}
                    <div className="mt-12 text-center">
                        <Link
                            href={`/${lang}`}
                            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            {t.openEditor}
                        </Link>
                    </div>
                </article>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-16">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <p className="text-center text-gray-600 text-sm">
                        {t.footer}
                    </p>
                </div>
            </footer>
        </div>
    )
}
