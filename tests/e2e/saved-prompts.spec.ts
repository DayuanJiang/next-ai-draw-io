import type { Locator, Page } from "@playwright/test"
import { expect, getChatInput, openApp, test } from "./lib/fixtures"

/** The "Saved prompts" dialog, opened from the message box */
async function openSavedPrompts(page: Page) {
    await page.getByRole("button", { name: "Saved prompts" }).click()
    const dialog = page.getByRole("dialog", { name: "Saved prompts" })
    await expect(dialog).toBeVisible()
    return dialog
}

/** Save a prompt through the form of the "Saved prompts" dialog */
async function savePrompt(
    page: Page,
    dialog: Locator,
    prompt: string,
    title?: string,
) {
    await dialog
        .getByRole("button", { name: /^Save (your first )?prompt$/ })
        .click()
    const form = page.getByRole("dialog", { name: "Save a prompt" })
    await form.getByLabel("Prompt").fill(prompt)
    if (title) await form.getByLabel("Title").fill(title)
    await form.getByRole("button", { name: "Save prompt" }).click()
    await expect(form).toBeHidden()
}

test.describe("Saved prompts", () => {
    test("the form of a long prompt keeps its buttons on screen", async ({
        page,
    }) => {
        await openApp(page)
        const dialog = await openSavedPrompts(page)
        await dialog
            .getByRole("button", { name: "Save your first prompt" })
            .click()
        const form = page.getByRole("dialog", { name: "Save a prompt" })
        const long = Array.from(
            { length: 60 },
            (_, i) => `Step ${i + 1}: draw the next part of the flow`,
        ).join("\n")
        await form.getByLabel("Prompt").fill(long)
        await form.getByLabel("Description").fill(long)
        const save = form.getByRole("button", { name: "Save prompt" })
        await expect(save).toBeInViewport({ ratio: 1 })
        await expect(form.getByRole("heading")).toBeInViewport({ ratio: 1 })
        await save.click()
        await expect(dialog.getByText("Step 1: draw").first()).toBeVisible()
    })

    test("saving the typed prompt from the add menu says it was saved", async ({
        page,
    }) => {
        await openApp(page)
        await getChatInput(page).fill("Draw an ER diagram of users and orders")
        await page.getByTestId("composer-add").click()
        await page.getByRole("button", { name: "Save this prompt" }).click()
        await page
            .getByRole("dialog", { name: "Save a prompt" })
            .getByRole("button", { name: "Save prompt" })
            .click()
        await expect(page.getByText("Prompt saved")).toBeVisible()
    })

    test("the list's buttons keep their names on one line", async ({
        page,
    }) => {
        await openApp(page)
        const dialog = await openSavedPrompts(page)
        await savePrompt(page, dialog, "Draw the login flow")
        for (const name of ["Save prompt", "Export", "Import"]) {
            const box = await dialog
                .getByRole("button", { name, exact: true })
                .boundingBox()
            // One line of text and the button's padding
            expect(box?.height).toBeLessThan(32)
        }
    })

    test("a failed import's message stays when the export's message before it times out", async ({
        page,
    }) => {
        await openApp(page)
        const dialog = await openSavedPrompts(page)
        await savePrompt(page, dialog, "Draw the login flow")
        const download = page.waitForEvent("download")
        await dialog
            .getByRole("button", { name: "Export", exact: true })
            .click()
        await download
        await expect(
            dialog.getByText("Exported 1 saved prompt(s)"),
        ).toBeVisible()
        // Within the three seconds the export's message shows
        await dialog.locator('input[type="file"]').setInputFiles({
            name: "prompts.json",
            mimeType: "application/json",
            buffer: Buffer.from('{"templates": []}'),
        })
        const failed = dialog.getByText(
            "Import failed: Missing or invalid schemaVersion",
        )
        await expect(failed).toBeVisible()
        await page.waitForTimeout(3500)
        await expect(failed).toBeVisible()
    })

    test("prompts that begin alike can be told apart and found by their text", async ({
        page,
    }) => {
        await openApp(page)
        const dialog = await openSavedPrompts(page)
        const shop = "Draw an AWS architecture for a web shop with a CDN"
        const lake = "Draw an AWS architecture for a data lake with Glue"
        await savePrompt(page, dialog, shop)
        await savePrompt(page, dialog, lake)
        await savePrompt(
            page,
            dialog,
            "Draw a login flow with SMS codes",
            "Login",
        )
        await expect(dialog.getByText(shop)).toBeVisible()
        await expect(dialog.getByText(lake)).toBeVisible()
        // A title the user typed has the prompt's start under it
        await expect(
            dialog.getByText("Draw a login flow with SMS codes"),
        ).toBeVisible()
        await dialog.getByPlaceholder("Search saved prompts…").fill("SMS codes")
        await expect(dialog.getByText("Login", { exact: true })).toBeVisible()
        await expect(dialog.getByText(shop)).toHaveCount(0)
    })

    test("a long title ends before the buttons that show on hover", async ({
        page,
    }) => {
        await openApp(page)
        const dialog = await openSavedPrompts(page)
        await savePrompt(
            page,
            dialog,
            "Draw the login flow",
            "A title long enough to reach the buttons of its row in the list of saved prompts",
        )
        const title = dialog.getByText("A title long enough")
        await title.hover()
        const pin = dialog.getByRole("button", { name: "Pin to top" })
        await expect(pin).toBeVisible()
        const titleBox = await title.boundingBox()
        const pinBox = await pin.boundingBox()
        expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0)).toBeLessThanOrEqual(
            pinBox?.x ?? 0,
        )
    })
})

test.describe("Saved prompts on a touch screen", () => {
    // A tablet: the desktop layout, without hover
    test.use({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 1024, height: 768 },
    })

    test("a row shows its buttons, next to the title", async ({ page }) => {
        await openApp(page)
        const dialog = await openSavedPrompts(page)
        await savePrompt(
            page,
            dialog,
            "Draw the login flow",
            "A title long enough to reach the buttons of its row in the list of saved prompts",
        )
        const remove = dialog.getByRole("button", { name: "Delete" })
        await expect(remove).toBeVisible()
        const opacity = await remove.evaluate(
            (button) =>
                getComputedStyle(button.parentElement as Element).opacity,
        )
        expect(opacity).toBe("1")
        // The title ends where the buttons start
        const title = await dialog
            .getByText("A title long enough")
            .boundingBox()
        const pin = await dialog
            .getByRole("button", { name: "Pin to top" })
            .boundingBox()
        expect((title?.x ?? 0) + (title?.width ?? 0)).toBeLessThanOrEqual(
            pin?.x ?? 0,
        )
    })
})
