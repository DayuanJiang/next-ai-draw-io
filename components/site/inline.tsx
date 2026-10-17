import { Fragment } from "react"

/** Page text with the parts in `backticks` shown as code */
export function Inline({ text }: { text: string }) {
    return text.split("`").map((part, i) =>
        i % 2 ? (
            <code
                key={i}
                className="rounded bg-muted px-1 py-px font-mono text-[0.88em] [font-variant-ligatures:none]"
            >
                {part}
            </code>
        ) : (
            <Fragment key={i}>{part}</Fragment>
        ),
    )
}
