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
})
