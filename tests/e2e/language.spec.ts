import type { Page } from "@playwright/test"
import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    getChatInput,
    getIframe,
    getSendButton,
    openSettingsTab,
    sendMessage,
    sleep,
    test,
    waitForComplete,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

/** Pick a language in the settings, then close them */
async function pickLanguage(page: Page, name: string) {
    await openSettingsTab(page, "general")
    await page.locator("#language-select").click()
    await page.getByRole("option", { name, exact: true }).click()
    await page.keyboard.press("Escape")
}

test.describe("Language Switching", () => {
    test("loads English by default", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await expect(getSendButton(page, "Send")).toBeVisible()
    })

    test("can switch to Japanese", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await test.step("open settings and select Japanese", async () => {
            await pickLanguage(page, "日本語")
        })

        await test.step("verify UI is in Japanese", async () => {
            await expect(getSendButton(page, "送信")).toBeVisible({
                timeout: 5000,
            })
        })
    })

    test("can switch to Chinese", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await test.step("open settings and select Chinese", async () => {
            await pickLanguage(page, "中文")
        })

        await test.step("verify UI is in Chinese", async () => {
            await expect(getSendButton(page, "发送")).toBeVisible({
                timeout: 5000,
            })
        })
    })

    test("language persists after reload", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await test.step("switch to Japanese", async () => {
            await pickLanguage(page, "日本語")
            await sleep(500)
        })

        await test.step("verify Japanese before reload", async () => {
            await expect(getSendButton(page, "送信")).toBeVisible({
                timeout: 10000,
            })
        })

        await test.step("reload and verify Japanese persists", async () => {
            await page.reload({ waitUntil: "networkidle" })
            await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
            // Wait for hydration and localStorage to be read
            await sleep(1000)
            await expect(getSendButton(page, "送信")).toBeVisible({
                timeout: 10000,
            })
        })
    })

    test("Japanese locale URL works", async ({ page }) => {
        await page.goto("/ja", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await expect(getSendButton(page, "送信")).toBeVisible({
            timeout: 10000,
        })
    })

    test("Chinese locale URL works", async ({ page }) => {
        await page.goto("/zh", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await expect(getSendButton(page, "发送")).toBeVisible({
            timeout: 10000,
        })
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
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
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
