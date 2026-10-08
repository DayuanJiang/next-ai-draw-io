import { FileText, FileUp, History, Pencil } from "lucide-react"
import type React from "react"
import { useDictionary } from "@/hooks/use-dictionary"
import { getAssetUrl } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import { useChatEngine } from "./chat-engine"
import { Composer } from "./composer"
import { SessionMenu } from "./session-menu"

interface Example {
    key: string
    title: string
    description: string
    /** Picture of the result (or of the input, for "replicate" examples) */
    image?: string
    prompt: string
    /** Bundled file sent with the prompt; matches the cached example */
    file?: { path: string; name: string; type: string }
}

async function loadExampleFile(file: NonNullable<Example["file"]>) {
    const response = await fetch(getAssetUrl(file.path))
    const blob = await response.blob()
    return new File([blob], file.name, { type: file.type })
}

/** One start-screen choice: a small picture, a title and one line */
function ExampleCard({
    onClick,
    title,
    description,
    picture,
    plain,
    testId,
}: {
    onClick: () => void
    title: string
    description: string
    picture: React.ReactNode
    /** An icon on a tinted tile instead of a diagram on paper */
    plain?: boolean
    testId?: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group/example flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card p-1.5 pr-2.5 text-left transition-colors hover:border-foreground/25"
            data-testid={testId}
        >
            <span
                className={cn(
                    "flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                    plain ? "bg-muted" : "sheet-light bg-white",
                )}
            >
                {picture}
            </span>
            <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
                    {title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {description}
                </span>
            </span>
        </button>
    )
}

/**
 * Start screen over an empty canvas: one large message box and the cached
 * examples (they answer instantly without calling a model).
 */
export function LobbyHero({
    onDrawYourself,
    onOpenFile,
    compact = false,
}: {
    onDrawYourself: () => void
    onOpenFile: () => void
    /** Phone layout: no example pictures, tighter spacing */
    compact?: boolean
}) {
    const dict = useDictionary()
    const t = dict.lobby
    const engine = useChatEngine()

    // Prompts and file names must stay as they are: cached responses match them
    const examples: Example[] = [
        {
            key: "paper",
            title: dict.examples.paperToDiagram,
            description: dict.examples.paperDescription,
            prompt: "Summarize this paper as a diagram",
            file: {
                path: "/chain-of-thought.txt",
                name: "chain-of-thought.txt",
                type: "text/plain",
            },
        },
        {
            key: "animated",
            title: dict.examples.animatedDiagram,
            description: dict.examples.animatedDescription,
            image: "/animated_connectors.svg",
            prompt: "Give me a **animated connector** diagram of transformer's architecture",
        },
        {
            key: "aws",
            title: dict.examples.awsArchitecture,
            description: dict.examples.awsDescription,
            image: "/aws_demo.svg",
            prompt: "Replicate this in aws style",
            file: {
                path: "/architecture.png",
                name: "architecture.png",
                type: "image/png",
            },
        },
        {
            key: "flowchart",
            title: dict.examples.replicateFlowchart,
            description: dict.examples.replicateDescription,
            image: "/example.png",
            prompt: "Replicate this flowchart.",
            file: {
                path: "/example.png",
                name: "example.png",
                type: "image/png",
            },
        },
        {
            key: "cat",
            title: dict.examples.creativeDrawing,
            description: dict.examples.creativeDescription,
            image: "/cat_demo.svg",
            prompt: "Draw a cat for me",
        },
    ]

    const pickExample = async (example: Example) => {
        engine.setInput(example.prompt)
        if (!example.file) {
            engine.setFiles([])
            return
        }
        try {
            engine.setFiles([await loadExampleFile(example.file)])
        } catch (error) {
            console.error(dict.errors.failedToLoadExample, error)
        }
    }

    return (
        <div
            className={cn(
                "mx-auto w-full",
                compact ? "max-w-xl px-4 py-8" : "max-w-[720px] px-6 py-10",
            )}
            data-testid="lobby-hero"
        >
            <h1
                className={cn(
                    "text-center font-semibold tracking-[-0.025em] text-foreground",
                    compact
                        ? "text-[26px] leading-tight"
                        : "text-[34px] leading-[1.15]",
                )}
            >
                {t.title}
            </h1>
            <p
                className={cn(
                    "mx-auto mt-2.5 max-w-[34em] text-center text-muted-foreground",
                    compact ? "mb-5 text-[13px]" : "mb-6 text-[14.5px]",
                )}
            >
                {t.lede}
            </p>

            <Composer
                variant="hero"
                autoFocus={!compact}
                placeholder={t.placeholder}
            />

            <div
                className={cn(
                    "mt-5 grid gap-2",
                    compact ? "grid-cols-1" : "grid-cols-3",
                )}
            >
                {examples.map((example) =>
                    compact ? (
                        <button
                            key={example.key}
                            type="button"
                            onClick={() => pickExample(example)}
                            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-foreground/25"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium">
                                    {example.title}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {example.description}
                                </span>
                            </span>
                        </button>
                    ) : (
                        <ExampleCard
                            key={example.key}
                            onClick={() => pickExample(example)}
                            title={example.title}
                            description={example.description}
                            testId={`example-${example.key}`}
                            picture={
                                example.image ? (
                                    // biome-ignore lint/performance/noImgElement: static preview
                                    <img
                                        src={getAssetUrl(example.image)}
                                        alt=""
                                        className="max-h-10 max-w-[56px] object-contain transition-transform duration-300 group-hover/example:scale-[1.06]"
                                    />
                                ) : (
                                    <FileText className="size-5 text-muted-foreground" />
                                )
                            }
                            plain={!example.image}
                        />
                    ),
                )}
                {!compact && (
                    <ExampleCard
                        onClick={onOpenFile}
                        title={dict.workspace.openFile}
                        description={t.openFileHint}
                        picture={
                            <FileUp className="size-5 text-muted-foreground" />
                        }
                        plain
                    />
                )}
            </div>
            <p className="mt-3 text-center text-xs text-faint">
                {dict.examples.cachedNote}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
                {engine.sessions.length > 0 && (
                    <SessionMenu align="center" onOpenFile={onOpenFile}>
                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 hover:text-foreground"
                        >
                            <History className="size-4" />
                            {t.recent}
                        </button>
                    </SessionMenu>
                )}
                {compact && (
                    <button
                        type="button"
                        onClick={onOpenFile}
                        className="inline-flex items-center gap-1.5 hover:text-foreground"
                    >
                        <FileUp className="size-4" />
                        {dict.workspace.openFile}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onDrawYourself}
                    className="inline-flex items-center gap-1.5 hover:text-foreground"
                    data-testid="draw-yourself"
                >
                    <Pencil className="size-4" />
                    {t.drawYourself}
                </button>
            </div>
        </div>
    )
}
