"use client"

import { useEffect, useState } from "react"

// A jump to a heading puts it 24 px below the top of the window
// (scroll-mt-6). A heading counts as reached a little below that, and above
// where a heading that directly follows it lands.
const REACHED = 48

/** A docs page's headings, with the section being read marked */
export function DocsToc({
    title,
    headings,
}: {
    title: string
    headings: { depth: 2 | 3; text: string; id: string }[]
}) {
    const [active, setActive] = useState(headings[0]?.id)

    useEffect(() => {
        let frame = 0
        const topOf = (id: string) =>
            document.getElementById(id)?.getBoundingClientRect().top
        // The last heading that has come up to the top of the window
        const update = () => {
            frame = 0
            let current = headings[0]?.id
            for (const { id } of headings) {
                const top = topOf(id)
                if (top !== undefined && top < REACHED) current = id
            }
            // The last headings cannot come up that far. At the end of the
            // page, the one a jump went to is marked while it is on the
            // screen, and the last one otherwise.
            if (
                window.scrollY > 0 &&
                window.innerHeight + window.scrollY >=
                    document.documentElement.scrollHeight - 1
            ) {
                // The address holds the id percent-encoded (a Japanese
                // heading's). The ids are encoded for the comparison:
                // decoding the address throws on a mistyped one ("#100%")
                const jumped = headings.find(
                    (h) => `#${encodeURIComponent(h.id)}` === location.hash,
                )
                const top = jumped && topOf(jumped.id)
                current =
                    jumped &&
                    top !== undefined &&
                    top >= 0 &&
                    top < window.innerHeight
                        ? jumped.id
                        : headings[headings.length - 1]?.id
            }
            setActive(current)
        }
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(update)
        }
        update()
        window.addEventListener("scroll", onScroll, { passive: true })
        // A jump to a heading may not scroll, at the end of the page
        window.addEventListener("hashchange", onScroll)
        return () => {
            window.removeEventListener("scroll", onScroll)
            window.removeEventListener("hashchange", onScroll)
            cancelAnimationFrame(frame)
        }
    }, [headings])

    if (headings.length === 0) return null
    return (
        <>
            <h2 className="mb-2 font-semibold">{title}</h2>
            <ul className="space-y-0.5">
                {headings.map((h) => (
                    <li key={h.id}>
                        {/* The section being read: text color and a tint */}
                        <a
                            href={`#${h.id}`}
                            aria-current={
                                h.id === active ? "location" : undefined
                            }
                            className={`block rounded-md py-1 pr-2 ${h.depth === 3 ? "pl-5" : "pl-2"} ${
                                h.id === active
                                    ? "bg-foreground/[0.05] font-medium text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {h.text}
                        </a>
                    </li>
                ))}
            </ul>
        </>
    )
}
