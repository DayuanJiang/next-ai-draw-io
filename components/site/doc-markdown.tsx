import { Link2 } from "lucide-react"
import Link from "next/link"
import { Children, isValidElement, type ReactNode } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { type Doc, HeadingIds, resolveDocLink } from "@/lib/docs"
import type { Locale } from "@/lib/i18n/config"
import { CopyCommand } from "./copy-command"
import { DEMO_LINE, DEMO_SCENES } from "./demo-names"
import { DemoPlayer } from "./demo-player"
import type { DocsDemos } from "./demo-texts"
import { FLOWCHART } from "./flowchart-diagram"
import { McpDemo } from "./mcp-demo"

/** A docs page's Markdown, with links, headings and code made for the site */
export function DocMarkdown({
    doc,
    lang,
    copyLabels,
    demos,
}: {
    doc: Doc
    lang: Locale
    copyLabels: { copy: string; copied: string }
    demos: DocsDemos
}) {
    // The demo named in a "<!-- demo: name -->" line
    const demoNamed = (name: string) => {
        if (name === "tour") return <DemoPlayer texts={demos.editor} tour />
        if (name === "mcp") return <McpDemo texts={demos.mcp} />
        if (name === "flowchart") {
            return (
                <DemoPlayer
                    texts={demos.flowchart}
                    scene={0}
                    diagram={FLOWCHART}
                />
            )
        }
        const scene = DEMO_SCENES[name]
        return scene === undefined ? null : (
            <DemoPlayer texts={demos.editor} scene={scene} />
        )
    }
    // Counted in page order, as the table of contents counted them
    const ids = new HeadingIds()
    const heading =
        (Tag: "h2" | "h3") =>
        ({ children }: { children?: ReactNode }) => {
            const id = ids.next(textOf(children))
            return (
                <Tag id={id} className="group scroll-mt-6">
                    {children}
                    <a
                        href={`#${id}`}
                        className="ml-2 inline-flex align-middle text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={textOf(children)}
                    >
                        <Link2 className="size-4" />
                    </a>
                </Tag>
            )
        }
    return (
        <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
                h2: heading("h2"),
                h3: heading("h3"),
                a: ({ href = "", children }) => {
                    const to = resolveDocLink(href, doc.repoPath, lang)
                    return to.startsWith("/") ? (
                        <Link href={to}>{children}</Link>
                    ) : (
                        <a href={to}>{children}</a>
                    )
                },
                img: ({ src, alt }) => (
                    // biome-ignore lint/performance/noImgElement: pictures from the docs, any size
                    <img
                        src={
                            typeof src === "string"
                                ? resolveDocLink(src, doc.repoPath, lang, true)
                                : undefined
                        }
                        alt={alt ?? ""}
                        className="rounded-lg border border-border bg-card p-4"
                    />
                ),
                pre: ({ children }) => {
                    const [code] = Children.toArray(children)
                    const demo =
                        isValidElement<{ className?: string }>(code) &&
                        code.props.className === "language-demo"
                            ? demoNamed(textOf(children).trim())
                            : null
                    if (demo) {
                        // On wide screens a demo takes the room beside the
                        // column too, so its diagram is larger
                        return (
                            <div className="not-prose my-7 min-[1400px]:-mx-10">
                                {demo}
                            </div>
                        )
                    }
                    return (
                        <div className="not-prose my-5">
                            <CopyCommand
                                command={textOf(children).replace(/\n$/, "")}
                                labels={copyLabels}
                                prompt=""
                            />
                        </div>
                    )
                },
                table: ({ children }) => (
                    <div className="not-prose my-6 overflow-x-auto rounded-lg border border-border">
                        <table className="docs-table w-full border-collapse text-[14px] leading-relaxed">
                            {children}
                        </table>
                    </div>
                ),
            }}
        >
            {doc.body.replace(DEMO_LINE, "```demo\n$1\n```")}
        </Markdown>
    )
}

/** The text inside rendered Markdown, for ids and copy buttons */
function textOf(node: ReactNode): string {
    return Children.toArray(node)
        .map((child) => {
            if (typeof child === "string" || typeof child === "number") {
                return String(child)
            }
            if (isValidElement<{ children?: ReactNode }>(child)) {
                return textOf(child.props.children)
            }
            return ""
        })
        .join("")
}
