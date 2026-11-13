import type { Page } from "@playwright/test"
import { expect, test } from "./lib/fixtures"

/** The number of lines the text of an element is on */
const lineCount = (page: Page, selector: string, text: string) =>
    page
        .locator(selector, { hasText: text })
        .first()
        .evaluate((el) => {
            const range = document.createRange()
            range.selectNodeContents(el)
            return new Set(
                [...range.getClientRects()].map((r) => Math.round(r.top)),
            ).size
        })

/** Where the heading named in the address is, and where the pages bar ends */
const jumpTarget = (page: Page) =>
    page.evaluate(() => {
        const id = decodeURIComponent(location.hash.slice(1))
        const heading = document.getElementById(id)
        return {
            headingTop: heading?.getBoundingClientRect().top ?? -1,
            barBottom:
                document.querySelector("details")?.getBoundingClientRect()
                    .bottom ?? -1,
        }
    })

test.describe("Site pages on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

    test("a jump to a docs section stops below the pages bar", async ({
        page,
    }) => {
        await page.goto("/en/docs/claude-code#settings")
        await expect(page.locator("#settings")).toBeInViewport()
        const direct = await jumpTarget(page)
        expect(direct.barBottom).toBeGreaterThan(0)
        expect(direct.headingTop).toBeGreaterThanOrEqual(direct.barBottom)

        await test.step("from a link in another page, in Japanese", async () => {
            await page.goto("/ja/docs/mcp-clients")
            await page
                .locator('article a[href*="/docs/claude-code#"]')
                .first()
                .click()
            await page.waitForURL("**/ja/docs/claude-code#**")
            await expect(page.locator('[id="設定"]')).toBeInViewport()
            const linked = await jumpTarget(page)
            expect(linked.headingTop).toBeGreaterThanOrEqual(linked.barBottom)
        })
    })

    test("the language list opens above the docs' pages bar", async ({
        page,
    }) => {
        await page.goto("/ja/docs/claude-code")
        await page.locator("header button[aria-expanded]").first().click()
        // A real tap at the link's place: the bar must not take it
        const box = await page.locator('header a[hreflang="en"]').boundingBox()
        if (!box) throw new Error("the language list did not open")
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await page.waitForURL("**/en/docs/claude-code")
    })

    test("the pages bar lists the page's sections and closes by itself", async ({
        page,
    }) => {
        await page.goto("/en/docs/ai-providers")
        const bar = page.locator("details")
        const open = async () => {
            await bar.locator("summary").click()
            await expect(bar).toHaveAttribute("open", "")
        }

        await open()
        // In the page's left margin, below the open list
        await page.mouse.click(4, 820)
        await expect(bar).not.toHaveAttribute("open", "")

        await open()
        await page.keyboard.press("Escape")
        await expect(bar).not.toHaveAttribute("open", "")

        await open()
        await bar.locator('a[aria-current="page"]').click()
        await expect(bar).not.toHaveAttribute("open", "")

        await open()
        await bar.getByRole("link", { name: "Ollama (local)" }).click()
        await expect(bar).not.toHaveAttribute("open", "")
        await expect(page).toHaveURL(/#ollama-local$/)
        const target = await jumpTarget(page)
        expect(target.headingTop).toBeGreaterThanOrEqual(target.barBottom)
    })

    test("a docs table shows its rows as blocks, each cell under its column's name", async ({
        page,
    }) => {
        await page.goto("/ja/docs/claude-code")
        const row = page.locator("article tbody tr", {
            hasText: "DRAWIO_AUTO_SCREENSHOT",
        })
        // The variable's name is on one line (it was broken into six)
        expect(
            await lineCount(page, "article td code", "DRAWIO_AUTO_SCREENSHOT"),
        ).toBe(1)
        await expect(row.locator("td").nth(1)).toHaveAttribute(
            "data-label",
            "既定値",
        )
        expect(
            await row
                .locator("td")
                .nth(1)
                .evaluate((cell) => getComputedStyle(cell, "::before").content),
        ).toBe('"既定値"')
    })

    test("the gallery shows a diagram larger than the screen, to drag around", async ({
        page,
    }) => {
        await page.goto("/en/gallery")
        await page.getByRole("button", { name: /Customer journey map/ }).click()
        const diagram = page.getByRole("dialog").locator("img")
        await expect(diagram).toBeVisible()
        const { width } = (await diagram.boundingBox()) ?? { width: 0 }
        expect(width).toBeGreaterThan(700)
        // All of it can be reached, and the page behind stays put
        const area = diagram.locator("xpath=..")
        expect(
            await area.evaluate((el) => {
                el.scrollLeft = el.scrollWidth
                return el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
            }),
        ).toBe(true)
        expect(
            await page.evaluate(() => getComputedStyle(document.body).overflow),
        ).toBe("hidden")
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(0)
        expect(
            await page.evaluate(() => getComputedStyle(document.body).overflow),
        ).not.toBe("hidden")
    })

    test("the enlarged gallery diagram scrolls from the keyboard", async ({
        page,
    }) => {
        await page.goto("/en/gallery")
        await page.getByRole("button", { name: /Customer journey map/ }).click()
        const dialog = page.getByRole("dialog")
        const close = dialog.getByRole("button", { name: "Close" })
        const area = dialog.locator("img").locator("xpath=..")
        await expect(close).toBeFocused()
        // Once the picture has loaded, it is wider than its area
        await expect
            .poll(() => area.evaluate((el) => el.scrollWidth - el.clientWidth))
            .toBeGreaterThan(300)
        // Tab reaches the diagram's area, where the arrow keys scroll
        await page.keyboard.press("Tab")
        await expect(area).toBeFocused()
        await page.keyboard.press("ArrowRight")
        await expect
            .poll(() => area.evaluate((el) => el.scrollLeft))
            .toBeGreaterThan(0)
        // And back to the close button, never to the page behind
        await page.keyboard.press("Tab")
        await expect(close).toBeFocused()
    })

    test("the gallery's buttons keep their Japanese text on one line", async ({
        page,
    }) => {
        await page.goto("/ja/gallery")
        for (const text of ["このプロンプトを試す", "プロンプトをコピー"]) {
            const box = await page
                .locator("figure a, figure button", { hasText: text })
                .first()
                .boundingBox()
            // One line of text is 20 px high, plus the button's padding
            expect(box?.height).toBeLessThan(40)
        }
    })

    test("the pages list opens at the page being read and its sections", async ({
        page,
    }) => {
        // The last page of the list
        await page.goto("/en/docs/faq")
        const bar = page.locator("details")
        await bar.locator("summary").click()
        await expect(bar.locator('a[aria-current="page"]')).toBeInViewport({
            ratio: 1,
        })
        await expect(bar.locator('a[href^="#"]').first()).toBeInViewport({
            ratio: 1,
        })
    })
})

test.describe("Site pages on a desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test("the docs' table of contents marks the section that was clicked", async ({
        page,
    }) => {
        await page.goto("/en/docs/claude-code")
        const toc = page.locator("aside")
        const marked = toc.locator('a[aria-current="location"]')
        // Each section, the short ones and the last ones included
        for (const link of await toc.getByRole("link").all()) {
            await link.click()
            await expect(marked).toHaveText((await link.textContent()) ?? "")
        }

        await test.step("and follows the page when it scrolls", async () => {
            await page.evaluate(() => window.scrollTo(0, 0))
            await expect(marked).toHaveText("Install")
            await page.evaluate(() =>
                document.getElementById("settings")?.scrollIntoView(),
            )
            await expect(marked).toHaveText("Settings")
        })
    })

    test("the table of contents works with a mistyped # in the address, and in Japanese", async ({
        page,
    }) => {
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(error.message))
        const toc = page.locator("aside")
        const marked = toc.locator('a[aria-current="location"]')
        const toEnd = () =>
            page.evaluate(() =>
                window.scrollTo(0, document.documentElement.scrollHeight),
            )

        // "%" alone is no valid encoding
        await page.goto("/en/docs/claude-code#%")
        await toEnd()
        await expect(marked).toHaveText(
            (await toc.getByRole("link").last().textContent()) ?? "",
        )
        expect(errors).toEqual([])

        // The last sections are marked by the id in the address, which
        // holds a Japanese id encoded
        await page.goto("/ja/docs/claude-code")
        for (const link of await toc.getByRole("link").all()) {
            await link.click()
            await expect(marked).toHaveText((await link.textContent()) ?? "")
        }
    })

    test("a docs table keeps names and code whole and underlines its links", async ({
        page,
    }) => {
        await page.goto("/en/docs/claude-code")
        expect(
            await lineCount(page, "article td code", "DRAWIO_AUTO_SCREENSHOT"),
        ).toBe(1)

        await page.goto("/zh/docs")
        expect(
            await lineCount(page, "article td:first-child", "在浏览器里"),
        ).toBe(1)
        expect(
            await page
                .locator("article table a")
                .first()
                .evaluate((a) => getComputedStyle(a).textDecorationLine),
        ).toBe("underline")
    })

    test("a translated page has its metadata in its own language", async ({
        page,
    }) => {
        await page.goto("/ja/docs")
        const japanese = /[\u3040-\u30ff]/
        await expect(page.locator('meta[name="keywords"]')).toHaveAttribute(
            "content",
            japanese,
        )
        const app = JSON.parse(
            (await page
                .locator('head script[type="application/ld+json"]')
                .first()
                .textContent()) ?? "{}",
        )
        expect(app.inLanguage).toBe("ja")
        expect(app.description).toMatch(japanese)
        await expect(
            page.locator('section[aria-label*="alt+T"]'),
        ).toHaveAttribute("aria-label", /^通知/)
        await page.goto("/ja")
        await expect(
            page.locator('meta[property="og:image:alt"]'),
        ).toHaveAttribute("content", japanese)
    })

    test("landmarks have names, headings skip no level and code blocks take focus", async ({
        page,
    }) => {
        await page.goto("/en/gallery")
        // The header's links and the footer's languages
        const navs = page.locator("nav")
        await expect(navs).toHaveCount(2)
        for (const nav of await navs.all()) {
            await expect(nav).toHaveAttribute("aria-label", /\S/)
        }
        // The part above <main> is a region named by the page's headline
        await expect(
            page.getByRole("region", {
                name: (await page.locator("h1").textContent()) ?? "",
            }),
        ).toHaveCount(1)
        // The cards follow the h1
        await expect(page.locator("main figure h2").first()).toBeVisible()
        await expect(page.locator("main figure h3")).toHaveCount(0)

        await page.goto("/en/docs/ai-providers")
        await expect(page.locator("article pre").first()).toHaveAttribute(
            "tabindex",
            "0",
        )

        await page.goto("/en/nothing-here")
        await expect(page.locator("main h1")).toHaveCount(1)
    })
})

test.describe("Site pages on a tablet", () => {
    test.use({ viewport: { width: 820, height: 1180 } })

    test("the landing demo's step tabs cut no text", async ({ page }) => {
        await page.goto("/en/about")
        const tabs = page.locator("button", { hasText: "Edit by hand" })
        await expect(tabs.first()).toBeVisible()
        const cut = await page.evaluate(() =>
            [...document.querySelectorAll("button span.truncate")]
                .filter(
                    (s) =>
                        getComputedStyle(s).display !== "none" &&
                        s.scrollWidth > s.clientWidth + 1,
                )
                .map((s) => s.textContent),
        )
        expect(cut).toEqual([])
    })
})
