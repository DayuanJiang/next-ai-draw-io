import { ARCHITECTURE_XML, createBoxXml } from "./fixtures/diagrams"
import {
    createMixedMock,
    createMultiTurnMock,
    expect,
    getIframeContent,
    openApp,
    sendMessage,
    test,
    waitForComplete,
    waitForText,
} from "./lib/fixtures"
import { createTextOnlyResponse, sse } from "./lib/helpers"

test.describe("Multi-turn Conversation", () => {
    test("handles multiple diagram requests in sequence", async ({ page }) => {
        await page.route(
            "**/api/chat",
            createMultiTurnMock([
                {
                    xml: createBoxXml("box1", "First"),
                    text: "Creating diagram 1...",
                },
                {
                    xml: createBoxXml("box2", "Second", 200),
                    text: "Creating diagram 2...",
                },
            ]),
        )

        await openApp(page)

        // First request
        await sendMessage(page, "Draw first box")
        await waitForText(page, "Creating diagram 1...")

        // Second request
        await sendMessage(page, "Draw second box")
        await waitForText(page, "Creating diagram 2...")

        // Both messages should be visible
        // (The first one is also the chat's title)
        await expect(
            page.getByRole("paragraph").filter({ hasText: "Draw first box" }),
        ).toBeVisible()
        await expect(page.locator('text="Draw second box"')).toBeVisible()
    })

    test("preserves conversation history", async ({ page }) => {
        let requestCount = 0
        await page.route("**/api/chat", async (route) => {
            requestCount++
            const request = route.request()
            const body = JSON.parse(request.postData() || "{}")

            // Verify messages array grows with each request
            if (requestCount === 2) {
                expect(body.messages?.length).toBeGreaterThan(1)
            }

            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createTextOnlyResponse(`Response ${requestCount}`),
            })
        })

        await openApp(page)

        // First message
        await sendMessage(page, "Hello")
        await waitForText(page, "Response 1")

        // Second message (should include history)
        await sendMessage(page, "Follow up question")
        await waitForText(page, "Response 2")
    })

    test("can continue after a text-only response", async ({ page }) => {
        await page.route(
            "**/api/chat",
            createMixedMock([
                {
                    type: "text",
                    text: "I understand. Let me explain the architecture first.",
                },
                {
                    type: "diagram",
                    xml: ARCHITECTURE_XML,
                    text: "Here is the diagram:",
                },
            ]),
        )

        await openApp(page)

        // Ask for explanation first
        await sendMessage(page, "Explain the architecture")
        await waitForText(
            page,
            "I understand. Let me explain the architecture first.",
        )

        // Then ask for diagram
        await sendMessage(page, "Now show it as a diagram")
        await waitForComplete(page)
        // The diagram is on the canvas
        await expect(
            getIframeContent(page).getByText("Architecture", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
    })

    test("sends the thinking of an earlier answer with its own turn only", async ({
        page,
    }) => {
        // Signed or encrypted for the model that wrote it (GPT-6 Luna through
        // Bedrock): another model refuses it, and it is most of a long
        // chat's request
        const bodies: any[] = []
        await page.route("**/api/chat", async (route) => {
            bodies.push(route.request().postDataJSON())
            const n = bodies.length
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: sse([
                    { type: "start", messageId: `msg_${n}` },
                    { type: "start-step" },
                    { type: "reasoning-start", id: `r${n}` },
                    {
                        type: "reasoning-delta",
                        id: `r${n}`,
                        delta: `Plan ${n}`,
                    },
                    {
                        type: "reasoning-end",
                        id: `r${n}`,
                        providerMetadata: {
                            bedrock: { redactedContent: `ENCRYPTED-${n}` },
                        },
                    },
                    { type: "text-start", id: `t${n}` },
                    { type: "text-delta", id: `t${n}`, delta: `Answer ${n}` },
                    { type: "text-end", id: `t${n}` },
                    { type: "finish-step" },
                    { type: "finish" },
                ]),
            })
        })
        await openApp(page)
        await sendMessage(page, "First question")
        await waitForText(page, "Answer 1")
        // The chat keeps the thinking of the first answer
        await expect(page.getByText("Plan 1")).toBeAttached()
        await sendMessage(page, "Second question")
        await waitForText(page, "Answer 2")

        const sent = JSON.stringify(bodies[1].messages)
        expect(sent).toContain("Answer 1")
        expect(sent).not.toContain("Plan 1")
        expect(sent).not.toContain("ENCRYPTED-1")
    })
})
