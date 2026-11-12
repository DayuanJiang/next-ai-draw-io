import { createBoxXml } from "./fixtures/diagrams"
import {
    createMultiTurnMock,
    expect,
    getChatInput,
    openApp,
    sendMessage,
    test,
    waitForCompleteCount,
} from "./lib/fixtures"

/**
 * What the page translator of Chrome, Edge and Yandex Browser does: every
 * text node is replaced by <font><font>its translation</font></font>, and so
 * is text that appears later. React still holds the nodes that were replaced.
 */
function startTranslator() {
    const translate = () => {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
        )
        const nodes: Node[] = []
        while (walker.nextNode()) nodes.push(walker.currentNode)
        for (const node of nodes) {
            const parent = node.parentElement
            if (!node.nodeValue?.trim() || !parent) continue
            if (parent.closest("font, script, style, textarea, svg")) continue
            const outer = document.createElement("font")
            const inner = document.createElement("font")
            inner.textContent = node.nodeValue
            outer.appendChild(inner)
            parent.replaceChild(outer, node)
        }
    }
    translate()
    let timer: ReturnType<typeof setTimeout>
    new MutationObserver(() => {
        clearTimeout(timer)
        timer = setTimeout(translate, 30)
    }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    })
}

test("the editor stays up when the browser translates the page", async ({
    page,
}) => {
    await page.route(
        "**/api/chat",
        createMultiTurnMock([
            { xml: createBoxXml("a", "Alpha"), text: "Here is a box." },
            { xml: createBoxXml("b", "Beta", 200), text: "Here is another." },
        ]),
    )
    await openApp(page)
    await page.evaluate(startTranslator)

    await sendMessage(page, "Draw a box")
    await waitForCompleteCount(page, 1)
    await sendMessage(page, "Draw another box")
    await waitForCompleteCount(page, 2)
    // Without the layout's early script React's next update of the translated
    // cards threw "Failed to execute 'insertBefore' on 'Node'", and the crash
    // screen replaced the editor
    await page.getByRole("button", { name: "Restore v1" }).click()
    await expect(page.getByText("Restored v1")).toBeVisible()
    await expect(page.getByText("Something went wrong")).toHaveCount(0)
    await expect(page.locator("iframe")).toBeVisible()

    // And the chat still works
    await page.getByTestId("new-chat-button").click()
    await sendMessage(page, "Draw a third box")
    await waitForCompleteCount(page, 1)
    await expect(page.getByText("Something went wrong")).toHaveCount(0)
    await expect(getChatInput(page)).toBeVisible()
})
