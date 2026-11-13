import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
    DOCS_NAV,
    docsPath,
    fileOfSlug,
    HeadingIds,
    loadDoc,
    plain,
    resolveDocLink,
} from "@/lib/docs"
import { PROVIDER_NAMES, PROVIDERS } from "@/lib/providers"

describe("resolveDocLink", () => {
    it("turns a link to another docs file into its page", () => {
        expect(
            resolveDocLink("./ai-providers.md", "docs/en/docker.md", "ja"),
        ).toBe("/ja/docs/ai-providers")
        expect(
            resolveDocLink("./FAQ.md#install", "docs/cn/docker.md", "zh"),
        ).toBe("/zh/docs/faq#install")
        expect(
            resolveDocLink("./editor.md", "docs/tw/versions.md", "zh-Hant"),
        ).toBe("/zh-Hant/docs/editor")
    })

    it("sends other repository files to GitHub", () => {
        expect(
            resolveDocLink(
                "../../packages/mcp-server/README.md#configuration",
                "docs/en/claude-code.md",
                "en",
            ),
        ).toBe(
            "https://github.com/DayuanJiang/next-ai-draw-io/blob/main/packages/mcp-server/README.md#configuration",
        )
    })

    it("shows pictures from public/ from the site", () => {
        expect(
            resolveDocLink(
                "../../public/auth.svg",
                "docs/en/aws-architecture.md",
                "en",
                true,
            ),
        ).toBe("/auth.svg")
    })

    it("keeps web addresses and anchors", () => {
        expect(
            resolveDocLink("https://example.com/a", "docs/en/x.md", "en"),
        ).toBe("https://example.com/a")
        expect(resolveDocLink("#install", "docs/en/x.md", "en")).toBe(
            "#install",
        )
    })
})

describe("HeadingIds", () => {
    it("makes ids like GitHub and numbers repeats", () => {
        const ids = new HeadingIds()
        expect(ids.next("Install by hand")).toBe("install-by-hand")
        expect(ids.next("Doubao (ByteDance Volcengine)")).toBe(
            "doubao-bytedance-volcengine",
        )
        expect(ids.next("Install by hand")).toBe("install-by-hand-1")
        expect(ids.next("使用 Docker 运行")).toBe("使用-docker-运行")
    })
})

describe("plain", () => {
    it("takes out code, emphasis and links but keeps underscores in words", () => {
        expect(plain("Set `DRAWIO_LANG` for **all** [pages](./x.md)")).toBe(
            "Set DRAWIO_LANG for all pages",
        )
    })
})

describe("docs files", () => {
    it("has a file for every page, with its title and table of contents", () => {
        for (const file of DOCS_NAV.flatMap((group) => group.files)) {
            const doc = loadDoc("en", file)
            expect(doc.title).not.toBe(file)
            expect(fileOfSlug(docsPath(file).split("/")[2])).toBe(file)
        }
        const doc = loadDoc("en", "claude-code")
        expect(doc.headings[0]).toEqual({
            depth: 2,
            text: "Install",
            id: "install",
        })
        expect(doc.summary).toMatch(
            /^Add the draw.io MCP server to Claude Code/,
        )
    })

    it("has every page in every language", () => {
        for (const file of DOCS_NAV.flatMap((group) => group.files)) {
            expect(loadDoc("zh", file).locale).toBe("zh")
            expect(loadDoc("ja", file).locale).toBe("ja")
            expect(loadDoc("zh-Hant", file).locale).toBe("zh-Hant")
        }
    })

    // A link to a section of another page: "./claude-code.md#settings"
    it("links to the same sections in every language, by ids those pages have", () => {
        const sectionLinks = (folder: string, file: string) =>
            [
                ...readFileSync(`docs/${folder}/${file}.md`, "utf8").matchAll(
                    /\]\(\.\/([\w-]+)\.md#([^)]+)\)/g,
                ),
            ].map(([, page, id]) => ({ page, id }))
        for (const file of DOCS_NAV.flatMap((group) => group.files)) {
            const english = sectionLinks("en", file).map((link) => link.page)
            for (const [folder, lang] of [
                ["cn", "zh"],
                ["ja", "ja"],
                ["tw", "zh-Hant"],
            ] as const) {
                const links = sectionLinks(folder, file)
                expect(
                    links.map((link) => link.page),
                    `${folder}/${file}`,
                ).toEqual(english)
                for (const { page, id } of links) {
                    expect(
                        loadDoc(lang, page).headings.map((h) => h.id),
                        `${folder}/${file}`,
                    ).toContain(id)
                }
            }
        }
    })
})

describe("the AI providers page", () => {
    const pages = ["en", "cn", "ja", "tw"].map((folder) =>
        readFileSync(`docs/${folder}/ai-providers.md`, "utf8"),
    )

    // env.example ships with AI_PROVIDER=bedrock, which wins over the key the
    // reader sets for another provider
    it("tells the reader of the first steps about the template's AI_PROVIDER line", () => {
        expect(readFileSync("env.example", "utf8")).toMatch(
            /^AI_PROVIDER=bedrock$/m,
        )
        for (const page of pages) {
            const steps = page.split(/^## /m)[1]
            expect(steps).toContain("AI_PROVIDER=bedrock")
        }
    })

    // The server detects a provider from its API key; these have none
    it("sets AI_PROVIDER in the example of every provider without an API key", () => {
        const keyless = PROVIDER_NAMES.filter(
            (name) =>
                !["apiKey", "vertexKey"].includes(PROVIDERS[name].credential),
        )
        expect(keyless).toContain("bedrock")
        for (const page of pages) {
            for (const name of keyless) {
                expect(page).toMatch(new RegExp(`^AI_PROVIDER=${name}$`, "m"))
            }
        }
    })
})

describe("the READMEs", () => {
    // "Add a new provider" asks for the count in the three READMEs to be
    // updated; each gives it three times
    it("give the number of providers the app has, wherever they give one", () => {
        const counts = [
            "README.md",
            "docs/cn/README_CN.md",
            "docs/ja/README_JA.md",
        ].flatMap((file) =>
            [
                ...readFileSync(file, "utf8").matchAll(
                    /(\d+) (?:(?:model )?providers|家|の?(?:モデル)?プロバイダー)/g,
                ),
            ].map(([, count]) => `${file}: ${count}`),
        )
        expect(counts).toHaveLength(9)
        expect(
            counts.filter((c) => !c.endsWith(`: ${PROVIDER_NAMES.length}`)),
        ).toEqual([])
    })
})
