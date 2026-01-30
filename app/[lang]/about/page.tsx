import type { Metadata } from "next"
import Link from "next/link"
import { FaGithub } from "react-icons/fa"
import Image from "@/components/image-with-basepath"

export const metadata: Metadata = {
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
}

export default function About() {
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
                                Editor
                            </Link>
                            <Link
                                href="/about"
                                className="text-blue-600 font-semibold"
                            >
                                About
                            </Link>
                            <a
                                href="https://github.com/DayuanJiang/next-ai-draw-io"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-600 hover:text-gray-900 transition-colors"
                                aria-label="View on GitHub"
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
                            AI-Powered Diagram Creation Tool - Chat, Draw,
                            Visualize
                        </p>
                    </div>

                    <div className="relative mb-8 rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-[1px] shadow-lg">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-yellow-400 opacity-20" />
                        <div className="relative rounded-2xl bg-white/80 backdrop-blur-sm p-6">
                            {/* Header */}
                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                                    Sponsored by ByteDance Doubao
                                </h3>
                            </div>

                            {/* Story */}
                            <div className="space-y-3 text-sm text-gray-700 leading-relaxed mb-5">
                                <p>
                                    Great news! Thanks to the generous
                                    sponsorship from{" "}
                                    <a
                                        href="https://www.volcengine.com/activity/newyear-referral?utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-semibold text-blue-600 hover:underline"
                                    >
                                        ByteDance Doubao
                                    </a>
                                    , the demo site now uses the powerful{" "}
                                    <span className="font-semibold text-amber-700">
                                        K2-thinking
                                    </span>{" "}
                                    model for better diagram generation! Sign up
                                    via the link to get{" "}
                                    <span className="font-semibold text-amber-700">
                                        500K free tokens
                                    </span>{" "}
                                    for all models!
                                </p>
                            </div>

                            {/* Bring Your Own Key */}
                            <div className="text-center">
                                <h4 className="text-base font-bold text-gray-900 mb-2">
                                    Bring Your Own API Key
                                </h4>
                                <p className="text-sm text-gray-600 mb-2 max-w-md mx-auto">
                                    You can also use your own API key with any
                                    supported provider. Click the Settings icon
                                    in the chat panel to configure your provider
                                    and API key.
                                </p>
                                <p className="text-xs text-gray-500 max-w-md mx-auto">
                                    Your key is stored locally in your browser
                                    and is never stored on the server.
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="text-gray-700">
                        A Next.js web application that integrates AI
                        capabilities with draw.io diagrams. Create, modify, and
                        enhance diagrams through natural language commands and
                        AI-assisted visualization.
                    </p>

                    {/* Features */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        Features
                    </h2>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2">
                        <li>
                            <strong>LLM-Powered Diagram Creation</strong>:
                            Leverage Large Language Models to create and
                            manipulate draw.io diagrams directly through natural
                            language commands
                        </li>
                        <li>
                            <strong>Image-Based Diagram Replication</strong>:
                            Upload existing diagrams or images and have the AI
                            replicate and enhance them automatically
                        </li>
                        <li>
                            <strong>Diagram History</strong>: Comprehensive
                            version control that tracks all changes, allowing
                            you to view and restore previous versions of your
                            diagrams before the AI editing
                        </li>
                        <li>
                            <strong>Interactive Chat Interface</strong>:
                            Communicate with AI to refine your diagrams in
                            real-time
                        </li>
                        <li>
                            <strong>AWS Architecture Diagram Support</strong>:
                            Specialized support for generating AWS architecture
                            diagrams
                        </li>
                        <li>
                            <strong>Animated Connectors</strong>: Create dynamic
                            and animated connectors between diagram elements for
                            better visualization
                        </li>
                    </ul>

                    {/* Examples */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        Examples
                    </h2>
                    <p className="text-gray-700 mb-6">
                        Here are some example prompts and their generated
                        diagrams:
                    </p>

                    <div className="space-y-8">
                        {/* Animated Transformer */}
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                Animated Transformer Connectors
                            </h3>
                            <p className="text-gray-600 mb-4">
                                <strong>Prompt:</strong> Give me an{" "}
                                <strong>animated connector</strong> diagram of
                                transformer&apos;s architecture.
                            </p>
                            <Image
                                src="/animated_connectors.svg"
                                alt="Transformer Architecture with Animated Connectors"
                                width={480}
                                height={360}
                                className="mx-auto"
                            />
                        </div>

                        {/* Cloud Architecture Grid */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    GCP Architecture Diagram
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>Prompt:</strong> Generate a GCP
                                    architecture diagram with{" "}
                                    <strong>GCP icons</strong>. Users connect to
                                    a frontend hosted on an instance.
                                </p>
                                <Image
                                    src="/gcp_demo.svg"
                                    alt="GCP Architecture Diagram"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    AWS Architecture Diagram
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>Prompt:</strong> Generate an AWS
                                    architecture diagram with{" "}
                                    <strong>AWS icons</strong>. Users connect to
                                    a frontend hosted on an instance.
                                </p>
                                <Image
                                    src="/aws_demo.svg"
                                    alt="AWS Architecture Diagram"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Azure Architecture Diagram
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>Prompt:</strong> Generate an Azure
                                    architecture diagram with{" "}
                                    <strong>Azure icons</strong>. Users connect
                                    to a frontend hosted on an instance.
                                </p>
                                <Image
                                    src="/azure_demo.svg"
                                    alt="Azure Architecture Diagram"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Cat Sketch
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>Prompt:</strong> Draw a cute cat for
                                    me.
                                </p>
                                <Image
                                    src="/cat_demo.svg"
                                    alt="Cat Drawing"
                                    width={240}
                                    height={240}
                                    className="mx-auto"
                                />
                            </div>
                        </div>
                    </div>

                    {/* How It Works */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        How It Works
                    </h2>
                    <p className="text-gray-700 mb-4">
                        The application uses the following technologies:
                    </p>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2">
                        <li>
                            <strong>Next.js</strong>: For the frontend framework
                            and routing
                        </li>
                        <li>
                            <strong>Vercel AI SDK</strong> (<code>ai</code> +{" "}
                            <code>@ai-sdk/*</code>): For streaming AI responses
                            and multi-provider support
                        </li>
                        <li>
                            <strong>react-drawio</strong>: For diagram
                            representation and manipulation
                        </li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                        Diagrams are represented as XML that can be rendered in
                        draw.io. The AI processes your commands and generates or
                        modifies this XML accordingly.
                    </p>

                    {/* Multi-Provider Support */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        Multi-Provider Support
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
                        <li>AWS Bedrock (default)</li>
                        <li>
                            OpenAI / OpenAI-compatible APIs (via{" "}
                            <code>OPENAI_BASE_URL</code>)
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
                        Note that <code>claude-sonnet-4-5</code> has trained on
                        draw.io diagrams with AWS logos, so if you want to
                        create AWS architecture diagrams, this is the best
                        choice.
                    </p>

                    {/* Support */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        Support &amp; Contact
                    </h2>
                    <p className="text-gray-700 mb-4 font-semibold">
                        Special thanks to{" "}
                        <a
                            href="https://www.volcengine.com/activity/newyear-referral?utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            ByteDance Doubao
                        </a>{" "}
                        for sponsoring the API token usage of the demo site!
                    </p>
                    <p className="text-gray-700">
                        If you find this project useful, please consider{" "}
                        <a
                            href="https://github.com/sponsors/DayuanJiang"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            sponsoring
                        </a>{" "}
                        to help host the live demo site!
                    </p>
                    <p className="text-gray-700 mt-2">
                        For support or inquiries, please open an issue on the{" "}
                        <a
                            href="https://github.com/DayuanJiang/next-ai-draw-io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            GitHub repository
                        </a>{" "}
                        or contact: me[at]jiang.jp
                    </p>

                    {/* CTA */}
                    <div className="mt-12 text-center">
                        <Link
                            href="/"
                            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Open Editor
                        </Link>
                    </div>
                </article>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-16">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <p className="text-center text-gray-600 text-sm">
                        Next AI Draw.io - Open Source AI-Powered Diagram
                        Generator
                    </p>
                </div>
            </footer>
        </div>
    )
}
