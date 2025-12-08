import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { FaGithub } from "react-icons/fa"

export const metadata: Metadata = {
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
}

export default function AboutJA() {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Navigation */}
            <header className="bg-white border-b border-gray-200">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <Link
                            href="/"
                            className="text-xl font-bold text-gray-900 hover:text-gray-700"
                        >
                            Next AI Draw.io
                        </Link>
                        <nav className="flex items-center gap-6 text-sm">
                            <Link
                                href="/"
                                className="text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                エディタ
                            </Link>
                            <Link
                                href="/about/ja"
                                className="text-blue-600 font-semibold"
                            >
                                概要
                            </Link>
                            <a
                                href="https://github.com/DayuanJiang/next-ai-draw-io"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-600 hover:text-gray-900 transition-colors"
                                aria-label="GitHubで見る"
                            >
                                <FaGithub className="w-5 h-5" />
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
                            AI搭載のダイアグラム作成ツール -
                            チャット、描画、可視化
                        </p>
                        <div className="flex justify-center gap-4 mt-4 text-sm">
                            <Link
                                href="/about"
                                className="text-gray-600 hover:text-blue-600"
                            >
                                English
                            </Link>
                            <span className="text-gray-400">|</span>
                            <Link
                                href="/about/cn"
                                className="text-gray-600 hover:text-blue-600"
                            >
                                中文
                            </Link>
                            <span className="text-gray-400">|</span>
                            <Link
                                href="/about/ja"
                                className="text-blue-600 font-semibold"
                            >
                                日本語
                            </Link>
                        </div>
                    </div>

                    <div className="relative mb-8 rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-[1px] shadow-lg">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 opacity-20" />
                        <div className="relative rounded-2xl bg-white/80 backdrop-blur-sm p-6">
                            {/* Header */}
                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                                    利用制限とスケーリングについて{" "}
                                    <span className="text-sm text-amber-600 font-medium italic font-normal">
                                        （別名：お財布が悲鳴を上げています）
                                    </span>
                                </h3>
                            </div>

                            {/* Story */}
                            <div className="space-y-3 text-sm text-gray-700 leading-relaxed mb-5">
                                <p>
                                    予想以上の反響をいただき、ありがとうございます！皆様にダイアグラム作成を楽しんでいただいているのは嬉しい限りですが、その熱量により
                                    AI API のレート制限 (TPS/TPM)
                                    に頻繁に引っかかってしまっています。制限に達するとシステムが一時停止し、エラーが発生してしまいます。
                                </p>
                                <p>
                                    私は現在、
                                    <span className="font-semibold text-amber-700">
                                        個人開発者
                                    </span>
                                    として API
                                    費用を全額自腹で負担しています。サービスを継続し、かつ私自身が借金を背負わないようにするため（笑）、一時的に以下の利用制限を設けさせていただきました。
                                </p>
                            </div>

                            {/* Limits Cards */}
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <div className="rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 p-4 text-center">
                                    <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                                        トークン使用量
                                    </div>
                                    <div className="text-lg font-bold text-gray-900">
                                        5万
                                        <span className="text-sm font-normal text-gray-600">
                                            /分
                                        </span>
                                    </div>
                                    <div className="text-lg font-bold text-gray-900">
                                        50万
                                        <span className="text-sm font-normal text-gray-600">
                                            /日
                                        </span>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 p-4 text-center">
                                    <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                                        1日のリクエスト数
                                    </div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        20
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        回
                                    </div>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="flex items-center gap-3 my-5">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
                            </div>

                            {/* Sponsorship CTA */}
                            <div className="text-center">
                                <h4 className="text-base font-bold text-gray-900 mb-2">
                                    スポンサー募集
                                </h4>
                                <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                                    これらの制限を取り払い、バックエンドをスケールさせるには皆様の支援が必要です。現在、AI
                                    API
                                    プロバイダー様やクラウドプラットフォーム様からのスポンサー支援を積極的に募集しています。
                                </p>
                                <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                                    ご支援（クレジット提供や資金援助）をいただける場合、GitHub
                                    リポジトリおよびデモサイトにて、プラットフォームスポンサーとして貴社を大々的にご紹介させていただきます。
                                </p>
                                <a
                                    href="mailto:me@jiang.jp"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200"
                                >
                                    お問い合わせ
                                </a>
                            </div>
                        </div>
                    </div>

                    <p className="text-gray-700">
                        AI機能とdraw.ioダイアグラムを統合したNext.jsウェブアプリケーションです。自然言語コマンドとAI支援の可視化により、ダイアグラムを作成、修正、強化できます。
                    </p>

                    {/* Features */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        機能
                    </h2>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2">
                        <li>
                            <strong>LLM搭載のダイアグラム作成</strong>
                            ：大規模言語モデルを活用して、自然言語コマンドで直接draw.ioダイアグラムを作成・操作
                        </li>
                        <li>
                            <strong>画像ベースのダイアグラム複製</strong>
                            ：既存のダイアグラムや画像をアップロードし、AIが自動的に複製・強化
                        </li>
                        <li>
                            <strong>ダイアグラム履歴</strong>
                            ：すべての変更を追跡する包括的なバージョン管理。AI編集前のダイアグラムの以前のバージョンを表示・復元可能
                        </li>
                        <li>
                            <strong>
                                インタラクティブなチャットインターフェース
                            </strong>
                            ：AIとリアルタイムでコミュニケーションしてダイアグラムを改善
                        </li>
                        <li>
                            <strong>
                                AWSアーキテクチャダイアグラムサポート
                            </strong>
                            ：AWSアーキテクチャダイアグラムの生成を専門的にサポート
                        </li>
                        <li>
                            <strong>アニメーションコネクタ</strong>
                            ：より良い可視化のためにダイアグラム要素間に動的でアニメーション化されたコネクタを作成
                        </li>
                    </ul>

                    {/* Examples */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        例
                    </h2>
                    <p className="text-gray-700 mb-6">
                        以下はいくつかのプロンプト例と生成されたダイアグラムです：
                    </p>

                    <div className="space-y-8">
                        {/* Animated Transformer */}
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                アニメーションTransformerコネクタ
                            </h3>
                            <p className="text-gray-600 mb-4">
                                <strong>プロンプト：</strong>{" "}
                                <strong>アニメーションコネクタ</strong>
                                付きのTransformerアーキテクチャ図を作成してください。
                            </p>
                            <Image
                                src="/animated_connectors.svg"
                                alt="アニメーションコネクタ付きTransformerアーキテクチャ"
                                width={480}
                                height={360}
                                className="mx-auto"
                            />
                        </div>

                        {/* Cloud Architecture Grid */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    GCPアーキテクチャ図
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>プロンプト：</strong>{" "}
                                    <strong>GCPアイコン</strong>
                                    を使用してGCPアーキテクチャ図を生成してください。ユーザーがインスタンス上でホストされているフロントエンドに接続します。
                                </p>
                                <Image
                                    src="/gcp_demo.svg"
                                    alt="GCPアーキテクチャ図"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    AWSアーキテクチャ図
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>プロンプト：</strong>{" "}
                                    <strong>AWSアイコン</strong>
                                    を使用してAWSアーキテクチャ図を生成してください。ユーザーがインスタンス上でホストされているフロントエンドに接続します。
                                </p>
                                <Image
                                    src="/aws_demo.svg"
                                    alt="AWSアーキテクチャ図"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Azureアーキテクチャ図
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>プロンプト：</strong>{" "}
                                    <strong>Azureアイコン</strong>
                                    を使用してAzureアーキテクチャ図を生成してください。ユーザーがインスタンス上でホストされているフロントエンドに接続します。
                                </p>
                                <Image
                                    src="/azure_demo.svg"
                                    alt="Azureアーキテクチャ図"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    猫のスケッチ
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>プロンプト：</strong>{" "}
                                    かわいい猫を描いてください。
                                </p>
                                <Image
                                    src="/cat_demo.svg"
                                    alt="猫の絵"
                                    width={240}
                                    height={240}
                                    className="mx-auto"
                                />
                            </div>
                        </div>
                    </div>

                    {/* How It Works */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        仕組み
                    </h2>
                    <p className="text-gray-700 mb-4">
                        本アプリケーションは以下の技術を使用しています：
                    </p>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2">
                        <li>
                            <strong>Next.js</strong>
                            ：フロントエンドフレームワークとルーティング
                        </li>
                        <li>
                            <strong>Vercel AI SDK</strong>（<code>ai</code> +{" "}
                            <code>@ai-sdk/*</code>
                            ）：ストリーミングAIレスポンスとマルチプロバイダーサポート
                        </li>
                        <li>
                            <strong>react-drawio</strong>
                            ：ダイアグラムの表現と操作
                        </li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                        ダイアグラムはdraw.ioでレンダリングできるXMLとして表現されます。AIがコマンドを処理し、それに応じてこのXMLを生成または変更します。
                    </p>

                    {/* Multi-Provider Support */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        マルチプロバイダーサポート
                    </h2>
                    <ul className="list-disc pl-6 text-gray-700 space-y-1">
                        <li>AWS Bedrock（デフォルト）</li>
                        <li>
                            OpenAI / OpenAI互換API（<code>OPENAI_BASE_URL</code>
                            経由）
                        </li>
                        <li>Anthropic</li>
                        <li>Google AI</li>
                        <li>Azure OpenAI</li>
                        <li>Ollama</li>
                        <li>OpenRouter</li>
                        <li>DeepSeek</li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                        注：<code>claude-sonnet-4-5</code>
                        はAWSロゴ付きのdraw.ioダイアグラムで学習されているため、AWSアーキテクチャダイアグラムを作成したい場合は最適な選択です。
                    </p>

                    {/* Support */}
                    <div className="flex items-center gap-4 mt-10 mb-4">
                        <h2 className="text-2xl font-semibold text-gray-900">
                            サポート＆お問い合わせ
                        </h2>
                        <iframe
                            src="https://github.com/sponsors/DayuanJiang/button"
                            title="Sponsor DayuanJiang"
                            height="32"
                            width="114"
                            style={{ border: 0, borderRadius: 6 }}
                        />
                    </div>
                    <p className="text-gray-700">
                        このプロジェクトが役に立ったら、ライブデモサイトのホスティングを支援するために{" "}
                        <a
                            href="https://github.com/sponsors/DayuanJiang"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            スポンサー
                        </a>{" "}
                        をご検討ください！
                    </p>
                    <p className="text-gray-700 mt-2">
                        サポートやお問い合わせについては、{" "}
                        <a
                            href="https://github.com/DayuanJiang/next-ai-draw-io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            GitHubリポジトリ
                        </a>{" "}
                        でissueを開くか、ご連絡ください：me[at]jiang.jp
                    </p>

                    {/* CTA */}
                    <div className="mt-12 text-center">
                        <Link
                            href="/"
                            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            エディタを開く
                        </Link>
                    </div>
                </article>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-16">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <p className="text-center text-gray-600 text-sm">
                        Next AI Draw.io -
                        オープンソースAI搭載ダイアグラムジェネレーター
                    </p>
                </div>
            </footer>
        </div>
    )
}
