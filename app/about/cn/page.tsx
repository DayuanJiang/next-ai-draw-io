import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { FaGithub } from "react-icons/fa"

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
                                className="text-blue-600 font-semibold"
                            >
                                中文
                            </Link>
                            <span className="text-gray-400">|</span>
                            <Link
                                href="/about/ja"
                                className="text-gray-600 hover:text-blue-600"
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
                                    关于扩容与限制{" "}
                                    <span className="text-sm text-amber-600 font-medium italic font-normal">
                                        (或者说：我的钱包顶不住了)
                                    </span>
                                </h3>
                            </div>

                            {/* Story */}
                            <div className="space-y-3 text-sm text-gray-700 leading-relaxed mb-5">
                                <p>
                                    大家对这个项目的热情太高了——看来大家都真的很喜欢画图！但这也带来了一个幸福的烦恼：我们经常触发出上游
                                    AI 接口的频率限制
                                    (TPS/TPM)。一旦超限，系统就会暂停，导致请求失败。
                                </p>
                                <p>
                                    作为一个
                                    <span className="font-semibold text-amber-700">
                                        独立开发者
                                    </span>
                                    ，目前的 API
                                    费用全是我自己在掏腰包（纯属为爱发电）。为了保证服务能细水长流，同时也为了避免我个人陷入财务危机，我不得不设置以下临时用量限制：
                                </p>
                            </div>

                            {/* Limits Cards */}
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <div className="rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 p-4 text-center">
                                    <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                                        Token 用量
                                    </div>
                                    <div className="text-lg font-bold text-gray-900">
                                        5万
                                        <span className="text-sm font-normal text-gray-600">
                                            /分钟
                                        </span>
                                    </div>
                                    <div className="text-lg font-bold text-gray-900">
                                        50万
                                        <span className="text-sm font-normal text-gray-600">
                                            /天
                                        </span>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 p-4 text-center">
                                    <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                                        每日请求数
                                    </div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        20
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        次
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
                                    寻求赞助 (求大佬捞一把)
                                </h4>
                                <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                                    要想彻底解除这些限制，扩容后端是唯一的办法。我正在积极寻求
                                    AI API 提供商或云平台的赞助。
                                </p>
                                <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                                    作为回报（无论是额度支持还是资金支持），我将在
                                    GitHub 仓库和 Live Demo
                                    网站的显眼位置展示贵公司的 Logo
                                    作为平台赞助商。
                                </p>
                                <a
                                    href="mailto:me@jiang.jp"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200"
                                >
                                    联系我
                                </a>
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
                        {/* Animated Transformer */}
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                动画Transformer连接器
                            </h3>
                            <p className="text-gray-600 mb-4">
                                <strong>提示词：</strong> 给我一个带有
                                <strong>动画连接器</strong>的Transformer架构图。
                            </p>
                            <Image
                                src="/animated_connectors.svg"
                                alt="带动画连接器的Transformer架构"
                                width={480}
                                height={360}
                                className="mx-auto"
                            />
                        </div>

                        {/* Cloud Architecture Grid */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    GCP架构图
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>提示词：</strong> 使用
                                    <strong>GCP图标</strong>
                                    生成一个GCP架构图。用户连接到托管在实例上的前端。
                                </p>
                                <Image
                                    src="/gcp_demo.svg"
                                    alt="GCP架构图"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    AWS架构图
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>提示词：</strong> 使用
                                    <strong>AWS图标</strong>
                                    生成一个AWS架构图。用户连接到托管在实例上的前端。
                                </p>
                                <Image
                                    src="/aws_demo.svg"
                                    alt="AWS架构图"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Azure架构图
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>提示词：</strong> 使用
                                    <strong>Azure图标</strong>
                                    生成一个Azure架构图。用户连接到托管在实例上的前端。
                                </p>
                                <Image
                                    src="/azure_demo.svg"
                                    alt="Azure架构图"
                                    width={400}
                                    height={300}
                                    className="mx-auto"
                                />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    猫咪素描
                                </h3>
                                <p className="text-gray-600 text-sm mb-4">
                                    <strong>提示词：</strong>{" "}
                                    给我画一只可爱的猫。
                                </p>
                                <Image
                                    src="/cat_demo.svg"
                                    alt="猫咪绘图"
                                    width={240}
                                    height={240}
                                    className="mx-auto"
                                />
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
                        <li>AWS Bedrock（默认）</li>
                        <li>
                            OpenAI / OpenAI兼容API（通过{" "}
                            <code>OPENAI_BASE_URL</code>）
                        </li>
                        <li>Anthropic</li>
                        <li>Google AI</li>
                        <li>Azure OpenAI</li>
                        <li>Ollama</li>
                        <li>OpenRouter</li>
                        <li>DeepSeek</li>
                    </ul>
                    <p className="text-gray-700 mt-4">
                        注意：<code>claude-sonnet-4-5</code>{" "}
                        已在带有AWS标志的draw.io图表上进行训练，因此如果您想创建AWS架构图，这是最佳选择。
                    </p>

                    {/* Support */}
                    <div className="flex items-center gap-4 mt-10 mb-4">
                        <h2 className="text-2xl font-semibold text-gray-900">
                            支持与联系
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
