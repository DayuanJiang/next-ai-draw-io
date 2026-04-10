import type { Metadata } from "next"
import Link from "next/link"
import { FaGithub } from "react-icons/fa"
import Image from "@/components/image-with-basepath"

export const metadata: Metadata = {
    title: "关于 - Next AI Draw.io",
    description:
        "AI驱动的图表创建工具 - 对话、绘制、可视化。使用自然语言创建AWS、GCP和Azure架构图。",
    keywords: ["AI图表", "draw.io", "AWS架构", "GCP图表", "Azure图表", "LLM"],
}

export default function AboutCN() {
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
                                编辑器
                            </Link>
                            <Link
                                href="/about/cn"
                                className="text-blue-600 font-semibold"
                            >
                                关于
                            </Link>
                            <a
                                href="https://github.com/DayuanJiang/next-ai-draw-io"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-600 hover:text-gray-900 transition-colors"
                                aria-label="在GitHub上查看"
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
                            AI驱动的图表创建工具 - 对话、绘制、可视化
                        </p>
                    </div>

                    <div className="relative mb-8 rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-[1px] shadow-lg">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-yellow-400 opacity-20" />
                        <div className="relative rounded-2xl bg-white/80 backdrop-blur-sm p-6">
                            {/* Header */}
                            <div className="mb-4">
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                                    由字节跳动豆包提供支持
                                </h3>
                            </div>

                            {/* Story */}
                            <div className="space-y-3 text-sm text-gray-700 leading-relaxed mb-5">
                                <p>
                                    好消息！感谢{" "}
                                    <a
                                        href="https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=Z9Z3LDTJ&utm_campaign=drawio&utm_content=drawio&utm_medium=devrel&utm_source=OWO&utm_term=drawio"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-semibold text-blue-600 hover:underline"
                                    >
                                        字节跳动豆包
                                    </a>
                                    的慷慨赞助，演示站点现已接入强大的{" "}
                                    <span className="font-semibold text-amber-700">
                                        glm-4.7
                                    </span>{" "}
                                    模型，图表生成效果更佳！点击链接注册即可领取{" "}
                                    <span className="font-semibold text-amber-700">
                                        50万免费Token
                                    </span>
                                    ，适用于所有模型！
                                </p>
                            </div>

                            {/* Invite Poster */}
                            <div className="text-center mb-5">
                                <a
                                    href="https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=Z9Z3LDTJ&utm_campaign=drawio&utm_content=drawio&utm_medium=devrel&utm_source=OWO&utm_term=drawio"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Image
                                        src="/volcengine-invite.png"
                                        alt="火山引擎方舟 Coding Plan"
                                        width={300}
                                        height={400}
                                        className="mx-auto rounded-lg"
                                    />
                                </a>
                            </div>

                            {/* Bring Your Own Key */}
                            <div className="text-center">
                                <h4 className="text-base font-bold text-gray-900 mb-2">
                                    使用自己的 API Key
                                </h4>
                                <p className="text-sm text-gray-600 mb-2 max-w-md mx-auto">
                                    您也可以使用自己的 API
                                    Key，支持多种服务商。点击聊天面板中的设置图标即可配置。
                                </p>
                                <p className="text-xs text-gray-500 max-w-md mx-auto">
                                    您的 Key
                                    仅保存在浏览器本地，不会被存储在服务器上。
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="text-gray-700">
                        一个集成了AI功能的Next.js网页应用，与draw.io图表无缝结合。通过自然语言命令和AI辅助可视化来创建、修改和增强图表。
                    </p>

                    {/* Features */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        功能特性
                    </h2>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2">
                        <li>
                            <strong>LLM驱动的图表创建</strong>
                            ：利用大语言模型通过自然语言命令直接创建和操作draw.io图表
                        </li>
                        <li>
                            <strong>基于图像的图表复制</strong>
                            ：上传现有图表或图像，让AI自动复制和增强
                        </li>
                        <li>
                            <strong>图表历史记录</strong>
                            ：全面的版本控制，跟踪所有更改，允许您查看和恢复AI编辑前的图表版本
                        </li>
                        <li>
                            <strong>交互式聊天界面</strong>
                            ：与AI实时对话来完善您的图表
                        </li>
                        <li>
                            <strong>AWS架构图支持</strong>
                            ：专门支持生成AWS架构图
                        </li>
                        <li>
                            <strong>动画连接器</strong>
                            ：在图表元素之间创建动态动画连接器，实现更好的可视化效果
                        </li>
                    </ul>

                    {/* Examples */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        示例
                    </h2>
                    <p className="text-gray-700 mb-6">
                        以下是一些示例提示词及其生成的图表：
                    </p>

                    <div className="space-y-8">
                        {/* ResNet50 Architecture */}
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                ResNet50模型架构动画
                            </h3>
                            <p className="text-gray-600 mb-4">
                                <strong>Prompt:</strong> Give me an{" "}
                                <strong>animated</strong> architecture diagram
                                of the ResNet50 model.
                            </p>
                            <div className="bg-neutral-950 rounded-lg p-4 inline-block">
                                <Image
                                    src="/resnet50.svg"
                                    alt="ResNet50模型架构图"
                                    width={480}
                                    height={360}
                                    className="mx-auto"
                                />
                            </div>
                        </div>

                        {/* Diagram Grid */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    RAG技术图
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>Prompt:</strong> Generate a RAG
                                    architecture diagram for{" "}
                                    <strong>chat application</strong>. Use
                                    connected diagram for data ingestion
                                </p>
                                <div className="bg-neutral-950 rounded-lg p-4 flex items-center justify-center w-full h-[400px]">
                                    <Image
                                        src="/rag_prod.svg"
                                        alt="RAG架构图"
                                        width={480}
                                        height={360}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    React和AWS认证流程
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>Prompt:</strong> Generate
                                    authentication process using React with{" "}
                                    <strong>AWS</strong>. Use Serverless
                                    architecture.
                                </p>
                                <div className="bg-neutral-950 rounded-lg p-4 flex items-center justify-center w-full h-[400px]">
                                    <Image
                                        src="/auth.svg"
                                        alt="认证架构图"
                                        width={480}
                                        height={360}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    敏捷Scrum流程
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>Prompt:</strong> Generate agile
                                    scrum workflow diagram for software
                                    development team.
                                </p>
                                <div className="bg-neutral-950 rounded-lg p-4 flex items-center justify-center w-full h-[400px]">
                                    <Image
                                        src="/agile_scrum.svg"
                                        alt="敏捷Scrum流程图"
                                        width={480}
                                        height={360}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    开放式创新
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>Prompt:</strong> Create
                                    visualization of Henry Chesbrough&apos;s
                                    Open Innovation model.
                                </p>
                                <div className="bg-neutral-950 rounded-lg p-4 flex items-center justify-center w-full h-[400px]">
                                    <Image
                                        src="/inno.svg"
                                        alt="开放式创新图"
                                        width={480}
                                        height={360}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* How It Works */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        工作原理
                    </h2>
                    <p className="text-gray-700 mb-4">本应用使用以下技术：</p>
                    <ul className="list-disc pl-6 text-gray-700 space-y-2">
                        <li>
                            <strong>Next.js</strong>：用于前端框架和路由
                        </li>
                        <li>
                            <strong>Vercel AI SDK</strong>（<code>ai</code> +{" "}
                            <code>@ai-sdk/*</code>
                            ）：用于流式AI响应和多提供商支持
                        </li>
                        <li>
                            <strong>react-drawio</strong>：用于图表表示和操作
                        </li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                        图表以XML格式表示，可在draw.io中渲染。AI处理您的命令并相应地生成或修改此XML。
                    </p>

                    {/* Multi-Provider Support */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        多提供商支持
                    </h2>
                    <ul className="list-disc pl-6 text-gray-700 space-y-1">
                        <li>
                            <a
                                href="https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=Z9Z3LDTJ&utm_campaign=drawio&utm_content=drawio&utm_medium=devrel&utm_source=OWO&utm_term=drawio"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                            >
                                字节跳动豆包
                            </a>
                        </li>
                        <li>AWS Bedrock（默认）</li>
                        <li>
                            OpenAI / OpenAI兼容API（通过{" "}
                            <code>OPENAI_BASE_URL</code>）
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
                        注意：<code>claude-sonnet-4-5</code>{" "}
                        已在带有AWS标志的draw.io图表上进行训练，因此如果您想创建AWS架构图，这是最佳选择。
                    </p>

                    {/* Support */}
                    <h2 className="text-2xl font-semibold text-gray-900 mt-10 mb-4">
                        支持与联系
                    </h2>
                    <p className="text-gray-700 mb-4 font-semibold">
                        特别感谢{" "}
                        <a
                            href="https://www.volcengine.com/activity/codingplan?ac=MMAP8JTTCAQ2&rc=Z9Z3LDTJ&utm_campaign=drawio&utm_content=drawio&utm_medium=devrel&utm_source=OWO&utm_term=drawio"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            字节跳动豆包
                        </a>{" "}
                        为本站提供 API Token 支持！
                    </p>
                    <p className="text-gray-700">
                        如果您觉得这个项目有用，请考虑{" "}
                        <a
                            href="https://github.com/sponsors/DayuanJiang"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            赞助
                        </a>{" "}
                        来帮助托管在线演示站点！
                    </p>
                    <p className="text-gray-700 mt-2">
                        如需支持或咨询，请在{" "}
                        <a
                            href="https://github.com/DayuanJiang/next-ai-draw-io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            GitHub仓库
                        </a>{" "}
                        上提交issue或联系：me[at]jiang.jp
                    </p>

                    {/* CTA */}
                    <div className="mt-12 text-center">
                        <Link
                            href="/"
                            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            打开编辑器
                        </Link>
                    </div>
                </article>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-16">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <p className="text-center text-gray-600 text-sm">
                        Next AI Draw.io - 开源AI驱动的图表生成器
                    </p>
                </div>
            </footer>
        </div>
    )
}
