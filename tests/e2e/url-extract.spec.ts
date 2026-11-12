import type { Page } from "@playwright/test"
import { expect, openApp, test } from "./lib/fixtures"

const urlField = (page: Page) =>
    page.getByPlaceholder("https://example.com/article")

async function openUrlDialog(
    page: Page,
    add = "Add",
    item = "Extract from URL",
) {
    await page.getByRole("button", { name: add, exact: true }).click()
    await page.getByText(item).click()
    await expect(urlField(page)).toBeVisible()
}

test.describe("Extract from URL", () => {
    test("a failure is explained in the page's language", async ({ page }) => {
        // What the server answers for a mistyped domain
        await page.route("**/api/parse-url", (route) =>
            route.fulfill({
                status: 400,
                json: {
                    error: "Could not find this website",
                    code: "not_found",
                },
            }),
        )
        await openApp(page, { path: "/zh" })
        await openUrlDialog(page, "添加", "从 URL 提取")
        await urlField(page).fill("https://exmaple-typo.com/article")
        await page.getByRole("button", { name: "提取", exact: true }).click()
        // In the dialog, under the address, where it stays
        const reason = page
            .getByRole("dialog")
            .getByText("找不到这个网站，请检查网址。")
        await expect(reason).toBeVisible()
        await expect(page.getByText("Could not find")).toHaveCount(0)
        // Still open, with the link to correct
        await expect(urlField(page)).toHaveValue(
            "https://exmaple-typo.com/article",
        )
        await urlField(page).fill("https://example.com/article")
        await expect(reason).toHaveCount(0)
    })

    test("a link typed without https:// is read, and the next opening is empty", async ({
        page,
    }) => {
        const asked: string[] = []
        await page.route("**/api/parse-url", (route) => {
            asked.push(route.request().postDataJSON().url)
            return route.fulfill({
                status: 200,
                json: { title: "Spec", content: "text", charCount: 4 },
            })
        })
        await openApp(page)
        await openUrlDialog(page)
        // Chrome's URL would take this as the host name of an https link
        await urlField(page).fill("not an address")
        await urlField(page).press("Enter")
        await expect(page.getByText("Invalid URL format")).toBeVisible()
        expect(asked).toEqual([])
        await urlField(page).fill("example.com/spec")
        await urlField(page).press("Enter")
        await expect(page.getByText("Spec", { exact: true })).toBeVisible()
        expect(asked).toEqual(["https://example.com/spec"])

        await openUrlDialog(page)
        await expect(urlField(page)).toHaveValue("")
    })

    test("a link typed into the message can be attached from the box", async ({
        page,
    }) => {
        const asked: string[] = []
        await page.route("**/api/parse-url", (route) => {
            asked.push(route.request().postDataJSON().url)
            return route.fulfill({
                status: 200,
                json: { title: "Spec", content: "text", charCount: 4 },
            })
        })
        await openApp(page)
        const hint = page.locator('[data-testid="typed-link-hint"]')
        await expect(hint).toHaveCount(0)
        // The link ends the sentence: its full stop is not part of it
        await page
            .locator('[data-testid="chat-input"]')
            .fill("Make a diagram of https://example.com/spec.")
        await expect(hint).toContainText(
            "The AI cannot open the link in your message.",
        )
        await hint
            .getByRole("button", { name: "Attach the page's text" })
            .click()
        await expect(page.getByText("Spec", { exact: true })).toBeVisible()
        expect(asked).toEqual(["https://example.com/spec"])
        // Attached: nothing left to offer
        await expect(hint).toHaveCount(0)
    })

    test("the link offered from the message ends where the address does", async ({
        page,
    }) => {
        const asked: string[] = []
        await page.route("**/api/parse-url", (route) => {
            asked.push(route.request().postDataJSON().url)
            return route.fulfill({
                status: 200,
                json: { title: "Spec", content: "text", charCount: 4 },
            })
        })
        await openApp(page)
        const hint = page.locator('[data-testid="typed-link-hint"]')
        // A bracket the link opens is its own; one around it is not, and
        // Chinese and Japanese follow a link without a space
        const messages = [
            "Draw https://en.wikipedia.org/wiki/Raft_(algorithm)",
            "Draw [the spec](https://example.com/spec).",
            "参考 https://example.com/docs，画一个架构图",
            "https://example.com/apiの構成図を描いて",
        ]
        for (const [index, message] of messages.entries()) {
            await page.locator('[data-testid="chat-input"]').fill(message)
            await hint
                .getByRole("button", { name: "Attach the page's text" })
                .click()
            await expect.poll(() => asked.length).toBe(index + 1)
            await expect(hint).toHaveCount(0)
        }
        expect(asked).toEqual([
            "https://en.wikipedia.org/wiki/Raft_(algorithm)",
            "https://example.com/spec",
            "https://example.com/docs",
            "https://example.com/api",
        ])
    })

    test("reading the link of the message leaves the URL dialog to its own link", async ({
        page,
    }) => {
        // Each request waits until the test answers it
        const answer: (() => void)[] = []
        await page.route("**/api/parse-url", async (route) => {
            await new Promise<void>((resolve) => answer.push(resolve))
            return route.request().postDataJSON().url.includes("typo")
                ? route.fulfill({
                      status: 400,
                      json: {
                          error: "Could not find this website",
                          code: "not_found",
                      },
                  })
                : route.fulfill({
                      status: 200,
                      json: { title: "Spec", content: "text", charCount: 4 },
                  })
        })
        await openApp(page)
        const attach = page
            .locator('[data-testid="typed-link-hint"]')
            .getByRole("button", { name: "Attach the page's text" })
        await page
            .locator('[data-testid="chat-input"]')
            .fill("Draw https://example.com/spec and https://exmaple-typo.com")

        // The dialog is opened for another link while the first is read
        await attach.click()
        await openUrlDialog(page)
        await expect.poll(() => answer.length).toBe(1)
        answer[0]()
        await expect(page.getByText("Spec", { exact: true })).toBeVisible()
        await expect(urlField(page)).toBeVisible()
        await page.keyboard.press("Escape")

        // The dialog did not ask for the link that fails: the reason is
        // not under its address, so a toast gives it
        await attach.click()
        await openUrlDialog(page)
        await expect.poll(() => answer.length).toBe(2)
        answer[1]()
        await expect(
            page.getByText("Couldn't find that website. Check the address."),
        ).toBeVisible()
        await expect(urlField(page)).toBeVisible()
    })
})
