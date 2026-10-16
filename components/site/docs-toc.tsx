"use client"

import { useEffect, useState } from "react"

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
        // The last heading that has scrolled past the top third of the window
        const update = () => {
            frame = 0
            let current = headings[0]?.id
            for (const { id } of headings) {
                const top = document
                    .getElementById(id)
                    ?.getBoundingClientRect().top
                if (top !== undefined && top < window.innerHeight * 0.3) {
                    current = id
                }
            }
            setActive(current)
        }
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(update)
        }
        update()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => {
            window.removeEventListener("scroll", onScroll)
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
