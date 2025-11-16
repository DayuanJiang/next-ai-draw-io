import type { Metadata } from "next";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";

export const metadata: Metadata = {
    title: "About - AI-Powered Diagram Generator | Next AI Draw.io",
    description: "Learn about Next AI Draw.io, a free AI-powered diagram creation tool. Create AWS architecture diagrams, flowcharts, and UML diagrams using Claude Sonnet and GPT-4. No login required.",
    keywords: ["about AI diagram generator", "diagram tool features", "how to create diagrams", "AI drawing tool capabilities", "draw.io integration"],
};

export default function About() {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Navigation */}
            <header className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <Link href="/" className="text-xl font-bold text-gray-900 hover:text-gray-700">
                            Next AI Draw.io
                        </Link>
                        <nav className="flex items-center gap-6 text-sm">
                            <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                                Editor
                            </Link>
                            <Link href="/about" className="text-blue-600 font-semibold">
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
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <article>
                    {/* Hero Section */}
                    <header className="mb-12">
                        <h1 className="text-4xl font-bold text-gray-900 mb-4">
                            AI-Powered Diagram Generator | Create Professional Diagrams Instantly
                        </h1>
                        <p className="text-xl text-gray-600">
                            Free, open-source diagram creation tool powered by AI. No login required, no installation needed.
                        </p>
                    </header>

                    {/* Introduction */}
                    <section className="mb-12">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">What is Next AI Draw.io?</h2>
                        <div className="prose prose-lg max-w-none text-gray-700">
                            <p className="mb-4">
                                <strong>Next AI Draw.io</strong> is a free, AI-powered diagram creation tool that integrates seamlessly with draw.io.
                                Generate AWS architecture diagrams, flowcharts, UML diagrams, and technical documentation diagrams using natural language
                                prompts. No login required, no installation needed—start creating professional diagrams instantly in your browser.
                            </p>
                            <p className="mb-4">
                                Our intelligent diagram generator uses advanced AI models including <strong>Claude Sonnet</strong> and <strong>GPT-4</strong> to
                                understand your requirements and automatically create properly structured diagrams with appropriate symbols, layouts, and connections.
                                Simply describe what you need, upload reference images, or ask the AI to modify existing diagrams with our targeted XML editing feature.
                            </p>
                            <p>
                                Whether you're a software architect designing system infrastructure, a developer documenting APIs, a business analyst creating
                                process flows, or a student working on technical assignments, Next AI Draw.io makes diagram creation fast, accurate, and effortless.
                            </p>
                        </div>
                    </section>

                    {/* Key Features */}
                    <section className="mb-12">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Key Features</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                                    <span className="text-blue-600 mr-2">✓</span>
                                    AI-Powered Diagram Creation
                                </h3>
                                <p className="text-gray-700">
                                    Generate diagrams from natural language descriptions using Claude Sonnet or GPT-4.
                                    Describe your diagram in plain English, and watch the AI create it with proper symbols,
                                    layouts, and connections automatically.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                                    <span className="text-blue-600 mr-2">✓</span>
                                    AWS Architecture Diagrams
                                </h3>
                                <p className="text-gray-700">
                                    Create professional cloud infrastructure diagrams with AWS-style icons and layouts.
                                    Perfect for designing EC2 instances, Lambda functions, S3 buckets, RDS databases, VPCs,
                                    and complete AWS solution architectures.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                                    <span className="text-blue-600 mr-2">✓</span>
                                    Image-Based Diagram Replication
                                </h3>
                                <p className="text-gray-700">
                                    Upload existing diagrams or sketches, and the AI will automatically recreate them in draw.io format.
                                    Modify uploaded images by describing the changes you want—the AI handles the rest.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                                    <span className="text-blue-600 mr-2">✓</span>
                                    Diagram History & Version Control
                                </h3>
                                <p className="text-gray-700">
                                    Access previous versions of your diagrams and restore any version from your session history.
                                    Never lose work—every AI modification is saved and can be undone with a single click.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                                    <span className="text-blue-600 mr-2">✓</span>
                                    Targeted XML Editing
                                </h3>
                                <p className="text-gray-700">
                                    Precise diagram modifications using intelligent XML manipulation. Unlike full diagram regeneration,
                                    targeted edits preserve your existing layout while making specific changes, ensuring consistent
                                    and predictable results.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                                    <span className="text-blue-600 mr-2">✓</span>
                                    Multi-Provider AI Support
                                </h3>
                                <p className="text-gray-700">
                                    Choose between Claude Sonnet, GPT-4, and other leading AI models for optimal results.
                                    Each model has unique strengths—select the one that best fits your diagram complexity and style.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Use Cases */}
                    <section className="mb-12">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Popular Use Cases</h2>
                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">AWS Cloud Architecture</h3>
                                <p className="text-gray-700 mb-4">
                                    Design scalable cloud infrastructure with EC2 instances, Lambda functions, S3 storage,
                                    RDS databases, and VPC networking. Perfect for solution architects, cloud engineers,
                                    and DevOps teams planning AWS deployments.
                                </p>
                                <p className="text-sm text-gray-600 italic">
                                    Example: "Create an AWS diagram with an Application Load Balancer, two EC2 instances
                                    in different availability zones, an RDS database, and an S3 bucket for static assets."
                                </p>
                            </div>

                            <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">Flowcharts & Process Diagrams</h3>
                                <p className="text-gray-700 mb-4">
                                    Create business process flows, decision trees, workflow diagrams, and algorithm flowcharts
                                    for documentation, presentations, and process optimization. Ideal for business analysts,
                                    project managers, and operations teams.
                                </p>
                                <p className="text-sm text-gray-600 italic">
                                    Example: "Draw a flowchart for user authentication: check if user exists, verify password,
                                    generate JWT token on success, show error message on failure."
                                </p>
                            </div>

                            <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">System Design & UML Diagrams</h3>
                                <p className="text-gray-700 mb-4">
                                    Generate system architecture diagrams, class diagrams, sequence diagrams, and
                                    entity-relationship diagrams for software projects. Essential for software engineers,
                                    system designers, and technical documentation.
                                </p>
                                <p className="text-sm text-gray-600 italic">
                                    Example: "Create a class diagram for an e-commerce system with User, Product, Order,
                                    and Payment classes showing their relationships and key methods."
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* How It Works */}
                    <section className="mb-12 bg-white p-8 rounded-lg border border-gray-200">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">How to Use Next AI Draw.io</h2>
                        <div className="space-y-6">
                            <div className="flex items-start">
                                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
                                    1
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Open the Editor</h3>
                                    <p className="text-gray-700">
                                        Navigate to the main page and you'll see the draw.io editor with an AI chat panel on the right.
                                        No account creation or login required—start immediately.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
                                    2
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Describe Your Diagram</h3>
                                    <p className="text-gray-700">
                                        Type your diagram request in natural language. Be as detailed or as general as you like.
                                        You can also upload reference images for the AI to analyze and replicate.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
                                    3
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Generates Your Diagram</h3>
                                    <p className="text-gray-700">
                                        The AI processes your request and automatically creates your diagram in seconds.
                                        Watch as it appears in the editor with proper symbols, layouts, and connections.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">
                                    4
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Refine and Export</h3>
                                    <p className="text-gray-700">
                                        Request modifications using the chat, manually edit in draw.io, or export to PNG, SVG,
                                        or XML format. Access diagram history to restore previous versions anytime.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Benefits */}
                    <section className="mb-12">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Why Choose Next AI Draw.io?</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="flex items-start">
                                <div className="flex-shrink-0 text-blue-600 text-2xl mr-3">⚡</div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Save Time</h3>
                                    <p className="text-gray-700">
                                        Create complex diagrams in seconds instead of hours. No more dragging, aligning,
                                        or searching for the right symbols—AI handles it all.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <div className="flex-shrink-0 text-blue-600 text-2xl mr-3">🎯</div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Precision Editing</h3>
                                    <p className="text-gray-700">
                                        Targeted XML editing ensures changes are precise and predictable, unlike tools
                                        that regenerate entire diagrams and lose your layout.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <div className="flex-shrink-0 text-blue-600 text-2xl mr-3">🆓</div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Completely Free</h3>
                                    <p className="text-gray-700">
                                        No subscriptions, no usage limits, no hidden costs. Open-source and free forever.
                                        Use it for personal projects, work, or education.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start">
                                <div className="flex-shrink-0 text-blue-600 text-2xl mr-3">🔒</div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Privacy First</h3>
                                    <p className="text-gray-700">
                                        No account required means your diagrams stay private. Work on sensitive
                                        architecture designs without worrying about data storage or privacy policies.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CTA Section */}
                    <section className="bg-blue-600 text-white p-8 rounded-lg text-center">
                        <h2 className="text-3xl font-bold mb-4">Ready to Create Your First AI Diagram?</h2>
                        <p className="text-xl mb-6">
                            Start generating professional diagrams in seconds. No signup required.
                        </p>
                        <Link
                            href="/"
                            className="inline-block bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                        >
                            Open Editor
                        </Link>
                    </section>
                </article>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="text-center text-gray-600 text-sm">
                        <p className="mb-2">
                            Next AI Draw.io - Free AI-Powered Diagram Generator
                        </p>
                        <p>
                            Perfect for developers, architects, students, and business analysts.
                            Open source. No login required.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
