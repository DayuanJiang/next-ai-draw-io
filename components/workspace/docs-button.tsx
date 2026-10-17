"use client"

import { BookOpen } from "lucide-react"
import Link from "next/link"
import {
    ButtonTooltip,
    iconButtonClass,
} from "@/components/workspace/icon-button"
import { useDictionary } from "@/hooks/use-dictionary"
import { usePathLocale } from "@/hooks/use-path-locale"

/** Opens the docs in the editor's language, in a new tab */
export function DocsButton() {
    const label = useDictionary().nav.docs
    const lang = usePathLocale()
    return (
        <ButtonTooltip label={label}>
            <Link
                href={`/${lang}/docs`}
                target="_blank"
                // A new tab loads the page itself: nothing to prefetch
                prefetch={false}
                aria-label={label}
                className={iconButtonClass}
                data-testid="docs-button"
            >
                <BookOpen />
            </Link>
        </ButtonTooltip>
    )
}
