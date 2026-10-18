import { expect, type Page, test } from "@playwright/test"
import { getIframe, sendMessage, waitForCompleteCount } from "./lib/fixtures"

/**
 * What a chat request tells the model about the canvas
 * (lib/diagram-context.ts): the canvas goes with a user message only when
 * the model's own calls no longer describe it.
 */

const BOX = `<mxCell id="box" value="Hand me" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="60" as="geometry"/></mxCell>`

function sse(events: object[]) {
    return `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`
}
const toolCall = (toolName: string, input: unknown) => {
    const toolCallId = `call_${Math.random().toString(36).slice(2)}`
    return sse([
        { type: "start", messageId: `msg_${toolCallId}` },
        { type: "tool-input-start", toolCallId, toolName },
        { type: "tool-input-available", toolCallId, toolName, input },
        { type: "finish" },
    ])
}
const text = (t: string) =>
    sse([
        { type: "start", messageId: `msg_${Math.random()}` },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: t },
        { type: "text-end", id: "t" },
        { type: "finish" },
    ])

/** Answers chat requests in order and records what each one sent */
async function mockChat(p: Page, replies: string[]) {
    const sent: any[] = []
    await p.route("**/api/chat", async (route) => {
        const body = route.request().postDataJSON()
        sent.push(body)
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: replies.shift() ?? text("OK"),
        })
    })
    return sent
}
const diagramOfLast = (body: any) => {
    const users = body.messages.filter((m: any) => m.role === "user")
    return users[users.length - 1].metadata?.diagram
}

test("the canvas goes with a message only when the model's calls do not describe it", async ({
    page: p,
}) => {
    const sent = await mockChat(p, [
        toolCall("display_diagram", { xml: BOX }),
        text("Noted."),
        text("I see you moved it."),
        text("Still the same."),
        toolCall("edit_diagram", {
            operations: [
                {
                    operation: "update",
                    cell_id: "box",
                    new_xml:
                        '<mxCell id="box" value="Edited by AI" style="rounded=1;" x="100" y="100" w="120" h="60"/>',
                },
            ],
        }),
        text("Fine."),
        text("After reload."),
    ])
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    const canvas = p.frameLocator("iframe")

    // 1. Empty canvas: the message says so
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await expect(canvas.getByText("Hand me")).toBeVisible({ timeout: 15000 })
    expect(diagramOfLast(sent[0]).xml).not.toContain('id="box"')

    // 2. The canvas is what the model drew: nothing to send
    await sendMessage(p, "Thanks")
    await expect.poll(() => sent.length).toBe(2)
    expect(diagramOfLast(sent[1])).toEqual({ unchanged: true })

    // 3. Moved by hand: the canvas goes with the message
    await canvas.getByText("Hand me").click()
    await p.keyboard.press("Shift+ArrowRight")
    await p.waitForTimeout(800)
    await sendMessage(p, "I moved it")
    await expect.poll(() => sent.length).toBe(3)
    const moved = diagramOfLast(sent[2])
    expect(moved.xml).toContain('id="box"')
    expect(moved.xml).not.toContain('x="100" y="100"')

    // 4. Unchanged since that message: nothing to send
    await sendMessage(p, "Anything else?")
    await expect.poll(() => sent.length).toBe(4)
    expect(diagramOfLast(sent[3])).toEqual({ unchanged: true })

    // 5. Undone by hand: sent again; the model edits the box
    await canvas.getByText("Hand me").click()
    await p.keyboard.press("ControlOrMeta+z")
    await p.waitForTimeout(800)
    await sendMessage(p, "Rename it")
    await expect.poll(() => sent.length).toBe(5)
    expect(diagramOfLast(sent[4]).xml).toContain('id="box"')
    await expect(canvas.getByText("Edited by AI")).toBeVisible({
        timeout: 15000,
    })

    // 6. The canvas is what the model's edit made: nothing to send
    await sendMessage(p, "Good")
    await expect.poll(() => sent.length).toBe(6)
    expect(diagramOfLast(sent[5])).toEqual({ unchanged: true })

    // The diagram notes of earlier messages travel with them unchanged
    const earlier = sent[5].messages.filter((m: any) => m.role === "user")
    expect(earlier[2].metadata.diagram.xml).toBe(moved.xml)

    // 7. After a reload the app no longer knows the edit's result: sent
    await expect
        .poll(() => new URL(p.url()).searchParams.get("session"))
        .toBeTruthy()
    // Saving the chat is debounced
    await p.waitForTimeout(1500)
    await p.goto(p.url(), { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await expect(canvas.getByText("Edited by AI")).toBeVisible({
        timeout: 15000,
    })
    await sendMessage(p, "Hello again")
    await expect.poll(() => sent.length).toBe(7)
    expect(diagramOfLast(sent[6]).xml).toContain("Edited by AI")
})

test("a picture is kept as its short reference in the message", async ({
    page: p,
}) => {
    const image = `data:image/png,${"A".repeat(30000)}`
    const PICTURE = `<mxCell id="pic" value="" style="shape=image;image=${image};" vertex="1" parent="1"><mxGeometry x="300" y="100" width="80" height="80" as="geometry"/></mxCell>`
    const sent = await mockChat(p, [
        toolCall("display_diagram", { xml: BOX + PICTURE }),
        text("Nice."),
        text("After reload."),
    ])
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(p, "Draw a box and a picture")
    await waitForCompleteCount(p, 1)
    await expect(p.frameLocator("iframe").getByText("Hand me")).toBeVisible({
        timeout: 15000,
    })

    // The canvas is what the model drew: a picture on it changes nothing
    await sendMessage(p, "Thanks")
    await expect.poll(() => sent.length).toBe(2)
    expect(diagramOfLast(sent[1])).toEqual({ unchanged: true })

    // After a reload the canvas goes with the message, its picture as the
    // reference the model sees; the request still carries the canvas in full
    await expect
        .poll(() => new URL(p.url()).searchParams.get("session"))
        .toBeTruthy()
    // Saving the chat is debounced
    await p.waitForTimeout(1500)
    await p.goto(p.url(), { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await expect(p.frameLocator("iframe").getByText("Hand me")).toBeVisible({
        timeout: 15000,
    })
    await sendMessage(p, "Hello again")
    await expect.poll(() => sent.length).toBe(3)
    const kept = diagramOfLast(sent[2])
    expect(kept.xml).toContain('id="pic"')
    expect(kept.xml).toContain("data:image/png,embedded-image-")
    expect(kept.xml).not.toContain(image)
    expect(sent[2].xml).toContain(image)
})

test("an edit that adds a shape into a container leaves the canvas out", async ({
    page: p,
}) => {
    const GROUP = `<mxCell id="grp" value="Group" style="swimlane;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="300" height="200" as="geometry"/></mxCell>`
    const sent = await mockChat(p, [
        toolCall("display_diagram", { xml: GROUP + BOX }),
        toolCall("edit_diagram", {
            operations: [
                {
                    operation: "add",
                    cell_id: "inner",
                    new_xml:
                        '<mxCell id="inner" value="Inside" style="rounded=1;" parent="grp" x="20" y="60" w="100" h="40"/>',
                },
            ],
        }),
        text("Fine."),
    ])
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    const canvas = p.frameLocator("iframe")
    await sendMessage(p, "Draw a group and a box")
    await waitForCompleteCount(p, 1)
    await expect(canvas.getByText("Hand me")).toBeVisible({ timeout: 15000 })
    await sendMessage(p, "Put a shape in the group")
    await expect(canvas.getByText("Inside")).toBeVisible({ timeout: 15000 })
    await p.waitForTimeout(800)

    // draw.io writes the new shape right after its group; the canvas is
    // still what the model's calls made
    await sendMessage(p, "Thanks")
    await expect.poll(() => sent.length).toBe(3)
    expect(diagramOfLast(sent[2])).toEqual({ unchanged: true })
})
