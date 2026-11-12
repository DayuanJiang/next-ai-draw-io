import type { Page } from "@playwright/test"
import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    getChatInput,
    getIframe,
    getIframeContent,
    openApp,
    sendMessage,
    test,
    waitForComplete,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

/** What has the focus: its test id, else a link's text, else its tag */
const focused = (page: Page) =>
    page.evaluate(() => {
        const element = document.activeElement as HTMLElement
        return (
            element.dataset.testid ??
            (element.tagName === "A" ? element.textContent : element.tagName)
        )
    })

const viewportTag = (page: Page) =>
    page.locator('meta[name="viewport"]').getAttribute("content")

test.describe("Site pages", () => {
    test("a page stays dark when its language changes", async ({ page }) => {
        await page.emulateMedia({ colorScheme: "dark" })
        await page.goto("/en/about", { waitUntil: "networkidle" })
        const html = page.locator("html")
        await expect(html).toHaveClass(/dark/)
        // The footer's links and the header's menu both keep the page
        await page.locator('footer a[hreflang="zh"]').click()
        await expect(page).toHaveURL(/\/zh\/about$/)
        await expect(html).toHaveAttribute("lang", "zh")
        await expect(html).toHaveClass(/dark/)
        await page.getByRole("button", { name: "语言" }).click()
        await page.locator('header a[hreflang="ja"]').click()
        await expect(page).toHaveURL(/\/ja\/about$/)
        await expect(html).toHaveAttribute("lang", "ja")
        await expect(html).toHaveClass(/dark/)
    })

    test("the 404 page is dark in dark mode, and so is the page opened from it", async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: "dark" })
        const response = await page.goto("/en/no-such-page")
        expect(response?.status()).toBe(404)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        await expect(page.locator("html")).toHaveClass(/dark/)
        await page.getByRole("link", { name: "Docs" }).click()
        await expect(page).toHaveURL(/\/en\/docs$/)
        await expect(page.locator("html")).toHaveClass(/dark/)
    })

    test("phones can zoom the site's pages; the editor keeps its fixed size", async ({
        page,
    }) => {
        for (const path of ["/en/docs", "/en/gallery", "/en/no-such-page"]) {
            await page.goto(path)
            expect(await viewportTag(page), path).toBe(
                "width=device-width, initial-scale=1",
            )
        }
        await page.goto("/en")
        expect(await viewportTag(page)).toBe(
            "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
        )
    })

    test("a page fetches no provider logos of the About page it links to", async ({
        page,
    }) => {
        const logos: string[] = []
        await page.route("https://models.dev/**", (route) => {
            logos.push(route.request().url())
            return route.fulfill({
                contentType: "image/svg+xml",
                body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
            })
        })
        await page.goto("/en/docs", { waitUntil: "networkidle" })
        expect(logos).toEqual([])
        // The About page loads them once they come into view
        await page.goto("/en/about", { waitUntil: "networkidle" })
        await page
            .locator('img[src^="https://models.dev/logos/"]')
            .first()
            .scrollIntoViewIfNeeded()
        await expect.poll(() => logos.length).toBeGreaterThan(0)
    })

    test("the editor opened from a site page a second time starts a new chat, and Back and Forward return to the first", async ({
        page,
    }) => {
        // draw.io loads three times
        test.setTimeout(90_000)
        await page.route("**/api/chat", (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(SINGLE_BOX_XML, "Drew the box."),
            }),
        )
        const box = getIframeContent(page).getByText("Test Box")
        // By the site's link: the page stays, draw.io loads anew
        const openEditor = async () => {
            await page
                .locator("header")
                .getByRole("link", { name: "Open the editor" })
                .click()
            await expect(getIframe(page)).toBeVisible({ timeout: 30000 })
            await expect(page.getByTestId("canvas-loading")).toHaveCount(0, {
                timeout: 30000,
            })
        }
        await page.goto("/en/about", { waitUntil: "networkidle" })
        await openEditor()
        await sendMessage(page, "Draw a box")
        await waitForComplete(page)
        await expect(box).toBeVisible()
        await expect(page).toHaveURL(/session=/)
        const chatUrl = page.url()

        await page.goBack()
        await expect(page).toHaveURL(/\/en\/about$/)
        await page.goForward()
        await expect(page).toHaveURL(chatUrl)
        await expect(box).toBeVisible({ timeout: 30000 })
        await expect(page.getByText("Drew the box.")).toBeVisible()

        await page.goBack()
        await expect(page).toHaveURL(/\/en\/about$/)
        await openEditor()
        // The first chat's diagram was still held by the layout: it came
        // up here and was saved as one more chat (after a second)
        await page.waitForTimeout(2500)
        await expect(box).toHaveCount(0)
        await expect(page).toHaveURL(/\/en$/)
    })
})

test.describe("Keyboard focus in the editor", () => {
    test("Tab from the start screen stays out of the canvas under it", async ({
        page,
    }) => {
        await openApp(page)
        await getChatInput(page).focus()
        const stops: (string | null)[] = []
        for (let i = 0; i < 20; i++) {
            await page.keyboard.press("Tab")
            stops.push(await focused(page))
        }
        expect(stops).toContain("settings-button")
        // draw.io's frame, and the link for crawlers that nobody sees
        expect(stops).not.toContain("IFRAME")
        expect(stops).not.toContain("About")
        // Put away, the start screen gives the canvas back to the keyboard
        await page.getByTestId("draw-yourself").click()
        await expect(page.getByTestId("chat-panel")).toBeVisible()
        await expect(page.locator("[inert]")).toHaveCount(0)
    })

    test("a closed dialog gives the focus back to the button that opened it", async ({
        page,
    }) => {
        await openApp(page)
        await page.getByTestId("draw-yourself").click()
        const dialog = page.getByRole("dialog")
        // The export dialog's name field takes the focus as it opens
        for (const button of ["settings-button", "export-button"]) {
            await page.getByTestId(button).focus()
            await page.keyboard.press("Enter")
            await expect(dialog).toBeVisible()
            // (Escape pressed while the dialog mounts can come too early)
            await expect(async () => {
                await page.keyboard.press("Escape")
                await expect(dialog).toHaveCount(0, { timeout: 500 })
            }).toPass({ timeout: 10000 })
            await expect(page.getByTestId(button)).toBeFocused()
        }
        // Closed with the mouse, the button's tooltip stays away
        await page.getByTestId("settings-button").click()
        await dialog.getByRole("button", { name: "Close" }).click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByTestId("settings-button")).toBeFocused()
        await expect(page.getByRole("tooltip")).toHaveCount(0)
    })

    test("the panel's input takes the focus when the panel is shown again", async ({
        page,
    }) => {
        await openApp(page)
        await page.getByTestId("draw-yourself").click()
        const panel = page.getByTestId("chat-panel")
        await getChatInput(page).focus()
        await page.keyboard.press("ControlOrMeta+b")
        await expect(panel).toHaveCount(0)
        await page.keyboard.press("ControlOrMeta+b")
        await expect(getChatInput(page)).toBeFocused()
        // The button over the canvas does the same
        await page.keyboard.press("ControlOrMeta+b")
        await page.getByTestId("show-panel").click()
        await expect(getChatInput(page)).toBeFocused()
    })
})

test.describe("Tooltips and motion", () => {
    test("a tooltip closes when the pointer moves from its button on to the canvas", async ({
        page,
    }) => {
        await openApp(page)
        await page.getByTestId("draw-yourself").click()
        await page.getByRole("button", { name: "Hide chat panel" }).click()
        const button = page.getByTestId("show-panel")
        const box = await button.boundingBox()
        if (!box) throw new Error("the show panel button is not laid out")
        const x = box.x + box.width / 2
        const y = box.y + box.height / 2
        await page.mouse.move(x, y)
        const tooltip = page.getByRole("tooltip")
        await expect(tooltip).toBeVisible()
        // Down and left, over draw.io's frame
        for (let step = 1; step <= 25; step++) {
            await page.mouse.move(x - step * 8, y + step * 8)
        }
        await expect(tooltip).toHaveCount(0)
    })

    test("with reduced motion, dialogs, menus and tooltips appear at once", async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: "reduce" })
        await openApp(page)
        await page.getByTestId("draw-yourself").click()
        // The animations running on the element as it appears
        const animations = (slot: string) =>
            page
                .locator(`[data-slot="${slot}"]`)
                .last()
                .evaluate((element) => element.getAnimations().length)
        await page.getByTestId("settings-button").click()
        expect(await animations("dialog-content")).toBe(0)
        expect(await animations("dialog-overlay")).toBe(0)
        await page.getByRole("dialog").getByText("Close").click()
        await expect(page.getByRole("dialog")).toHaveCount(0)
        await page.getByTestId("session-title").click()
        expect(await animations("popover-content")).toBe(0)
        await page.keyboard.press("Escape")
        await page.getByTestId("new-chat-button").hover()
        expect(await animations("tooltip-content")).toBe(0)
        // The canvas edge moves at once with the panel. It is still a
        // transition: the canvas re-centres the diagram at its end.
        await page.getByTestId("canvas-stage").evaluate((stage) => {
            stage.addEventListener("transitionend", (event) => {
                const { target, propertyName, elapsedTime } =
                    event as TransitionEvent
                if (target !== stage || propertyName !== "right") return
                ;(window as any).slideSeconds = elapsedTime
            })
        })
        await page.getByRole("button", { name: "Hide chat panel" }).click()
        await expect
            .poll(() => page.evaluate(() => (window as any).slideSeconds))
            .toBeLessThan(0.01)
    })
})
