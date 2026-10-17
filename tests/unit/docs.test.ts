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
        expect(doc.summary).toMatch(/^The MCP server lets Claude Code/)
    })

    it("has every page in every language", () => {
        for (const file of DOCS_NAV.flatMap((group) => group.files)) {
            expect(loadDoc("zh", file).locale).toBe("zh")
            expect(loadDoc("ja", file).locale).toBe("ja")
            expect(loadDoc("zh-Hant", file).locale).toBe("zh-Hant")
        }
    })
})
