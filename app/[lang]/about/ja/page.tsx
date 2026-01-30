import type { Metadata } from "next"
import Link from "next/link"
import { FaGithub } from "react-icons/fa"
import Image from "@/components/image-with-basepath"

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
                    </div>

                    <div className="relative mb-8 rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-[1px] shadow-lg">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-yellow-400 opacity-20" />
                        <div className="relative rounded-2xl bg-white/80 backdrop-blur-sm p-6">
                            {/* Header */}
                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                                    ByteDance Doubao提供
                                </h3>
                            </div>

                            {/* Story */}
                            <div className="space-y-3 text-sm text-gray-700 leading-relaxed mb-5">
                                <p>
                                    朗報です！
                                    <a
                                        href="https://www.volcengine.com/activity/newyear-referral?utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-semibold text-blue-600 hover:underline"
                                    >
                                        ByteDance Doubao
                                    </a>
                                    様のご支援により、デモサイトでは強力な{" "}
                                    <span className="font-semibold text-amber-700">
                                        K2-thinking
                                    </span>{" "}
                                    モデルを利用できるようになり、より高品質なダイアグラム生成が可能になりました。リンクから登録すると、すべてのモデルで使える{" "}
                                    <span className="font-semibold text-amber-700">
                                        50万トークン
                                    </span>
                                    が無料でもらえます！
                                </p>
                            </div>

                            {/* Bring Your Own Key */}
                            <div className="text-center">
                                <h4 className="text-base font-bold text-gray-900 mb-2">
                                    自分のAPIキーを使用
                                </h4>
                                <p className="text-sm text-gray-600 mb-2 max-w-md mx-auto">
                                    お好みのプロバイダーで自分のAPIキーを使用することもできます。チャットパネルの設定アイコンをクリックして設定してください。
                                </p>
                                <p className="text-xs text-gray-500 max-w-md mx-auto">
                                    キーはブラウザのローカルに保存され、サーバーには保存されません。
                                </p>
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
                        <li>
                            <a
                                href="https://www.volcengine.com/activity/newyear-referral?utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                            >
                                ByteDance Doubao
                            </a>
                        </li>
                        <li>AWS Bedrock（デフォルト）</li>
                        <li>
                            OpenAI / OpenAI互換API（<code>OPENAI_BASE_URL</code>
                            経由）
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
                        注：<code>claude-sonnet-4-5</code>
                        はAWSロゴ付きのdraw.ioダイアグラムで学習されているため、AWSアーキテクチャダイアグラムを作成したい場合は最適な選択です。
                    </p>

                    {/* Support */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        サポート＆お問い合わせ
                    </h2>
                    <p className="text-gray-700 mb-4 font-semibold">
                        デモサイトのAPIトークン使用を支援してくださった{" "}
                        <a
                            href="https://www.volcengine.com/activity/newyear-referral?utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            ByteDance Doubao
                        </a>{" "}
                        様に、心より感謝申し上げます。
                    </p>
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
