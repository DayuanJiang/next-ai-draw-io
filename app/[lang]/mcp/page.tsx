import "@/components/site/site.css"
import type { Metadata } from "next"
import Link from "next/link"
import { CopyCommand } from "@/components/site/copy-command"
import { Inline } from "@/components/site/inline"
import { JsonLd } from "@/components/site/json-ld"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import {
    GITHUB_URL,
    MCP_INSTALL,
    NPM_URL,
    SITE_TEXTS,
} from "@/components/site/site-texts"
import { getAssetUrl } from "@/lib/base-path"
import type { Locale } from "@/lib/i18n/config"
import { hasLocale } from "@/lib/i18n/dictionaries"
import { localeAlternates, OG_IMAGE, OG_LOCALE, SITE_URL } from "@/lib/seo"
import { type InstallTab, InstallTabs } from "./install-tabs"
import { TEXTS } from "./texts"

const PACKAGE = "npx @next-ai-drawio/mcp-server@latest"

const CODEX_TOML = `[mcp_servers.drawio]
command = "npx"
args = ["@next-ai-drawio/mcp-server@latest"]
default_tools_approval_mode = "approve"`

const VSCODE_JSON = `{
  "servers": {
    "drawio": { "type": "stdio", "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}`

const OTHERS_JSON = `{
  "mcpServers": {
    "drawio": { "command": "npx", "args": ["@next-ai-drawio/mcp-server@latest"] }
  }
}`

// The servers' pages, in the order of the comparison rows, as linked from
// the MCP server README
const COMPARE_LINKS = [
    NPM_URL,
    "https://github.com/jgraph/drawio-mcp",
    undefined,
    undefined,
    "https://github.com/lgazo/drawio-mcp-server",
]

// The tools, in the order of their texts
const TOOLS = [
    ["start_session"],
    ["create_new_diagram"],
    ["edit_diagram"],
    ["get_diagram"],
    ["get_selection"],
    ["screenshot_diagram"],
    ["load_diagram", "export_diagram"],
    ["restore_version"],
    ["list_saved_diagrams"],
    ["get_drawing_guide", "get_shape_library"],
    ["list_pages", "add_page", "rename_page", "delete_page"],
]

const README_URL = `${GITHUB_URL}/tree/main/packages/mcp-server#readme`

type Props = { params: Promise<{ lang: string }> }

function localeOf(lang: string): Locale {
    return hasLocale(lang) ? lang : "en"
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const locale = localeOf((await params).lang)
    const t = TEXTS[locale]
    return {
        title: `${t.title} | Next AI Draw.io`,
        description: t.description,
        keywords: t.keywords,
        alternates: localeAlternates(locale, "/mcp"),
        openGraph: {
            title: t.title,
            description: t.description,
            type: "website",
            url: `/${locale}/mcp`,
            siteName: "Next AI Draw.io",
            locale: OG_LOCALE[locale],
            images: [{ ...OG_IMAGE, alt: t.title }],
        },
        twitter: {
            card: "summary_large_image",
            title: t.title,
            description: t.description,
            images: [OG_IMAGE.url],
        },
    }
}

export default async function Mcp({ params }: Props) {
    const lang = localeOf((await params).lang)
    const t = TEXTS[lang]
    const copy = SITE_TEXTS[lang].copy
    const tabs: InstallTab[] = [
        {
            id: "claude",
            label: t.tabs.claude,
            items: [
                { code: MCP_INSTALL },
                { note: t.notes.claudeScope },
                { note: t.notes.claudePlugin },
                {
                    code: "/plugin install next-ai-drawio --marketplace anthropics/claude-plugins-community",
                },
            ],
        },
        {
            id: "codex",
            label: t.tabs.codex,
            items: [
                { code: `codex mcp add drawio -- ${PACKAGE}` },
                { note: t.notes.codexApproval },
                { code: CODEX_TOML },
                { note: t.notes.codexSome },
            ],
        },
        {
            id: "vscode",
            label: t.tabs.vscode,
            items: [{ note: t.notes.vscode }, { code: VSCODE_JSON }],
        },
        {
            id: "others",
            label: t.tabs.others,
            items: [{ note: t.notes.others }, { code: OTHERS_JSON }],
        },
        {
            id: "agent",
            label: t.tabs.agent,
            items: [{ note: t.notes.agent }, { code: t.agentPrompt }],
        },
    ]
    const h2 = "text-[22px] font-semibold tracking-[-0.02em]"
    const th =
        "border-b border-border px-4 py-2.5 text-left text-[13px] font-semibold"
    const td = "border-b border-border px-4 py-3 align-top"

    return (
        <div className="site min-h-screen bg-canvas text-foreground">
            <JsonLd
                data={{
                    "@context": "https://schema.org",
                    "@type": "SoftwareApplication",
                    name: "Next AI Draw.io MCP Server",
                    alternateName: "@next-ai-drawio/mcp-server",
                    applicationCategory: "DeveloperApplication",
                    operatingSystem: "Windows, macOS, Linux",
                    softwareRequirements: "Node.js 18 or later",
                    description: t.description,
                    url: `${SITE_URL}/${lang}/mcp`,
                    downloadUrl: NPM_URL,
                    license: "https://www.apache.org/licenses/LICENSE-2.0",
                    isAccessibleForFree: true,
                    offers: {
                        "@type": "Offer",
                        price: "0",
                        priceCurrency: "USD",
                    },
                    sameAs: [README_URL, NPM_URL],
                    inLanguage: lang,
                }}
            />
            <div className="lp-grid border-b border-border">
                <SiteHeader lang={lang} current="mcp" />
                <section className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-12 px-8 pt-8 pb-16">
                    <div>
                        <h1 className="text-[clamp(32px,3.2vw,44px)] leading-[1.1] font-semibold tracking-[-0.03em] [text-wrap:balance]">
                            {t.h1}
                        </h1>
                        <p className="mt-5 max-w-[36em] text-[15.5px] leading-relaxed text-muted-foreground">
                            {t.lede}
                        </p>
                        <div className="mt-7 max-w-[34rem]">
                            <CopyCommand command={MCP_INSTALL} labels={copy} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-5 text-[14.5px] font-medium">
                            <a
                                href="#install"
                                className="underline decoration-border underline-offset-4 hover:decoration-foreground"
                            >
                                {t.otherClients}
                            </a>
                            <a
                                href={NPM_URL}
                                className="underline decoration-border underline-offset-4 hover:decoration-foreground"
                            >
                                {t.npm}
                            </a>
                        </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border bg-black shadow-[0_30px_80px_-40px_rgba(20,24,29,0.55)]">
                        <video
                            src={getAssetUrl("/mcp-promo.mp4")}
                            poster={getAssetUrl("/mcp-promo-poster.jpg")}
                            autoPlay
                            muted
                            loop
                            playsInline
                            controls
                            preload="metadata"
                            aria-label={t.video}
                            className="aspect-video w-full"
                        />
                    </div>
                </section>
            </div>

            <main>
                <section
                    id="install"
                    className="mx-auto max-w-7xl scroll-mt-4 px-8 py-16"
                >
                    <h2 className={h2}>{t.installHeading}</h2>
                    <div className="mt-6 max-w-4xl">
                        <InstallTabs tabs={tabs} labels={copy} />
                        <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
                            {t.afterInstall}
                        </p>
                    </div>
                </section>

                <section className="border-y border-border bg-card">
                    <div className="mx-auto max-w-7xl px-8 py-16">
                        <h2 className={h2}>{t.featuresHeading}</h2>
                        <div className="mt-8 grid grid-cols-3 gap-x-12 gap-y-9">
                            {t.features.map((item) => (
                                <div key={item.title}>
                                    <h3 className="text-[15.5px] font-semibold">
                                        {item.title}
                                    </h3>
                                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
                                        <Inline text={item.text} />
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-7xl px-8 py-16">
                    <h2 className={h2}>{t.compareHeading}</h2>
                    <p className="mt-2 text-[15px] text-muted-foreground">
                        {t.compareIntro}
                    </p>
                    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
                        <table className="w-full border-collapse text-[14px] leading-relaxed">
                            <thead className="bg-canvas">
                                <tr>
                                    {t.compareColumns.map((column) => (
                                        <th key={column} className={th}>
                                            {column}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="[&>tr:last-child>td]:border-b-0">
                                {t.compareRows.map((row, i) => (
                                    <tr
                                        key={row.server}
                                        className={
                                            i === 0 ? "bg-marker-soft/40" : ""
                                        }
                                    >
                                        <td
                                            className={`${td} w-[24%] font-medium`}
                                        >
                                            {COMPARE_LINKS[i] ? (
                                                <a
                                                    href={COMPARE_LINKS[i]}
                                                    className="hover:underline"
                                                >
                                                    <Inline text={row.server} />
                                                </a>
                                            ) : (
                                                <Inline text={row.server} />
                                            )}
                                        </td>
                                        <td
                                            className={`${td} text-muted-foreground`}
                                        >
                                            <Inline text={row.how} />
                                        </td>
                                        <td className={`${td} w-[26%]`}>
                                            {row.fit}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="mx-auto max-w-7xl px-8 pb-16">
                    <h2 className={h2}>{t.toolsHeading}</h2>
                    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
                        <table className="w-full border-collapse text-[14px] leading-relaxed">
                            <thead className="bg-canvas">
                                <tr>
                                    {t.toolsColumns.map((column) => (
                                        <th key={column} className={th}>
                                            {column}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="[&>tr:last-child>td]:border-b-0">
                                {TOOLS.map((names, i) => (
                                    <tr key={names[0]}>
                                        <td className={`${td} w-[36%]`}>
                                            <span className="flex flex-wrap gap-1.5">
                                                {names.map((name) => (
                                                    <code
                                                        key={name}
                                                        className="rounded bg-muted px-1.5 py-px font-mono text-[12.5px] [font-variant-ligatures:none]"
                                                    >
                                                        {name}
                                                    </code>
                                                ))}
                                            </span>
                                        </td>
                                        <td
                                            className={`${td} text-muted-foreground`}
                                        >
                                            <Inline text={t.tools[i]} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="border-t border-border bg-card">
                    <div className="mx-auto max-w-7xl px-8 py-14">
                        <h2 className={h2}>{t.moreHeading}</h2>
                        <p className="mt-2 max-w-[48em] text-[15px] leading-relaxed text-muted-foreground">
                            {t.moreText}
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <Link
                                href={`/${lang}/docs/claude-code`}
                                className="rounded-lg bg-foreground px-4.5 py-2.5 text-[14.5px] font-medium text-background"
                            >
                                {t.moreDocs}
                            </Link>
                            <a
                                href={README_URL}
                                className="rounded-lg border border-border bg-canvas px-4.5 py-2.5 text-[14.5px] font-medium hover:bg-muted"
                            >
                                {t.moreReadme}
                            </a>
                        </div>
                    </div>
                </section>
            </main>

            <SiteFooter lang={lang} path="/mcp" />
        </div>
    )
}
