import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    createMultiTurnMock,
    expect,
    openApp,
    sendMessage,
    test,
    waitForComplete,
} from "./lib/fixtures"

test("a screen reader hears the answer end, and the names of the two menus and the search box", async ({
    page,
}) => {
    await page.route(
        "**/api/chat",
        createMultiTurnMock([{ xml: SINGLE_BOX_XML, text: "Here is a box." }]),
    )
    await openApp(page)
    await expect(page.getByRole("main")).toHaveCount(1)
    // Empty before the answer: the sentence that follows is read as a change
    const said = page.locator('.sr-only[aria-live="polite"]')
    await sendMessage(page, "Draw a box")
    await waitForComplete(page)
    await expect(said).toHaveText("Drew the diagram")

    await page.getByTestId("composer-add").click()
    await expect(page.getByRole("dialog", { name: "Add" })).toBeVisible()
    await page.keyboard.press("Escape")

    await page.getByTestId("session-title").click()
    const list = page.getByRole("dialog", { name: "Recent diagrams" })
    await expect(list).toBeVisible()
    // The search box shows once the diagram is saved
    await expect(list.getByPlaceholder("Search diagrams…")).toHaveAttribute(
        "aria-label",
        "Search diagrams…",
        { timeout: 10000 },
    )
})
