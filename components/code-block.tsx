"use client"

import { Highlight, themes } from "prism-react-renderer"
import { useSettingsStore } from "@/stores/settings-store"

interface CodeBlockProps {
    code: string
    language?: "xml" | "json"
}

export function CodeBlock({ code, language = "xml" }: CodeBlockProps) {
    // The code sits on the panel's own background: the light theme's dark
    // blue tag names and grey punctuation can't be read on the dark one
    const isDark = useSettingsStore((s) => s.isDark)
    return (
        <div className="overflow-hidden w-full">
            <Highlight
                theme={isDark ? themes.vsDark : themes.github}
                code={code}
                language={language}
            >
                {({
                    className: _className,
                    style,
                    tokens,
                    getLineProps,
                    getTokenProps,
                }) => (
                    <pre
                        className="text-[11px] leading-relaxed overflow-x-auto overflow-y-auto max-h-48 scrollbar-thin break-all"
                        style={{
                            ...style,
                            fontFamily:
                                "var(--font-mono), ui-monospace, monospace",
                            backgroundColor: "transparent",
                            margin: 0,
                            padding: 0,
                            wordBreak: "break-all",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {tokens.map((line, i) => (
                            <div
                                key={i}
                                {...getLineProps({ line })}
                                style={{ wordBreak: "break-all" }}
                            >
                                {line.map((token, key) => (
                                    <span
                                        key={key}
                                        {...getTokenProps({ token })}
                                    />
                                ))}
                            </div>
                        ))}
                    </pre>
                )}
            </Highlight>
        </div>
    )
}
