import { FileUp, History, Pencil } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useDictionary } from "@/hooks/use-dictionary"
import { getAssetUrl } from "@/lib/base-path"
import { noteAction } from "@/lib/user-actions"
import { cn } from "@/lib/utils"
import { useChatEngine } from "./chat-engine"
import { Composer } from "./composer"
import { McpNotice } from "./mcp-notice"
import { SessionMenu } from "./session-menu"

interface Example {
    key: string
    title: string
    description: string
    /** Picture of the result (or of the input, for "replicate" examples) */
    image: string
    prompt: string
    /** Bundled file sent with the prompt; matches the cached example */
    file?: { path: string; name: string; type: string }
}

/** Secondary start buttons: outlined, so they read as clickable */
const startButtonClass =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] text-foreground transition-colors hover:bg-accent [&_svg]:text-muted-foreground"

async function loadExampleFile(file: NonNullable<Example["file"]>) {
    const response = await fetch(getAssetUrl(file.path))
    const blob = await response.blob()
    return new File([blob], file.name, { type: file.type })
}

/** One start-screen example: a small picture over its title */
function ExampleTile({
    onClick,
    title,
    description,
    picture,
    testId,
}: {
    onClick: () => void
    title: string
    /** Shown as the tooltip: the title alone names the example */
    description: string
    picture: React.ReactNode
    testId?: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={description}
            className="group/example flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-1.5 pb-2.5 text-left transition-colors hover:border-foreground/25"
            data-testid={testId}
        >
            <span className="flex h-16 w-full items-center justify-center overflow-hidden rounded-lg sheet-light bg-white">
                {picture}
            </span>
            <span className="px-1 text-[13px] leading-snug font-medium text-foreground">
                {title}
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
    const isSelfHosted = process.env.NEXT_PUBLIC_SELFHOSTED === "true"

    // Prompts and file names must stay as they are: cached responses match them
    const examples: Example[] = [
        {
            key: "paper",
            title: dict.examples.paperToDiagram,
            description: dict.examples.paperDescription,
            image: "/gallery/paper-cot.svg",
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
            image: "/gallery/transformer.svg",
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
            image: "/gallery/cat.svg",
            prompt: "Draw a cat for me",
        },
    ]

    // Counts the picks: a file that arrives after another example was
    // picked belongs to the earlier prompt and is not attached. Nor one
    // that arrives once this start screen is gone: the next start screen
    // counts its own picks from zero, and the attachments are shared.
    const pickCount = useRef(0)
    useEffect(
        () => () => {
            pickCount.current++
        },
        [],
    )
    const applyExample = async (example: Example) => {
        noteAction(`pick example ${example.key}`)
        const pick = ++pickCount.current
        engine.setInput(example.prompt)
        if (!example.file) {
            engine.setFiles([])
            return
        }
        try {
            const file = await loadExampleFile(example.file)
            if (pick === pickCount.current) engine.setFiles([file])
        } catch (error) {
            console.error(dict.errors.failedToLoadExample, error)
        }
    }

    // Text the user typed is replaced only on confirm, as a saved prompt
    // does: text put there by code cannot be brought back with undo.
    // Another example's prompt is replaced at once.
    const [exampleToConfirm, setExampleToConfirm] = useState<Example | null>(
        null,
    )
    const pickExample = (example: Example) => {
        const typed = engine.input.trim()
        if (typed && !examples.some((e) => e.prompt === typed)) {
            setExampleToConfirm(example)
        } else {
            applyExample(example)
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
            {/* Lines of about the same length, so the last one is not a
                single character (Chinese); Japanese breaks between phrases,
                not inside a word */}
            <p
                className={cn(
                    "mx-auto mt-2.5 max-w-[34em] text-center text-balance text-muted-foreground [word-break:auto-phrase]",
                    compact ? "mb-5 text-[13px]" : "mb-6 text-[14.5px]",
                )}
            >
                {t.lede}
            </p>

            {/* MCP server notice, hidden on self-hosted deployments. The lede's
                margin already spans 24 px (20 px compact); pull the card up so
                16 px remain above it */}
            {!isSelfHosted && (
                <McpNotice
                    className={cn("mb-5", compact ? "-mt-1" : "-mt-2")}
                />
            )}

            <Composer
                variant="hero"
                autoFocus={!compact}
                placeholder={t.placeholder}
            />

            {/* Examples: one row of tiles; the ways to bring your own
                diagram follow as a separate group */}
            <div
                className={cn(
                    "mt-5 grid gap-2",
                    compact ? "grid-cols-1" : "grid-cols-5",
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
                        <ExampleTile
                            key={example.key}
                            onClick={() => pickExample(example)}
                            title={example.title}
                            description={example.description}
                            testId={`example-${example.key}`}
                            picture={
                                // biome-ignore lint/performance/noImgElement: static preview
                                <img
                                    src={getAssetUrl(example.image)}
                                    alt=""
                                    className="max-h-14 max-w-[88%] object-contain transition-transform duration-300 group-hover/example:scale-[1.06]"
                                />
                            }
                        />
                    ),
                )}
            </div>
            <p className="mt-2.5 text-center text-xs text-faint">
                {dict.examples.cachedNote}
            </p>

            {/* Ways to start without an example, as plain buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {engine.sessions.length > 0 && (
                    <SessionMenu
                        align="center"
                        onOpenFile={onOpenFile}
                        hideActions
                    >
                        <button type="button" className={startButtonClass}>
                            <History className="size-4" />
                            {t.recent}
                        </button>
                    </SessionMenu>
                )}
                <button
                    type="button"
                    onClick={onOpenFile}
                    className={startButtonClass}
                    data-testid="open-file"
                >
                    <FileUp className="size-4" />
                    {dict.workspace.openFile}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        noteAction("draw yourself")
                        onDrawYourself()
                    }}
                    className={startButtonClass}
                    data-testid="draw-yourself"
                >
                    <Pencil className="size-4" />
                    {t.drawYourself}
                </button>
            </div>

            <AlertDialog
                open={exampleToConfirm !== null}
                onOpenChange={(open) => !open && setExampleToConfirm(null)}
            >
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {dict.templates.confirmReplaceTitle}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {dict.templates.confirmReplaceDescription}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {dict.common.cancel}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() =>
                                exampleToConfirm &&
                                applyExample(exampleToConfirm)
                            }
                        >
                            {dict.templates.confirmReplaceButton}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
