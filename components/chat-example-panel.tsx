"use client"

import {
    Cloud,
    FileText,
    GitBranch,
    Palette,
    Terminal,
    Zap,
} from "lucide-react"

interface ExampleCardProps {
    icon: React.ReactNode
    title: string
    description: string
    onClick: () => void
    isNew?: boolean
}

function ExampleCard({
    icon,
    title,
    description,
    onClick,
    isNew,
}: ExampleCardProps) {
    return (
        <button
            onClick={onClick}
            className={`group w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 hover:shadow-sm ${
                isNew
                    ? "border-primary/40 ring-1 ring-primary/20"
                    : "border-border/60"
            }`}
        >
            <div className="flex items-start gap-3">
                <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isNew
                            ? "bg-primary/20 group-hover:bg-primary/25"
                            : "bg-primary/10 group-hover:bg-primary/15"
                    }`}
                >
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                            {title}
                        </h3>
                        {isNew && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded">
                                NEW
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {description}
                    </p>
                </div>
            </div>
        </button>
    )
}

export default function ExamplePanel({
    setInput,
    setFiles,
}: {
    setInput: (input: string) => void
    setFiles: (files: File[]) => void
}) {
    const handleReplicateFlowchart = async () => {
        setInput("Replicate this flowchart.")

        try {
            const response = await fetch("/example.png")
            const blob = await response.blob()
            const file = new File([blob], "example.png", { type: "image/png" })
            setFiles([file])
        } catch (error) {
            console.error("Error loading example image:", error)
        }
    }

    const handleReplicateArchitecture = async () => {
        setInput("Replicate this in aws style")

        try {
            const response = await fetch("/architecture.png")
            const blob = await response.blob()
            const file = new File([blob], "architecture.png", {
                type: "image/png",
            })
            setFiles([file])
        } catch (error) {
            console.error("Error loading architecture image:", error)
        }
    }

    const handlePdfExample = async () => {
        setInput("Summarize this paper as a diagram")

        try {
            const response = await fetch("/chain-of-thought.txt")
            const blob = await response.blob()
            const file = new File([blob], "chain-of-thought.txt", {
                type: "text/plain",
            })
            setFiles([file])
        } catch (error) {
            console.error("Error loading text file:", error)
        }
    }

    return (
        <div className="py-6 px-2 animate-fade-in">
            {/* MCP Server Notice */}
            <a
                href="https://github.com/DayuanJiang/next-ai-draw-io/tree/main/packages/mcp-server"
                target="_blank"
                rel="noopener noreferrer"
                className="block mb-4 p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 hover:border-purple-500/40 transition-colors group"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                        <Terminal className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground group-hover:text-purple-500 transition-colors">
                                MCP Server
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500 text-white rounded">
                                PREVIEW
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Use in Claude Desktop, VS Code & Cursor
                        </p>
                    </div>
                </div>
            </a>

            {/* Welcome section */}
            <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                    Create diagrams with AI
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Describe what you want to create or upload an image to
                    replicate
                </p>
            </div>

            {/* Examples grid */}
            <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    Quick Examples
                </p>

                <div className="grid gap-2">
                    <ExampleCard
                        icon={<FileText className="w-4 h-4 text-primary" />}
                        title="Paper to Diagram"
                        description="Upload .pdf, .txt, .md, .json, .csv, .py, .js, .ts and more"
                        onClick={handlePdfExample}
                        isNew
                    />

                    <ExampleCard
                        icon={<Zap className="w-4 h-4 text-primary" />}
                        title="Animated Diagram"
                        description="Draw a transformer architecture with animated connectors"
                        onClick={() => {
                            setInput(
                                "Give me a **animated connector** diagram of transformer's architecture",
                            )
                            setFiles([])
                        }}
                    />

                    <ExampleCard
                        icon={<Cloud className="w-4 h-4 text-primary" />}
                        title="AWS Architecture"
                        description="Create a cloud architecture diagram with AWS icons"
                        onClick={handleReplicateArchitecture}
                    />

                    <ExampleCard
                        icon={<GitBranch className="w-4 h-4 text-primary" />}
                        title="Replicate Flowchart"
                        description="Upload and replicate an existing flowchart"
                        onClick={handleReplicateFlowchart}
                    />

                    <ExampleCard
                        icon={<Palette className="w-4 h-4 text-primary" />}
                        title="Creative Drawing"
                        description="Draw something fun and creative"
                        onClick={() => {
                            setInput("Draw a cat for me")
                            setFiles([])
                        }}
                    />
                </div>

                <p className="text-[11px] text-muted-foreground/60 text-center mt-4">
                    Examples are cached for instant response
                </p>
            </div>
        </div>
    )
}
