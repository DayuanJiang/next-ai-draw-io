import { FLOWCHART_XML } from "./fixtures/diagrams"
import {
    expect,
    getAttachmentInput,
    getChatInput,
    getIframeContent,
    getSendButton,
    openApp,
    sendMessage,
    sleep,
    test,
    waitForComplete,
    waitForCompleteCount,
} from "./lib/fixtures"
import {
    createMockSSEResponse,
    createTextOnlyResponse,
    sse,
} from "./lib/helpers"

const ONE_PIXEL_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
)

test.describe("Message box", () => {
    test("the message box has the focus again when an answer ends", async ({
        page,
    }) => {
        let count = 0
        await page.route("**/api/chat", async (route) => {
            count++
            // The third answer leaves time for a click on the canvas
            if (count === 3) await sleep(1500)
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createTextOnlyResponse(`Answer ${count}`),
            })
        })
        await openApp(page)
        const input = getChatInput(page)
        // Sent from the start screen: the panel's box takes the focus
        await sendMessage(page, "First")
        await expect(page.getByText("Answer 1")).toBeVisible()
        await expect(input).toBeFocused()
        // The next message is typed without a click on the box
        await page.keyboard.type("Second")
        await page.keyboard.press("ControlOrMeta+Enter")
        await expect(page.getByText("Answer 2")).toBeVisible()
        await expect(input).toBeFocused()

        // The focus stays where the user put it during the answer
        await page.keyboard.type("Third")
        await page.keyboard.press("ControlOrMeta+Enter")
        await getIframeContent(page)
            .locator(".geDiagramContainer")
            .click({ position: { x: 20, y: 20 } })
        await expect(page.getByText("Answer 3")).toBeVisible()
        await expect(input).toBeEnabled()
        await expect(input).not.toBeFocused()
    })

    test("the panel's box has the focus after an example's saved answer", async ({
        page,
    }) => {
        // A saved answer shows at once: the box is never disabled
        await openApp(page)
        await page.getByTestId("example-cat").click()
        await getChatInput(page).press("ControlOrMeta+Enter")
        await expect(page.getByTestId("version-card")).toBeVisible()
        await expect(getChatInput(page)).toBeFocused()
    })

    test("a file dropped beside the message box is attached", async ({
        page,
    }) => {
        await openApp(page)
        const dataTransfer = await page.evaluateHandle(() => {
            const dt = new DataTransfer()
            // Begins as a GIF does: a file that is no picture is turned away
            dt.items.add(
                new File(["GIF89a"], "dropped.gif", { type: "image/gif" }),
            )
            return dt
        })
        // The start screen's heading, above the box
        const heading = page.getByRole("heading", {
            name: "What would you like to draw?",
        })
        await heading.dispatchEvent("dragover", { dataTransfer })
        await heading.dispatchEvent("drop", { dataTransfer })
        await expect(page.getByAltText("dropped.gif")).toBeVisible()

        // The browser would open a file whose drag the page does not take;
        // dragged text is left to the browser
        const taken = await page.evaluate((dt) => {
            const over = (dataTransfer: DataTransfer) => {
                const event = new DragEvent("dragover", {
                    dataTransfer,
                    bubbles: true,
                    cancelable: true,
                })
                document.body.dispatchEvent(event)
                return event.defaultPrevented
            }
            const text = new DataTransfer()
            text.setData("text/plain", "hello")
            return { file: over(dt), text: over(text) }
        }, dataTransfer)
        expect(taken).toEqual({ file: true, text: false })
    })

    test("a pasted file is attached, whatever its type", async ({ page }) => {
        await openApp(page)
        const input = getChatInput(page)
        // Pastes one file together with a text, as a file manager's copy
        // (the file's name) or a spreadsheet's copy (the cells) does.
        // Returns whether the text was kept out of the box.
        const paste = (
            name: string,
            type: string,
            content: string,
            text: string,
        ) =>
            input.evaluate(
                (el, [name, type, content, text]) => {
                    const clipboardData = new DataTransfer()
                    clipboardData.items.add(new File([content], name, { type }))
                    clipboardData.setData("text/plain", text)
                    const event = new ClipboardEvent("paste", {
                        clipboardData,
                        bubbles: true,
                        cancelable: true,
                    })
                    el.dispatchEvent(event)
                    return event.defaultPrevented
                },
                [name, type, content, text],
            )

        expect(
            await paste("notes.md", "text/markdown", "# Notes", "notes.md"),
        ).toBe(true)
        await expect(page.getByText("notes.md")).toBeVisible()
        // A picture is attached as before, and its text is pasted. It
        // begins as a GIF does: a file that is no picture is turned away.
        expect(await paste("image.gif", "image/gif", "GIF89a", "A1\tB1")).toBe(
            false,
        )
        await expect(page.getByAltText(/^pasted-image-/)).toBeVisible()
    })

    test("a file picked twice is attached once, and its tile tells its full name", async ({
        page,
    }) => {
        await openApp(page)
        // A file on disk: it has the same modification time both times
        for (let i = 0; i < 2; i++) {
            await getAttachmentInput(page).setInputFiles(
                "public/chain-of-thought.txt",
            )
            await expect(page.getByText("chain-o...")).toBeVisible()
        }
        await expect(page.getByText("chain-o...")).toHaveCount(1)
        await expect(page.getByTitle("chain-of-thought.txt")).toBeVisible()
    })

    test("with an attachment and no text, the box asks for a line of text", async ({
        page,
    }) => {
        await openApp(page)
        const input = getChatInput(page)
        await expect(input).toHaveAttribute("placeholder", /^For example/)
        await getAttachmentInput(page).setInputFiles(
            "public/chain-of-thought.txt",
        )
        await expect(input).toHaveAttribute(
            "placeholder",
            "Add a line about what to draw from the attachment, then send",
        )
        await expect(getSendButton(page)).toBeDisabled()
        await input.fill("Summarize this paper as a diagram")
        await expect(getSendButton(page)).toBeEnabled()
    })

    test("an attached picture opens full size over the whole window, and Esc closes it", async ({
        page,
    }) => {
        await openApp(page)
        // In the chat panel, which is much narrower than the window
        await page.getByTestId("draw-yourself").click()
        await getAttachmentInput(page).setInputFiles({
            name: "photo.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })
        await page.getByAltText("photo.png").click()
        const preview = page.getByAltText(
            "Full size preview of uploaded diagram or image",
        )
        await expect(preview).toBeVisible()
        const backdrop = await preview.locator("xpath=../..").boundingBox()
        expect(backdrop?.width).toBe(page.viewportSize()?.width)
        await page.keyboard.press("Escape")
        await expect(preview).toHaveCount(0)
    })

    test("a picture over the size limit is scaled down and attached", async ({
        page,
    }) => {
        await openApp(page)
        // A 2400 x 1200 PNG of a gradient with noise, which PNG stores in
        // several megabytes, like a large screenshot
        const dataTransfer = await page.evaluateHandle(async () => {
            const canvas = document.createElement("canvas")
            canvas.width = 2400
            canvas.height = 1200
            const context = canvas.getContext("2d") as CanvasRenderingContext2D
            const pixels = context.createImageData(2400, 1200)
            for (let i = 0; i < pixels.data.length; i++) {
                pixels.data[i] =
                    i % 4 === 3 ? 255 : (i % 200) + Math.random() * 16
            }
            context.putImageData(pixels, 0, 0)
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve),
            )
            const dt = new DataTransfer()
            dt.items.add(
                new File([blob as Blob], "whiteboard.png", {
                    type: "image/png",
                }),
            )
            return dt
        })
        const size = await dataTransfer.evaluate((dt) => dt.files[0].size)
        expect(size).toBeGreaterThan(2 * 1024 * 1024)

        await page.locator("body").dispatchEvent("drop", { dataTransfer })
        // Attached as a JPEG whose longest side is 2000 pixels
        const tile = page.getByAltText("whiteboard.jpg")
        await expect(tile).toBeVisible()
        await expect
            .poll(() =>
                tile.evaluate((img: HTMLImageElement) => img.naturalWidth),
            )
            .toBe(2000)
        await expect(page.getByText("exceeds 2MB")).toHaveCount(0)
    })
})

test.describe("Start screen examples", () => {
    test("a file that loads late is not attached to the next example", async ({
        page,
    }) => {
        // The AWS example's picture arrives after the cat example is picked
        let release!: () => void
        const held = new Promise<void>((resolve) => {
            release = resolve
        })
        await page.route("**/architecture.png", async (route) => {
            await held
            await route.continue()
        })
        await openApp(page)
        await page.getByTestId("example-aws").click()
        await page.getByTestId("example-cat").click()
        await expect(getChatInput(page)).toHaveValue("Draw a cat for me")
        const arrived = page.waitForResponse("**/architecture.png")
        release()
        await arrived
        await page.waitForTimeout(1000)
        await expect(page.getByAltText("architecture.png")).toHaveCount(0)

        // Picked alone, the example gets its picture
        await page.getByTestId("example-aws").click()
        await expect(page.getByAltText("architecture.png")).toBeVisible()
    })

    test("an example replaces typed text only on confirm", async ({ page }) => {
        await openApp(page)
        const input = getChatInput(page)
        await input.fill("A long request I typed myself")
        await page.getByTestId("example-cat").click()
        const dialog = page.getByRole("alertdialog")
        await expect(dialog).toContainText("Replace current input?")
        await dialog.getByRole("button", { name: "Cancel" }).click()
        await expect(input).toHaveValue("A long request I typed myself")
        // The confirmation gives the focus back to the example
        await expect(page.getByTestId("example-cat")).toBeFocused()

        await page.getByTestId("example-cat").click()
        await dialog.getByRole("button", { name: "Replace" }).click()
        await expect(input).toHaveValue("Draw a cat for me")
        // From one example to another there is nothing to ask
        await page.getByTestId("example-animated").click()
        await expect(input).toHaveValue(/animated connector/)
        await expect(dialog).toHaveCount(0)
    })

    test("in another language the note says the saved answers are in English", async ({
        page,
    }) => {
        await openApp(page, { path: "/zh" })
        await expect(page.getByTestId("lobby-hero")).toContainText(
            "保存好的答案（英文）会立即显示",
        )
    })

    test("the MCP video loads once draw.io has loaded", async ({ page }) => {
        const requested: string[] = []
        page.on("request", (request) => requested.push(request.url()))
        const videoRequested = () =>
            requested.some((url) => url.endsWith("/mcp-promo.mp4"))
        // draw.io's page is held back, as on a slow connection
        let release!: () => void
        const held = new Promise<void>((resolve) => {
            release = resolve
        })
        await page.route("**/drawio/index.html*", async (route) => {
            await held
            await route.continue()
        })
        await page.goto("/", { waitUntil: "domcontentloaded" })
        await expect(page.getByTestId("mcp-video")).toBeVisible()
        await page.waitForTimeout(1500)
        expect(videoRequested()).toBe(false)

        release()
        await expect.poll(videoRequested, { timeout: 30000 }).toBe(true)
    })
})

test.describe("Line breaks in Chinese and Japanese", () => {
    test("the start screen's lede does not end with a line of one character", async ({
        page,
    }) => {
        await openApp(page, { path: "/zh" })
        // The width of each line of the lede
        const lines = await page
            .getByTestId("lobby-hero")
            .locator("p")
            .first()
            .evaluate((p) => {
                const range = document.createRange()
                range.selectNodeContents(p)
                return [...range.getClientRects()].map((r) => r.width)
            })
        expect(lines.at(-1)).toBeGreaterThan(100)
    })

    test("a narrow panel does not break a version's summary inside a word", async ({
        page,
    }) => {
        // The first answer draws, the second adds one shape
        let count = 0
        await page.route("**/api/chat", async (route) => {
            const body =
                count++ === 0
                    ? createMockSSEResponse(FLOWCHART_XML, "Flowchart.")
                    : sse([
                          { type: "start", messageId: "msg_edit" },
                          {
                              type: "tool-input-start",
                              toolCallId: "call_edit",
                              toolName: "edit_diagram",
                          },
                          {
                              type: "tool-input-available",
                              toolCallId: "call_edit",
                              toolName: "edit_diagram",
                              input: {
                                  operations: [
                                      {
                                          operation: "add",
                                          cell_id: "review",
                                          new_xml:
                                              '<mxCell id="review" value="Review" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="360" y="130" width="100" height="40" as="geometry"/></mxCell>',
                                      },
                                  ],
                              },
                          },
                          { type: "finish" },
                      ])
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body,
            })
        })
        await openApp(page, { path: "/ja" })
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await sendMessage(page, "Add a review step")
        await waitForCompleteCount(page, 2)

        // The panel's left edge, dragged right as far as it goes
        const handle = await page
            .locator('[data-testid="chat-panel"] [role="separator"]')
            .boundingBox()
        if (!handle) throw new Error("the panel has no resize handle")
        await page.mouse.move(handle.x + handle.width / 2, handle.y + 200)
        await page.mouse.down()
        await page.mouse.move(handle.x + 600, handle.y + 200, { steps: 5 })
        await page.mouse.up()

        // 図形を 1 個追加 is followed by two links: it stays on one line
        const card = page.getByTestId("version-card").last()
        await expect(card).toContainText("図形を 1 個追加")
        const summaryLines = await card.evaluate((el) => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (!node.textContent?.includes("追加")) continue
                const range = document.createRange()
                range.selectNodeContents(node)
                return range.getClientRects().length
            }
        })
        expect(summaryLines).toBe(1)
    })
})
