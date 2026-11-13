import type { Page } from "@playwright/test"
import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    getChatInput,
    getSendButton,
    openApp,
    openSettingsTab,
    sendMessage,
    sleep,
    test,
    waitForComplete,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

/** Pick a language in the settings, then close them (they stay open while
 * the page mounts anew in the new language) */
async function pickLanguage(page: Page, name: string) {
    await openSettingsTab(page, "general")
    await page.locator("#language-select").click()
    await page.getByRole("option", { name, exact: true }).click()
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(async () => {
        await page.keyboard.press("Escape")
        await expect(page.getByRole("dialog")).toHaveCount(0, {
            timeout: 500,
        })
    }).toPass({ timeout: 10000 })
}

test.describe("Language Switching", () => {
    test("language persists on the next visit", async ({ page }) => {
        await openApp(page)

        await test.step("switch to Japanese", async () => {
            await pickLanguage(page, "日本語")
            await sleep(500)
        })

        await test.step("verify Japanese before leaving", async () => {
            await expect(getSendButton(page, "送信")).toBeVisible({
                timeout: 10000,
            })
        })

        await test.step("open /en and verify Japanese persists", async () => {
            await page.goto("/en", { waitUntil: "networkidle" })
            await expect(page).toHaveURL(/\/ja(\?|$)/, { timeout: 10000 })
            await expect(getSendButton(page, "送信")).toBeVisible({
                timeout: 10000,
            })
        })
    })

    test("Japanese locale URL works", async ({ page }) => {
        await openApp(page, { path: "/ja" })

        await expect(getSendButton(page, "送信")).toBeVisible({
            timeout: 10000,
        })
    })

    test("Chinese locale URL works", async ({ page }) => {
        await openApp(page, { path: "/zh" })

        await expect(getSendButton(page, "发送")).toBeVisible({
            timeout: 10000,
        })
    })

    test("importing a file that is not a saved prompts export says so in the page's language", async ({
        page,
    }) => {
        await openApp(page, { path: "/zh" })
        await page.getByRole("button", { name: "常用提示词" }).click()
        const dialog = page.getByRole("dialog")
        const input = dialog.locator('input[type="file"][accept*="json"]')
        // Another app's JSON, then a file that is not JSON at all
        for (const body of ['{"name":"something else"}', "not json"]) {
            await input.setInputFiles({
                name: "other.json",
                mimeType: "application/json",
                buffer: Buffer.from(body),
            })
            await expect(
                dialog.getByText("这不是本应用导出的提示词文件。"),
            ).toBeVisible()
            await expect(dialog.getByText(/schemaVersion|JSON/)).toHaveCount(0)
            // The next file shows the message again
            await page.keyboard.press("Escape")
            await page.getByRole("button", { name: "常用提示词" }).click()
        }
    })

    test("the canvas stays on the page the user was on", async ({ page }) => {
        const diagramPage = (id: string, label: string) =>
            `<diagram id="${id}" name="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="${id}-box" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram>`
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    `<mxfile>${diagramPage("First", "Box A")}${diagramPage("Second", "Box B")}</mxfile>`,
                    "Drew two pages.",
                ),
            }),
        )
        await openApp(page)
        await sendMessage(page, "Draw two pages")
        await waitForComplete(page)
        const canvas = page.frameLocator("iframe")
        await canvas
            .locator(".geTabContainer")
            .getByText("Second", { exact: true })
            .click()
        await expect(canvas.getByText("Box B")).toBeVisible()

        // draw.io starts again in the new language
        await pickLanguage(page, "日本語")
        await expect(getSendButton(page, "送信")).toBeVisible({
            timeout: 10000,
        })
        await expect(canvas.getByText("Box B")).toBeVisible({ timeout: 15000 })
    })

    test("a stale offer to switch without saving does nothing once a message is being sent", async ({
        page,
    }) => {
        // Registered before the app's own listener, so it can drop
        // draw.io's export replies once asked to
        await page.addInitScript(() => {
            window.addEventListener("message", (event) => {
                if (
                    (window as any).__dropExports &&
                    typeof event.data === "string" &&
                    event.data.includes('"event":"export"')
                ) {
                    event.stopImmediatePropagation()
                }
            })
        })
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(SINGLE_BOX_XML, "Drew the box."),
            }),
        )
        await openApp(page)
        await sendMessage(page, "Draw a box")
        await waitForComplete(page)
        // Storage is full: switching the language offers to go on unsaved
        await page.evaluate(() => {
            IDBObjectStore.prototype.put = () => {
                throw new DOMException("Storage is full", "QuotaExceededError")
            }
        })
        await pickLanguage(page, "日本語")
        const offer = page.getByRole("button", {
            name: "Continue without saving",
        })
        await expect(offer).toBeVisible({ timeout: 5000 })
        // The next message waits for its diagram export (it never comes)
        await page.evaluate(() => {
            ;(window as any).__dropExports = true
        })
        await sendMessage(page, "Make it red")
        // Other toasts may stack over it
        await offer.dispatchEvent("click")
        await sleep(1500)
        await expect(page).toHaveURL(/\/en(\?|$)/)
        // The export gives up: the message is back in the composer
        await expect(getChatInput(page)).toHaveValue("Make it red", {
            timeout: 15000,
        })
    })
})
