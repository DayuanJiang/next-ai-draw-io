import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getAssetUrl } from "@/lib/base-path"
import type { Locale } from "@/lib/i18n/config"

/*
 * The docs pages are the Markdown files in docs/<folder>/, the same files
 * GitHub shows. A page's slug is its file name in lower case; the
 * introduction is the docs' home page. A page missing in a language falls
 * back to English.
 */

// The folder of each language; a page missing in Traditional Chinese falls
// back to the Simplified one
const FOLDERS: Record<Locale, string[]> = {
    en: ["en"],
    zh: ["cn", "en"],
    ja: ["ja", "en"],
    "zh-Hant": ["tw", "cn", "en"],
}

const FOLDER_LOCALE: Record<string, Locale> = {
    en: "en",
    cn: "zh",
    ja: "ja",
    tw: "zh-Hant",
}

export const DOCS_NAV: { group: Record<Locale, string>; files: string[] }[] = [
    {
        group: {
            en: "Getting started",
            zh: "入门",
            ja: "はじめに",
            "zh-Hant": "入門",
        },
        files: ["introduction", "claude-code", "mcp-clients"],
    },
    {
        group: {
            en: "Using the editor",
            zh: "使用编辑器",
            ja: "エディタの使い方",
            "zh-Hant": "使用編輯器",
        },
        files: [
            "editor",
            "versions",
            "settings",
            "aws-architecture",
            "flowcharts",
        ],
    },
    {
        group: {
            en: "Self-hosting",
            zh: "自行部署",
            ja: "セルフホスト",
            "zh-Hant": "自行架設",
        },
        files: [
            "ai-providers",
            "docker",
            "offline-deployment",
            "cloudflare-deploy",
            "admin-panel",
        ],
    },
    {
        group: { en: "Help", zh: "帮助", ja: "ヘルプ", "zh-Hant": "說明" },
        files: ["FAQ"],
    },
]

const FILES = DOCS_NAV.flatMap((group) => group.files)

/** The URL path of a docs file, after /<lang> */
export function docsPath(file: string): string {
    return file === "introduction" ? "/docs" : `/docs/${file.toLowerCase()}`
}

export function fileOfSlug(slug: string | undefined): string | undefined {
    if (!slug) return "introduction"
    return FILES.find((file) => file.toLowerCase() === slug)
}

export const DOCS_SLUGS = FILES.map((file) =>
    file === "introduction" ? undefined : file.toLowerCase(),
)

export type Doc = {
    file: string
    title: string
    /** The first paragraph, for the description */
    summary: string
    /** The Markdown after the title */
    body: string
    /** The language the text is in, which can be English for a fallback */
    locale: Locale
    /** The file in the repository, for the edit link */
    repoPath: string
    headings: { depth: 2 | 3; text: string; id: string }[]
}

export function loadDoc(lang: Locale, file: string): Doc {
    const folder =
        FOLDERS[lang].find((f) =>
            existsSync(join(process.cwd(), "docs", f, `${file}.md`)),
        ) ?? "en"
    const repoPath = `docs/${folder}/${file}.md`
    const source = readFileSync(join(process.cwd(), repoPath), "utf8")
    const titleMatch = source.match(/^#\s+(.+)$/m)
    const title = titleMatch ? plain(titleMatch[1]) : file
    const body = titleMatch
        ? source.slice((titleMatch.index ?? 0) + titleMatch[0].length)
        : source
    return {
        file,
        title,
        summary: plain(firstParagraph(body)),
        body,
        locale: FOLDER_LOCALE[folder],
        repoPath,
        headings: headingsOf(body),
    }
}

function firstParagraph(markdown: string): string {
    for (const block of withoutCode(markdown).split(/\n\s*\n/)) {
        const text = block.trim()
        if (text && !/^[#>|!\-*\d<]/.test(text)) return text.replace(/\n/g, " ")
    }
    return ""
}

// Fenced code blocks, which can hold lines starting with #
function withoutCode(markdown: string): string {
    return markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, "")
}

function headingsOf(markdown: string): Doc["headings"] {
    const ids = new HeadingIds()
    return [...withoutCode(markdown).matchAll(/^(#{2,3})\s+(.+)$/gm)].map(
        ([, hashes, raw]) => {
            const text = plain(raw)
            return { depth: hashes.length as 2 | 3, text, id: ids.next(text) }
        },
    )
}

/** Markdown inline syntax taken out: code, emphasis, links */
export function plain(markdown: string): string {
    return (
        markdown
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
            .replace(/`/g, "")
            // Emphasis markers only: DRAWIO_LANG keeps its underscore
            .replace(/(\*\*|__)(.+?)\1/g, "$2")
            .replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, "$1$2")
            .trim()
    )
}

/**
 * Heading ids like GitHub's: lower case, punctuation removed, spaces as
 * hyphens, and -1, -2 on repeats. The page and its table of contents each
 * count with one of these.
 */
export class HeadingIds {
    private seen = new Map<string, number>()
    next(text: string): string {
        const base = text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, "")
            .trim()
            .replace(/\s/g, "-")
        const count = this.seen.get(base) ?? 0
        this.seen.set(base, count + 1)
        return count ? `${base}-${count}` : base
    }
}

const BLOB = "https://github.com/DayuanJiang/next-ai-draw-io/blob/main"
const RAW = "https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main"

/**
 * Where a link in a docs file goes on the site: another docs page, or the
 * file on GitHub. `repoPath` is the file the link is in.
 */
export function resolveDocLink(
    href: string,
    repoPath: string,
    lang: Locale,
    image = false,
): string {
    if (/^([a-z]+:|#|\/\/)/i.test(href)) return href
    const [path, hash] = href.split("#")
    const dir = repoPath.split("/").slice(0, -1)
    const parts = [...dir]
    for (const part of path.split("/")) {
        if (part === "..") parts.pop()
        else if (part && part !== ".") parts.push(part)
    }
    const target = parts.join("/")
    // Pictures in public/ are on the site itself
    if (image && target.startsWith("public/")) {
        return getAssetUrl(`/${target.slice("public/".length)}`)
    }
    const docs = target.match(/^docs\/(?:en|cn|ja|tw)\/([^/]+)\.md$/)
    const file = docs && FILES.find((f) => f === docs[1])
    if (file) return `/${lang}${docsPath(file)}${hash ? `#${hash}` : ""}`
    return `${image ? RAW : BLOB}/${target}${hash ? `#${hash}` : ""}`
}
