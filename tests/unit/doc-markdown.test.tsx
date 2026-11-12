import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { DocsDemos } from "@/components/site/demo-texts"
import { DocMarkdown } from "@/components/site/doc-markdown"
import type { Doc } from "@/lib/docs"

const render = (body: string) => {
    const doc: Doc = {
        file: "page",
        title: "Page",
        summary: "",
        body,
        locale: "en",
        repoPath: "docs/en/page.md",
        headings: [],
    }
    const html = renderToStaticMarkup(
        <DocMarkdown
            doc={doc}
            lang="en"
            copyLabels={{ copy: "Copy", copied: "Copied" }}
            // The page has no demo
            demos={{} as DocsDemos}
        />,
    )
    return new DOMParser().parseFromString(html, "text/html")
}

describe("a table in a docs page", () => {
    // On a phone the rows are blocks without the header row: a cell of a
    // wide table shows its column's name from data-label
    it("gives each cell after the first its column's name, from three columns", () => {
        const page = render(
            [
                "| Variable | Default | What it does |",
                "|---|---|---|",
                "| `PORT` | `6002` | Preview port |",
                "| `BROWSER` | unset | `none` does not open the preview |",
            ].join("\n"),
        )
        const rows = [...page.querySelectorAll("tbody tr")].map((row) =>
            [...row.querySelectorAll("td")].map((cell) =>
                cell.getAttribute("data-label"),
            ),
        )
        expect(rows).toEqual([
            [null, "Default", "What it does"],
            [null, "Default", "What it does"],
        ])
    })

    it("leaves a two-column table without names: its second cell follows the first", () => {
        const page = render(
            [
                "| Setting | What it does |",
                "|---|---|",
                "| Language | The interface language |",
            ].join("\n"),
        )
        expect(page.querySelectorAll("td")).toHaveLength(2)
        expect(page.querySelectorAll("[data-label]")).toHaveLength(0)
    })
})
