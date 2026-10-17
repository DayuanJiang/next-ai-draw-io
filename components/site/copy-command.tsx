"use client"

import { Check, Copy } from "lucide-react"
import { Fragment } from "react"
import { useCopy } from "@/lib/clipboard"

/**
 * A shell command, or a few lines of code or config, with a button that
 * copies it
 */
export function CopyCommand({
    command,
    labels,
    prompt = "$",
}: {
    command: string
    labels: { copy: string; copied: string }
    /** The shell prompt before a one-line command; "" for none */
    prompt?: string
}) {
    // Falls back to execCommand where the Clipboard API is missing (HTTP)
    const { copied, copy } = useCopy()
    const multiline = command.includes("\n")
    return (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-[#14181d] py-2.5 pr-2 pl-3.5 text-[#ececec] dark:bg-black/40">
            {multiline ? (
                <pre className="min-w-0 flex-1 overflow-x-auto py-0.5 font-mono text-[12px] leading-relaxed [font-variant-ligatures:none]">
                    <code>{command}</code>
                </pre>
            ) : (
                <code className="min-w-0 flex-1 py-0.5 font-mono text-[12px] leading-relaxed [font-variant-ligatures:none]">
                    {prompt && (
                        <span className="text-[#8a8c8d] select-none">
                            {prompt}{" "}
                        </span>
                    )}
                    {/* Wrap between words: browsers would also break at the
                        hyphens of --scope or mcp-server. A word longer than
                        the line, on a phone, still breaks inside. */}
                    {command.split(" ").map((word, i) => (
                        <Fragment key={`${i}-${word}`}>
                            {i > 0 && " "}
                            <span className="inline-block max-w-full [overflow-wrap:anywhere]">
                                {word}
                            </span>
                        </Fragment>
                    ))}
                </code>
            )}
            <button
                type="button"
                onClick={() => copy(command)}
                className="shrink-0 rounded-md p-1.5 text-[#a7a9aa] hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#ffd84d]"
                aria-label={copied ? labels.copied : labels.copy}
                title={copied ? labels.copied : labels.copy}
            >
                {copied ? (
                    <Check className="size-4" />
                ) : (
                    <Copy className="size-4" />
                )}
            </button>
        </div>
    )
}
