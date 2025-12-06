"use client"

import { Cloud, GitBranch, Palette, Zap } from "lucide-react"

interface ExampleCardProps {
    icon: React.ReactNode
    title: string
    description: string
    onClick: () => void
}

function ExampleCard({ icon, title, description, onClick }: ExampleCardProps) {
    return (
        <button
            onClick={onClick}
            className="group w-full text-left p-4 rounded-xl border border-border/60 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
        >
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                    {icon}
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {title}
                    </h3>
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

    return (
        <div className="py-6 px-2 animate-fade-in">
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
