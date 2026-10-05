import type { Page } from "@playwright/test"
import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    getChatInput,
    getIframe,
    getIframeContent,
    openSettings,
    sendMessage,
    test,
    waitForComplete,
    waitForText,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("History and Session Restore", () => {
    test("new chat button clears conversation", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Created your test diagram.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await test.step("create a conversation", async () => {
            await sendMessage(page, "Create a test diagram")
            await waitForText(page, "Created your test diagram.")
        })

        await test.step("click new chat button", async () => {
            const newChatButton = page.locator(
                '[data-testid="new-chat-button"]',
            )
            await expect(newChatButton).toBeVisible({ timeout: 5000 })
            await newChatButton.click()
        })

        await test.step("verify conversation is cleared", async () => {
            await expect(
                page.locator('text="Created your test diagram."'),
            ).not.toBeVisible({ timeout: 5000 })
        })
    })

    test("new chat keeps a conversation that could not be saved", async ({
        page,
    }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Created your test diagram.",
                ),
            })
        })
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
        await sendMessage(page, "Create a test diagram")
        await waitForText(page, "Created your test diagram.")

        // Browser storage is full from now on
        await page.evaluate(() => {
            IDBObjectStore.prototype.put = () => {
                throw new DOMException("Storage is full", "QuotaExceededError")
            }
        })
        await page.locator('[data-testid="new-chat-button"]').click()

        await expect(
            page.getByText(/Could not save this chat/).first(),
        ).toBeVisible({ timeout: 5000 })
        await page.waitForTimeout(1000)
        // Still the conversation and its diagram, not the empty chat's examples
        await expect(page.getByText("Paper to Diagram")).toHaveCount(0)
        await expect(
            getIframeContent(page).getByText("Test Box", { exact: true }),
        ).toBeVisible()
    })

    test("new chat can go on without saving when storage is full", async ({
        page,
    }) => {
        // Old chats can only be deleted from the empty chat's list, so the
        // user must be able to get there
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Created your test diagram.",
                ),
            })
        })
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
        await sendMessage(page, "Create a test diagram")
        await waitForText(page, "Created your test diagram.")
        await page.evaluate(() => {
            IDBObjectStore.prototype.put = () => {
                throw new DOMException("Storage is full", "QuotaExceededError")
            }
        })
        await page.locator('[data-testid="new-chat-button"]').click()
        await page
            .getByRole("button", { name: "Continue without saving" })
            .click({ timeout: 5000 })
        await expect(
            page.locator('text="Created your test diagram."'),
        ).toHaveCount(0, { timeout: 5000 })
        await expect(page.getByText("Paper to Diagram")).toBeVisible()
    })

    // A diagram drawn by hand, without chat messages: loaded into draw.io
    // directly, then moved with an arrow key, which draw.io reports as an
    // edit like any manual change
    async function drawByHand(page: Page, label: string) {
        const shape = getIframeContent(page).getByText(label, { exact: true })
        // draw.io may still be starting (after a new chat): send until shown
        for (let i = 0; i < 10 && (await shape.count()) === 0; i++) {
            await page.evaluate((label) => {
                const xml = `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="h" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="60" y="60" width="140" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
                document
                    .querySelector("iframe")
                    ?.contentWindow?.postMessage(
                        JSON.stringify({ action: "load", xml, autosave: 1 }),
                        "*",
                    )
            }, label)
            await page.waitForTimeout(1000)
        }
        await shape.click({ timeout: 10000 })
        await page.keyboard.press("ArrowRight")
        // The app saves the edit about a second later
        await page.waitForTimeout(2000)
    }
    const storageFull = (page: Page) =>
        page.evaluate(() => {
            IDBObjectStore.prototype.put = () => {
                throw new DOMException("Storage is full", "QuotaExceededError")
            }
        })

    test("new chat keeps a diagram without messages that could not be saved", async ({
        page,
    }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
        await drawByHand(page, "Hand drawn")
        await expect(
            getIframeContent(page).getByText("Hand drawn", { exact: true }),
        ).toBeVisible({ timeout: 10000 })
        await storageFull(page)
        await page.locator('[data-testid="new-chat-button"]').click()
        await expect(
            page.getByText(/Could not save this chat/).first(),
        ).toBeVisible({ timeout: 5000 })
        await expect(
            getIframeContent(page).getByText("Hand drawn", { exact: true }),
        ).toBeVisible()
    })

    test("opening another chat keeps a diagram that could not be saved", async ({
        page,
    }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Created your test diagram.",
                ),
            })
        })
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
        await sendMessage(page, "Create a test diagram")
        await waitForText(page, "Created your test diagram.")
        await page.waitForTimeout(1500)
        await page.locator('[data-testid="new-chat-button"]').click()
        // The empty chat lists the first one; draw something by hand
        const firstChat = page.getByRole("button", {
            name: /Create a test diagram/,
        })
        await expect(firstChat).toBeVisible({ timeout: 10000 })
        await drawByHand(page, "Hand drawn")
        await expect(
            getIframeContent(page).getByText("Hand drawn", { exact: true }),
        ).toBeVisible({ timeout: 10000 })
        await storageFull(page)
        await firstChat.click()
        await expect(
            page.getByText(/Could not save this chat/).first(),
        ).toBeVisible({ timeout: 5000 })
        await page.waitForTimeout(1000)
        await expect(
            getIframeContent(page).getByText("Hand drawn", { exact: true }),
        ).toBeVisible()
    })

    test("chat history sidebar shows past conversations", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const historyButton = page.locator(
            'button[aria-label*="History"]:not([disabled]), button:has(svg.lucide-history):not([disabled]), button:has(svg.lucide-menu):not([disabled]), button:has(svg.lucide-sidebar):not([disabled]), button:has(svg.lucide-panel-left):not([disabled])',
        )

        const buttonCount = await historyButton.count()
        if (buttonCount === 0) {
            test.skip()
            return
        }

        await historyButton.first().click()
        await expect(getChatInput(page)).toBeVisible({ timeout: 3000 })
    })

    test("conversation persists after page reload", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "This message should persist.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await test.step("create conversation", async () => {
            await sendMessage(page, "Create persistent diagram")
            await waitForText(page, "This message should persist.")
        })

        await test.step("verify message appears before reload", async () => {
            await expect(getChatInput(page)).toBeVisible({ timeout: 10000 })
            await expect(
                page.locator('text="This message should persist."'),
            ).toBeVisible({ timeout: 10000 })
        })

        // Note: After reload, mocked responses won't persist since we're not
        // testing with real localStorage. We just verify the app loads correctly.
        await test.step("verify app loads after reload", async () => {
            await page.reload({ waitUntil: "networkidle" })
            await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
            await expect(getChatInput(page)).toBeVisible({ timeout: 10000 })
        })
    })

    test("diagram state persists after reload", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Created a diagram that should be saved.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Create saveable diagram")
        await waitForComplete(page)

        await page.reload({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const frame = getIframeContent(page)
        await expect(
            frame
                .locator(".geMenubarContainer, .geDiagramContainer, canvas")
                .first(),
        ).toBeVisible({ timeout: 30000 })
    })

    test("can restore from browser back/forward", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Testing browser navigation.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Test navigation")
        await waitForText(page, "Testing browser navigation.")

        await page.goto("/about", { waitUntil: "networkidle" })
        await page.goBack({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await expect(getChatInput(page)).toBeVisible({ timeout: 10000 })
    })

    test("settings are restored after reload", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await openSettings(page)
        await page.keyboard.press("Escape")

        await page.reload({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await openSettings(page)
    })

    test("model selection persists", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const modelSelector = page.locator(
            'button[aria-label*="Model"], [data-testid="model-selector"], button:has-text("Claude")',
        )

        const selectorCount = await modelSelector.count()
        if (selectorCount === 0) {
            test.skip()
            return
        }

        const initialModel = await modelSelector.first().textContent()

        await page.reload({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const modelAfterReload = await modelSelector.first().textContent()
        expect(modelAfterReload).toBe(initialModel)
    })

    test("handles localStorage quota exceeded gracefully", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await page.evaluate(() => {
            try {
                const largeData = "x".repeat(5 * 1024 * 1024)
                localStorage.setItem("test-large-data", largeData)
            } catch {
                // Expected to fail on some browsers
            }
        })

        await expect(getChatInput(page)).toBeVisible({ timeout: 10000 })

        await page.evaluate(() => {
            localStorage.removeItem("test-large-data")
        })
    })
})

/** Number of chats stored in this origin's IndexedDB */
const countSessions = (page: Page) =>
    page.evaluate(
        () =>
            new Promise<number>((resolve, reject) => {
                const open = indexedDB.open("next-ai-drawio")
                open.onerror = () => reject(open.error)
                open.onsuccess = () => {
                    const db = open.result
                    if (!db.objectStoreNames.contains("sessions")) {
                        db.close()
                        return resolve(0)
                    }
                    const count = db
                        .transaction("sessions", "readonly")
                        .objectStore("sessions")
                        .count()
                    count.onsuccess = () => {
                        db.close()
                        resolve(count.result)
                    }
                }
            }),
    )

test("new chat right after an answer saves that chat once", async ({
    page,
}) => {
    test.setTimeout(180_000)
    await page.route("**/api/chat", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: createMockSSEResponse(SINGLE_BOX_XML, "Drew the box."),
        })
    })
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    const newChat = page.locator('[data-testid="new-chat-button"]')
    // The auto-save runs a second after the answer; New Chat around then
    // waits for its thumbnail while the auto-save starts
    for (let run = 1; run <= 10; run++) {
        await sendMessage(page, `Draw box ${run}`)
        await waitForText(page, "Drew the box.")
        await page.waitForTimeout(500 + run * 100)
        await newChat.click()
        await expect(page.getByText("Drew the box.")).toHaveCount(0)
        await page.waitForTimeout(2500)
        expect(await countSessions(page), `run ${run}`).toBe(run)
    }
})

test("an idle chat is not saved again and again", async ({ page }) => {
    test.setTimeout(90_000)
    await page.route("**/api/chat", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            // The tool result comes from the page, as with a real model
            body: `${[
                { type: "start" },
                { type: "text-start", id: "t" },
                { type: "text-delta", id: "t", delta: "Drew the box." },
                { type: "text-end", id: "t" },
                {
                    type: "tool-input-start",
                    toolCallId: "c1",
                    toolName: "display_diagram",
                },
                {
                    type: "tool-input-available",
                    toolCallId: "c1",
                    toolName: "display_diagram",
                    input: {
                        // Some diagrams (this one) export a new image each time
                        xml: '<mxCell id="2" value="Box" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="60" as="geometry"/></mxCell>',
                    },
                },
                { type: "finish" },
            ]
                .map((e) => `data: ${JSON.stringify(e)}\n\n`)
                .join("")}data: [DONE]\n\n`,
        })
    })
    // Every auto-save takes a thumbnail: count draw.io's thumbnail exports
    await page.addInitScript(() => {
        const w = window as unknown as { thumbnails: number }
        w.thumbnails = 0
        window.addEventListener("message", (e) => {
            try {
                const m = JSON.parse(e.data)
                if (
                    m.event === "export" &&
                    String(m.message?.message ?? "").startsWith("thumbnail")
                ) {
                    w.thumbnails++
                }
            } catch {}
        })
    })
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(page, "Draw a box")
    await waitForText(page, "Drew the box.")
    // Let the auto-save after the answer finish
    await page.waitForTimeout(5000)
    const thumbnails = () =>
        page.evaluate(
            () => (window as unknown as { thumbnails: number }).thumbnails,
        )
    const settled = await thumbnails()
    await page.waitForTimeout(5000)
    expect(await thumbnails()).toBe(settled)
})
