"use client"

import { Check, Copy, Maximize2, SquarePen, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import Image from "@/components/image-with-basepath"
import { useCopy } from "@/lib/clipboard"
import type { Locale } from "@/lib/i18n/config"
import {
    GALLERY_CATEGORIES,
    GALLERY_ITEMS,
    GALLERY_TEXTS,
    type GalleryCategory,
    type GalleryItem,
} from "./gallery-items"

/** The gallery page: a filter by kind, the cards, and one diagram enlarged */
export function Gallery({ lang }: { lang: Locale }) {
    const t = GALLERY_TEXTS[lang]
    const [category, setCategory] = useState<GalleryCategory | null>(null)
    const [open, setOpen] = useState<GalleryItem | null>(null)
    const items = category
        ? GALLERY_ITEMS.filter((item) => item.category === category)
        : GALLERY_ITEMS
    const chip = (active: boolean) =>
        `rounded-full border px-3 py-1 text-[13px] focus-visible:outline-2 focus-visible:outline-ring ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`

    return (
        <div>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setCategory(null)}
                    className={chip(category === null)}
                    aria-pressed={category === null}
                >
                    {t.all}
                </button>
                {GALLERY_CATEGORIES.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategory(c.id)}
                        className={chip(category === c.id)}
                        aria-pressed={category === c.id}
                    >
                        {c.label[lang]}
                    </button>
                ))}
            </div>
            <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                    <li key={item.id}>
                        <Card
                            item={item}
                            lang={lang}
                            onOpen={() => setOpen(item)}
                        />
                    </li>
                ))}
            </ul>
            {open && (
                <Enlarged
                    item={open}
                    lang={lang}
                    onClose={() => setOpen(null)}
                />
            )}
        </div>
    )
}

function Card({
    item,
    lang,
    onOpen,
}: {
    item: GalleryItem
    lang: Locale
    onOpen: () => void
}) {
    const t = GALLERY_TEXTS[lang]
    const category = GALLERY_CATEGORIES.find((c) => c.id === item.category)
    return (
        <figure className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
            <button
                type="button"
                onClick={onOpen}
                className="group lp-grid relative flex h-[230px] items-center justify-center border-b border-border p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                aria-label={`${t.enlarge}: ${item.title[lang]}`}
            >
                <Image
                    src={item.src}
                    alt={item.title[lang]}
                    width={480}
                    height={360}
                    className="max-h-full w-auto max-w-full object-contain"
                />
                <span className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground opacity-0 shadow-sm group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Maximize2 className="size-3.5" />
                </span>
            </button>
            <figcaption className="flex flex-1 flex-col px-4 pt-3.5 pb-4">
                <span className="flex flex-wrap gap-1.5 text-[11.5px] text-muted-foreground">
                    <span className="rounded-md bg-muted px-1.5 py-0.5">
                        {category?.label[lang]}
                    </span>
                    <span className="rounded-md bg-marker-soft px-1.5 py-0.5 text-marker-ink">
                        {item.model}
                    </span>
                </span>
                <h3 className="mt-2 text-[15px] leading-snug font-semibold">
                    {item.title[lang]}
                </h3>
                <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-muted-foreground">
                    <span className="sr-only">{t.prompt}: </span>
                    <span lang="en">{item.prompt}</span>
                    {item.attachment && (
                        <span className="mt-1 block text-[12.5px]">
                            {t.fromFile}
                        </span>
                    )}
                </p>
                <Actions item={item} lang={lang} />
            </figcaption>
        </figure>
    )
}

/** Copy the prompt, or open the editor with it in the chat input */
function Actions({ item, lang }: { item: GalleryItem; lang: Locale }) {
    const t = GALLERY_TEXTS[lang]
    const { copied, copy } = useCopy()
    return (
        <div className="mt-3 flex items-center gap-2">
            {!item.attachment && (
                <Link
                    href={`/${lang}?prompt=${encodeURIComponent(item.prompt)}`}
                    // The editor is large: load it only when asked
                    prefetch={false}
                    // The editor takes the prompt out of the address, which
                    // search engines report as a redirect: keep them out
                    rel="nofollow"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[13px] font-medium text-background"
                >
                    <SquarePen className="size-3.5" />
                    {t.tryPrompt}
                </Link>
            )}
            <button
                type="button"
                onClick={() => copy(item.prompt)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
                {copied ? (
                    <Check className="size-3.5" />
                ) : (
                    <Copy className="size-3.5" />
                )}
                {copied ? t.copied : t.copy}
            </button>
        </div>
    )
}

/** One diagram as large as the window allows; Escape or a click outside closes it */
function Enlarged({
    item,
    lang,
    onClose,
}: {
    item: GalleryItem
    lang: Locale
    onClose: () => void
}) {
    const t = GALLERY_TEXTS[lang]
    const close = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        // Focus moves into the dialog and back to the card when it closes
        const before = document.activeElement as HTMLElement | null
        close.current?.focus()
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose()
        }
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("keydown", onKey)
            before?.focus()
        }
    }, [onClose])
    return (
        // A click on the dim area outside the diagram closes it
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 md:p-8"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
            role="presentation"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={item.title[lang]}
                className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]"
            >
                <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
                    <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                        {item.title[lang]}
                    </h3>
                    <button
                        ref={close}
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        aria-label={t.close}
                        title={t.close}
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <div className="lp-grid flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 md:p-6">
                    <Image
                        src={item.src}
                        alt={item.title[lang]}
                        width={1200}
                        height={900}
                        className="max-h-[78vh] w-auto max-w-full object-contain"
                    />
                </div>
            </div>
        </div>
    )
}
