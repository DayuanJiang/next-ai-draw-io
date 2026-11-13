import type { Page } from "@playwright/test"
import { CAT_DIAGRAM_XML, FLOWCHART_XML } from "./fixtures/diagrams"
import {
    chunkedReplies,
    createMultiTurnMock,
    expect,
    getChatInput,
    openApp,
    sendMessage,
    test,
    waitForCompleteCount,
} from "./lib/fixtures"
import { createTextOnlyResponse, sse } from "./lib/helpers"

/** One network chunk: events of an answer that is still going */
const chunk = (...events: object[]) => sse(events, false)

const lines = (count: number, of: string) =>
    Array.from({ length: count }, (_, i) => `Line ${i + 1} of ${of}`)

/** The chat's scroll area: its middle, and how far it is from its bottom */
const scrollArea = (page: Page) =>
    page.getByText("Line 1 of the first answer").evaluate((line) => {
        const area = line.closest(".overflow-y-auto") as HTMLElement
        const box = area.getBoundingClientRect()
        return {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            fromBottom: area.scrollHeight - area.scrollTop - area.clientHeight,
        }
    })

/**
 * A first answer longer than the panel, then one that grows by a few lines
 * with every update on screen (each 150 ms), so the list is always on its
 * way to the new end. Returns once the second answer streams.
 */
async function streamSecondAnswer(page: Page) {
    const first = sse([
        { type: "start" },
        { type: "text-start", id: "t1" },
        {
            type: "text-delta",
            id: "t1",
            delta: lines(40, "the first answer").join("\n\n"),
        },
        { type: "text-end", id: "t1" },
        { type: "finish" },
    ])
    const second = [
        chunk({ type: "start" }, { type: "text-start", id: "t2" }),
        ...Array.from({ length: 80 }, (_, i) =>
            chunk({
                type: "text-delta",
                id: "t2",
                delta: `Sentence ${i + 1} of the second answer fills more than one line of the panel. `,
            }),
        ),
        sse([{ type: "text-end", id: "t2" }, { type: "finish" }]),
    ]
    await chunkedReplies(page, [[first], second], { gapMs: 50 })
    await openApp(page)
    await sendMessage(page, "Write forty lines")
    await expect(page.getByText("Line 40 of the first answer")).toBeVisible()
    const regenerate = page.getByRole("button", { name: "Regenerate response" })
    await expect(regenerate).toBeVisible()

    await sendMessage(page, "Write some more")
    await expect(page.getByText("Sentence 10 of")).toBeAttached()
    return regenerate
}

test("the chat stays where the user scrolled it while an answer streams", async ({
    page,
}) => {
    const regenerate = await streamSecondAnswer(page)
    // Up, to read the first answer again; in two steps, as a wheel turns
    const { x, y } = await scrollArea(page)
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(60)
    await page.mouse.wheel(0, -400)
    await expect(page.getByText("Sentence 50 of")).toBeAttached()
    expect((await scrollArea(page)).fromBottom).toBeGreaterThan(300)

    // Back at the bottom the chat follows the answer again, to its end
    await page.mouse.wheel(0, 20000)
    await expect(page.getByText("Sentence 80 of")).toBeAttached()
    await expect(regenerate).toBeVisible()
    // Polled: the last scroll to the end takes a moment
    await expect
        .poll(async () => (await scrollArea(page)).fromBottom)
        .toBeLessThan(60)
})

test("the chat stays where Page Up scrolled it while an answer streams", async ({
    page,
}) => {
    await streamSecondAnswer(page)
    // A click on the answer's text: the keys then scroll the chat
    await page.getByText("Sentence 1 of").click()
    await page.keyboard.press("PageUp")
    await page.waitForTimeout(300)
    await page.keyboard.press("PageUp")
    await expect(page.getByText("Sentence 60 of")).toBeAttached()
    expect((await scrollArea(page)).fromBottom).toBeGreaterThan(300)
})

test("a message typed on several lines keeps them; a table shows as one", async ({
    page,
}) => {
    await page.route("**/api/chat", (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: createTextOnlyResponse(
                "Here are the parts:\n\n| Part | Role |\n| --- | --- |\n| Browser | sends the form |",
            ),
        }),
    )
    await openApp(page)
    const typed =
        "Draw the login flow:\nuser opens the page\nenters the password"
    await getChatInput(page).fill(typed)
    await getChatInput(page).press("ControlOrMeta+Enter")

    const question = page.locator("p", { hasText: "Draw the login flow:" })
    await expect(question).toBeVisible()
    // biome-ignore lint/performance/useDomNodeTextContent: innerText has a line break where the screen shows one
    expect(await question.innerText()).toBe(typed)
    await expect(page.getByRole("cell", { name: "Browser" })).toBeVisible()
})

test("Show XML on the newest card opens in view, clear of its copy button", async ({
    page,
}) => {
    // A window so short that the newest card ends at the message box
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.route(
        "**/api/chat",
        createMultiTurnMock([
            { xml: CAT_DIAGRAM_XML, text: "Here is the cat." },
            { xml: FLOWCHART_XML, text: "Here is the flowchart." },
        ]),
    )
    await openApp(page)
    await sendMessage(page, "Draw a cat")
    await waitForCompleteCount(page, 1)
    await sendMessage(page, "Now a flowchart")
    await waitForCompleteCount(page, 2)

    const card = page.locator('[data-testid="version-card"]').last()
    await card.getByRole("button", { name: "Show XML" }).click()
    const code = card.locator("pre")
    await expect(code).toContainText('value="Start"')
    await expect(code).toBeInViewport({ ratio: 1 })

    // The code ends where the button begins, or before
    const copy = card.getByRole("button", { name: "Copy response" })
    const codeBox = await code.boundingBox()
    const copyBox = await copy.boundingBox()
    expect((codeBox?.x ?? 0) + (codeBox?.width ?? 0)).toBeLessThanOrEqual(
        copyBox?.x ?? 0,
    )
})
