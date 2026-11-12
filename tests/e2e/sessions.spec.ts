import type { Page, Route } from "@playwright/test"
import { FLOWCHART_XML } from "./fixtures/diagrams"
import {
    chunkedReplies,
    expect,
    getIframeContent,
    getSendButton,
    openApp,
    openDrawioFile,
    openSettingsTab,
    sendMessage,
    test,
    waitForComplete,
} from "./lib/fixtures"
import {
    createMockSSEResponse,
    createTextOnlyResponse,
    sse,
    toolCallEvents,
} from "./lib/helpers"

/** Every chat request is answered with the flowchart */
const drawFlowchart = (route: Route) =>
    route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: createMockSSEResponse(FLOWCHART_XML, "Here is the flowchart."),
    })

const box = (id: string, label: string, x: number) =>
    `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`

const doc = (cells: string) =>
    `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`

const asked = (id: string, text: string) => ({
    id,
    role: "user",
    parts: [{ type: "text", text }],
})

const answered = (id: string, text: string) => ({
    id,
    role: "assistant",
    parts: [{ type: "text", text, state: "done" }],
})

/** A saved chat with one finished turn per label, drawn as one box each */
function savedChat(id: string, updatedAt: number, labels: string[]) {
    return {
        id,
        title: `Chat ${id}`,
        createdAt: 1000,
        updatedAt,
        messages: labels.flatMap((label, i) => [
            asked(`${id}-u${i}`, `Draw ${label}`),
            answered(`${id}-a${i}`, `Drew ${label}.`),
        ]),
        xmlSnapshots: [],
        diagramXml: doc(
            labels
                .map((label, i) => box(`c${i}`, label, 40 + i * 200))
                .join(""),
        ),
        versions: [],
    }
}

/** Puts a saved chat into the browser's storage, as another tab would */
async function storeChat(page: Page, session: object) {
    await page.evaluate(async (session) => {
        const db: IDBDatabase = await new Promise((resolve) => {
            const request = indexedDB.open("next-ai-drawio")
            request.onsuccess = () => resolve(request.result)
        })
        await new Promise((resolve) => {
            const tx = db.transaction("sessions", "readwrite")
            tx.objectStore("sessions").put(session)
            tx.oncomplete = resolve
        })
        db.close()
    }, session)
}

/** The saved chats, by id */
function storedChats(page: Page): Promise<Record<string, any>> {
    return page.evaluate(async () => {
        const db: IDBDatabase = await new Promise((resolve) => {
            const request = indexedDB.open("next-ai-drawio")
            request.onsuccess = () => resolve(request.result)
        })
        const sessions: any[] = await new Promise((resolve) => {
            const request = db
                .transaction("sessions")
                .objectStore("sessions")
                .getAll()
            request.onsuccess = () => resolve(request.result)
        })
        db.close()
        return Object.fromEntries(sessions.map((s) => [s.id, s]))
    })
}

/** What the page sees when the user switches to another browser tab */
async function hideTab(page: Page) {
    await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
            value: "hidden",
            configurable: true,
        })
        document.dispatchEvent(new Event("visibilitychange"))
    })
}

async function openChat(page: Page, id: string, label: string) {
    await page.goto(`/?session=${id}`, { waitUntil: "networkidle" })
    await expect(
        getIframeContent(page).getByText(label, { exact: true }),
    ).toBeVisible({ timeout: 30000 })
}

test.describe("Saved chats", () => {
    test("hiding the tab of a chat that was only looked at writes nothing", async ({
        page,
    }) => {
        await openApp(page)
        await storeChat(page, savedChat("one", 1000, ["Alpha"]))
        await openChat(page, "one", "Alpha")
        // Another tab adds a turn to the same chat
        await storeChat(page, savedChat("one", 2000, ["Alpha", "Beta"]))
        await hideTab(page)
        await page.waitForTimeout(1500)
        const { one } = await storedChats(page)
        expect(one.messages).toHaveLength(4)
        expect(one.updatedAt).toBe(2000)
    })

    test("leaving a chat that was only looked at keeps its stored copy and its time", async ({
        page,
    }) => {
        await openApp(page)
        await storeChat(page, savedChat("one", 1000, ["Alpha"]))
        await storeChat(page, savedChat("two", 500, ["Gamma"]))
        await openChat(page, "one", "Alpha")
        // Another tab adds a turn to the chat on screen
        await storeChat(page, savedChat("one", 2000, ["Alpha", "Beta"]))
        await page.locator('[data-testid="session-title"]').click()
        await page.getByRole("button", { name: /Chat two/ }).click()
        await expect(
            getIframeContent(page).getByText("Gamma", { exact: true }),
        ).toBeVisible({ timeout: 15000 })
        await page.waitForTimeout(1500)
        let chats = await storedChats(page)
        expect(chats.one.messages).toHaveLength(4)
        expect(chats.one.updatedAt).toBe(2000)
        // A new diagram leaves chat two, which was only looked at as well
        await page.locator('[data-testid="new-chat-button"]').click()
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
        await page.waitForTimeout(1500)
        chats = await storedChats(page)
        expect(chats.two.updatedAt).toBe(500)
        expect(chats.one.updatedAt).toBe(2000)
    })

    test("the address follows the chat while the server does not answer", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawFlowchart)
        await openApp(page)
        // From here on the server gives no page data (a restart, a dropped
        // connection): Next's router would load the address anew
        await page.route("**/*", (route) =>
            "rsc" in route.request().headers()
                ? route.abort()
                : route.fallback(),
        )
        await page.evaluate(() => {
            ;(window as any).__samePage = true
        })
        const samePage = () =>
            page.evaluate(() => (window as any).__samePage === true)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect(page).toHaveURL(/session=/)
        await page.waitForTimeout(1500)
        expect(await samePage()).toBe(true)
        // A new diagram takes the session out of the address
        await page.locator('[data-testid="new-chat-button"]').click()
        await expect(page).not.toHaveURL(/session=/)
        await page.waitForTimeout(1500)
        expect(await samePage()).toBe(true)
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
    })

    test("an edit after a reload gets the named style that the chat's drawing defined", async ({
        page,
    }) => {
        // A model goes on using the name it defined in its later edits
        const calls = [
            toolCallEvents("d1", "display_diagram", {
                xml: '<mxStyle name="stepbox" value="rounded=1;fillColor=#dae8fc;"/><mxCell id="2" value="Plan" style="stepbox;" x="40" y="40" w="120" h="60"/>',
            }),
            toolCallEvents("e1", "edit_diagram", {
                operations: [
                    {
                        operation: "add",
                        cell_id: "3",
                        new_xml:
                            '<mxCell id="3" value="Build" style="stepbox;" x="240" y="40" w="120" h="60"/>',
                    },
                ],
            }),
        ]
        let request = 0
        await page.route("**/api/chat", (route) => {
            const call = calls[request++]
            return route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: sse([
                    { type: "start", messageId: `m${request}` },
                    call.start,
                    ...call.deltas,
                    call.done,
                    { type: "finish" },
                ]),
            })
        })
        await openApp(page)
        await sendMessage(page, "Draw a step")
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Plan", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await expect
            .poll(async () => Object.keys(await storedChats(page)))
            .toHaveLength(1)
        // The page that is loaded again has not seen the drawing's call
        await page.reload({ waitUntil: "networkidle" })
        await expect(canvas.getByText("Plan", { exact: true })).toBeVisible({
            timeout: 30000,
        })
        await sendMessage(page, "Add a step")
        await expect(canvas.getByText("Build", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await expect
            .poll(
                async () =>
                    Object.values(await storedChats(page))[0].diagramXml,
            )
            .toMatch(/id="3"[^>]*fillColor=#dae8fc/)
    })

    test("a file opened after a chat starts without that chat's named styles", async ({
        page,
    }) => {
        // The edit in the file's chat uses a name the chat before defined
        const calls = [
            toolCallEvents("d1", "display_diagram", {
                xml: '<mxStyle name="stepbox" value="rounded=1;fillColor=#dae8fc;"/><mxCell id="2" value="Plan" style="stepbox;" x="40" y="40" w="120" h="60"/>',
            }),
            toolCallEvents("e1", "edit_diagram", {
                operations: [
                    {
                        operation: "add",
                        cell_id: "3",
                        new_xml:
                            '<mxCell id="3" value="Build" style="stepbox;" x="240" y="40" w="120" h="60"/>',
                    },
                ],
            }),
        ]
        let request = 0
        await page.route("**/api/chat", (route) => {
            const call = calls[request++]
            return route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: sse([
                    { type: "start", messageId: `m${request}` },
                    call.start,
                    ...call.deltas,
                    call.done,
                    { type: "finish" },
                ]),
            })
        })
        await openApp(page)
        await sendMessage(page, "Draw a step")
        const canvas = getIframeContent(page)
        await expect(canvas.getByText("Plan", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await expect
            .poll(async () => Object.keys(await storedChats(page)))
            .toHaveLength(1)
        await openDrawioFile(page, "other.drawio", doc(box("a", "Kept", 40)))
        await expect(canvas.getByText("Kept", { exact: true })).toBeVisible()
        await sendMessage(page, "Add a step")
        await expect(canvas.getByText("Build", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        const fileChat = async () =>
            Object.values(await storedChats(page)).find(
                (chat) => chat.title === "other",
            )?.diagramXml ?? ""
        await expect.poll(fileChat).toMatch(/id="3"[^>]*style="stepbox;/)
        expect(await fileChat()).not.toContain("fillColor=#dae8fc")
    })

    test("a chat whose stopped drawing call has an xml that is not text opens with its diagram", async ({
        page,
    }) => {
        await openApp(page)
        // Stopped while the model wrote the call's input, which is saved as
        // it came
        await storeChat(page, {
            ...savedChat("odd", 1000, ["Alpha"]),
            messages: [
                asked("odd-u0", "Draw Alpha"),
                {
                    id: "odd-a0",
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-display_diagram",
                            toolCallId: "odd-call",
                            state: "output-error",
                            input: { xml: { broken: true } },
                            errorText: "Stopped by user",
                        },
                    ],
                },
            ],
        })
        await openChat(page, "odd", "Alpha")
    })

    test("a chat started from a link to a chat this browser does not hold gets its own address", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawFlowchart)
        await openApp(page, { path: "/?session=from-another-browser" })
        await expect(page.locator('[data-testid="lobby-hero"]')).toBeVisible()
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        await expect
            .poll(async () => Object.keys(await storedChats(page)))
            .toHaveLength(1)
        const [id] = Object.keys(await storedChats(page))
        await expect(page).toHaveURL(new RegExp(`session=${id}$`))
        await page.reload({ waitUntil: "networkidle" })
        await expect(page.getByText("Here is the flowchart.")).toBeVisible({
            timeout: 30000,
        })
    })

    test("renaming a chat that storage no longer holds writes it again", async ({
        page,
    }) => {
        await openApp(page)
        await storeChat(page, savedChat("one", 1000, ["Alpha"]))
        await openChat(page, "one", "Alpha")
        // The site's data is cleared while the chat is open
        await page.evaluate(async () => {
            const db: IDBDatabase = await new Promise((resolve) => {
                const request = indexedDB.open("next-ai-drawio")
                request.onsuccess = () => resolve(request.result)
            })
            await new Promise((resolve) => {
                const tx = db.transaction("sessions", "readwrite")
                tx.objectStore("sessions").clear()
                tx.oncomplete = resolve
            })
            db.close()
        })
        await page.locator('[data-testid="session-title"]').click()
        await page.locator('[data-testid="rename-session"]').click()
        const input = page.getByRole("textbox", { name: "Rename" })
        await input.fill("Kept after all")
        await input.press("Enter")
        await expect
            .poll(async () =>
                Object.values(await storedChats(page)).map((chat) => [
                    chat.title,
                    chat.messages.length,
                ]),
            )
            .toEqual([["Kept after all", 2]])
        await expect(page.getByText(/Could not save this chat/)).toHaveCount(0)
        // The list was read again: the chat shows under its new name
        await expect(
            page
                .getByRole("dialog")
                .locator('div[role="button"]')
                .filter({ hasText: "Kept after all" }),
        ).toHaveCount(1)
    })

    test("changing the language adds no step to the browser history", async ({
        page,
    }) => {
        await openApp(page)
        await openSettingsTab(page, "general")
        await page.locator("#language-select").click()
        await page.getByRole("option", { name: "日本語", exact: true }).click()
        await expect(page).toHaveURL(/\/ja/, { timeout: 15000 })
        // Settings stay open while the page mounts anew in Japanese
        await expect(async () => {
            await page.keyboard.press("Escape")
            await expect(getSendButton(page, "送信")).toBeVisible({
                timeout: 500,
            })
        }).toPass({ timeout: 15000 })
        // One step back is the page from before the app
        await page.goBack()
        await expect(page).toHaveURL("about:blank")
    })
})

const UNFINISHED = "The answer ended before the diagram was finished."

test.describe("A chat left during an answer", () => {
    test("a message is saved when it is sent: a reload during its answer keeps it, with Retry", async ({
        page,
    }) => {
        let requests = 0
        await page.route("**/api/chat", async (route) => {
            // The first answer never comes: the page is reloaded meanwhile
            if (++requests > 1) await drawFlowchart(route)
        })
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await expect
            .poll(async () =>
                Object.values(await storedChats(page)).map(
                    (chat) => chat.messages.length,
                ),
            )
            .toEqual([1])
        await expect(page).toHaveURL(/session=/)
        await page.reload({ waitUntil: "networkidle" })
        await expect(
            page
                .locator('[data-testid="chat-panel"]')
                .getByText("Create a flowchart")
                .first(),
        ).toBeVisible({ timeout: 30000 })
        await expect(page.getByText(UNFINISHED)).toBeVisible()
        await page.locator('[data-testid="retry-button"]').click()
        await waitForComplete(page)
        await expect(page.getByText("Here is the flowchart.")).toBeVisible()
        await expect(page.getByText(UNFINISHED)).toHaveCount(0)
    })

    test("an answer is in storage the moment it ends", async ({ page }) => {
        await page.route("**/api/chat", drawFlowchart)
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)
        // Well before the save a second later, which adds the thumbnail
        await expect
            .poll(
                async () =>
                    Object.values(await storedChats(page)).map((chat) =>
                        chat.messages.map((m: { role: string }) => m.role),
                    ),
                { timeout: 500, intervals: [50] },
            )
            .toEqual([["user", "assistant"]])
    })

    test("a chat saved in the middle of an answer says so, with Retry", async ({
        page,
    }) => {
        await page.route("**/api/chat", drawFlowchart)
        await openApp(page)
        await storeChat(page, {
            ...savedChat("cut", 1000, ["Alpha"]),
            messages: [
                asked("cut-u0", "Draw Alpha"),
                {
                    id: "cut-a0",
                    role: "assistant",
                    parts: [
                        { type: "step-start" },
                        {
                            type: "reasoning",
                            text: "Thinking about it",
                            state: "streaming",
                        },
                    ],
                },
            ],
        })
        await openChat(page, "cut", "Alpha")
        await expect(page.getByText(UNFINISHED)).toBeVisible()
        // Looking at it saves nothing
        await page.waitForTimeout(2500)
        expect((await storedChats(page)).cut.updatedAt).toBe(1000)
        await page.locator('[data-testid="retry-button"]').click()
        await waitForComplete(page)
        await expect(page.getByText("Here is the flowchart.")).toBeVisible()
        await expect(page.getByText(UNFINISHED)).toHaveCount(0)
    })

    test("an edited message is saved with its new text when its answer starts at once", async ({
        page,
    }) => {
        // The second answer starts with the request and never ends
        await chunkedReplies(
            page,
            [
                [createTextOnlyResponse("First answer.")],
                [
                    sse(
                        [
                            { type: "start" },
                            { type: "text-start", id: "t" },
                            { type: "text-delta", id: "t", delta: "Second" },
                        ],
                        false,
                    ),
                ],
            ],
            { holdLast: true },
        )
        await openApp(page)
        await sendMessage(page, "Original question")
        await expect(page.getByText("First answer.")).toBeVisible()
        await page.getByTitle("Click to edit").click()
        await page
            .locator('[data-testid="chat-panel"] textarea')
            .first()
            .fill("Edited question")
        await page.getByRole("button", { name: "Save & submit" }).click()
        await expect(page.getByText("Second")).toBeVisible()
        await expect
            .poll(async () =>
                Object.values(await storedChats(page)).map((chat) =>
                    chat.messages
                        .filter((m: { role: string }) => m.role === "user")
                        .map((m: any) => m.parts[0].text),
                ),
            )
            .toEqual([["Edited question"]])
    })

    test("an answer stopped before it showed anything says Stopped, with Retry, also after a reload", async ({
        page,
    }) => {
        let requests = 0
        await page.route("**/api/chat", async (route) => {
            // The first answer never comes: it is stopped
            if (++requests > 1) await drawFlowchart(route)
        })
        await openApp(page)
        await sendMessage(page, "Create a flowchart")
        await page.getByRole("button", { name: "Stop generation" }).click()
        const stopped = page.getByTestId("stopped-notice")
        await expect(stopped).toHaveText("StoppedRetry")
        await expect
            .poll(async () =>
                Object.values(await storedChats(page)).map(
                    (chat) => chat.messages.length,
                ),
            )
            .toEqual([2])

        // The same after a reload: no card that says the answer was cut off
        await page.reload({ waitUntil: "networkidle" })
        await expect(stopped).toHaveText("StoppedRetry", { timeout: 30000 })
        await expect(page.getByText(UNFINISHED)).toHaveCount(0)
        await stopped.getByTestId("retry-button").click()
        await waitForComplete(page)
        await expect(page.getByText("Here is the flowchart.")).toBeVisible()
        await expect(stopped).toHaveCount(0)
    })

    test("an answer stopped after its shape library lookup says Stopped, with Retry", async ({
        page,
    }) => {
        const library = toolCallEvents("s1", "get_shape_library", {
            library: "aws4",
        })
        // The server looked the library up and the model draws next:
        // nothing more comes before Stop
        await chunkedReplies(
            page,
            [
                [
                    sse(
                        [
                            { type: "start" },
                            { type: "start-step" },
                            library.start,
                            ...library.deltas,
                            library.done,
                            {
                                type: "tool-output-available",
                                toolCallId: "s1",
                                output: "AWS shapes",
                            },
                            { type: "finish-step" },
                            { type: "start-step" },
                        ],
                        false,
                    ),
                ],
            ],
            { holdLast: true },
        )
        await openApp(page)
        await sendMessage(page, "Draw an AWS architecture")
        await expect(
            page.locator(
                '[data-tool-name="get_shape_library"][data-tool-state="output-available"]',
            ),
        ).toBeVisible()
        await page.getByRole("button", { name: "Stop generation" }).click()
        await expect(page.getByTestId("stopped-notice")).toHaveText(
            "StoppedRetry",
        )
    })

    test("an answer stopped while a failed edit is sent back says Stopped, with Retry", async ({
        page,
    }) => {
        // The edit fails, and the request that sends it back never answers
        await chunkedReplies(
            page,
            [
                [
                    sse([
                        { type: "start" },
                        {
                            type: "tool-input-error",
                            toolCallId: "e1",
                            toolName: "edit_diagram",
                            input: "{broken",
                            errorText: "JSON parsing failed",
                        },
                        { type: "finish" },
                    ]),
                ],
                [],
            ],
            { holdLast: true },
        )
        await openApp(page)
        await sendMessage(page, "Add a box")
        await expect(
            page.locator(
                '[data-tool-name="edit_diagram"][data-tool-state="output-error"]',
            ),
        ).toBeVisible()
        await page.getByRole("button", { name: "Stop generation" }).click()
        await expect(page.getByTestId("stopped-notice")).toHaveText(
            "StoppedRetry",
        )
    })

    test("regenerate in a chat saved before versions were kept starts from the diagram before the answer", async ({
        page,
    }) => {
        const bodies: any[] = []
        await page.route("**/api/chat", (route) => {
            bodies.push(route.request().postDataJSON())
            return drawFlowchart(route)
        })
        await openApp(page)
        // No versions; the answer's drawing call tells that it drew Alpha
        const { versions: _none, ...old } = savedChat("old", 1000, ["Alpha"])
        await storeChat(page, {
            ...old,
            xmlSnapshots: [[0, doc("")]],
            messages: [
                asked("old-u0", "Draw Alpha"),
                {
                    id: "old-a0",
                    role: "assistant",
                    parts: [
                        {
                            type: "tool-display_diagram",
                            toolCallId: "old-call",
                            state: "output-available",
                            input: { xml: box("c0", "Alpha", 40) },
                            output: "Successfully displayed the diagram.",
                        },
                    ],
                },
            ],
        })
        await openChat(page, "old", "Alpha")
        await page.getByRole("button", { name: "Regenerate response" }).click()
        await waitForComplete(page)
        // The model drew on the blank canvas the message was sent with,
        // which stays the diagram the message is sent with
        expect(bodies[0].messages.at(-1).metadata.diagram.xml).not.toContain(
            "Alpha",
        )
        await expect
            .poll(async () => (await storedChats(page)).old.messages.length)
            .toBe(2)
        expect((await storedChats(page)).old.xmlSnapshots[0][1]).not.toContain(
            "Alpha",
        )
    })

    test("a version saved before its picture was taken gets it when the chat is opened", async ({
        page,
    }) => {
        await openApp(page)
        // As saved the moment the answer ended: the version has no picture
        await storeChat(page, {
            ...savedChat("fast", 1000, ["Alpha"]),
            versions: [
                {
                    id: "v1",
                    number: 1,
                    xml: doc(box("c0", "Alpha", 40)),
                    turnIndex: 0,
                    summary: {
                        shapesAdded: 1,
                        shapesRemoved: 0,
                        shapesChanged: 0,
                        edgesAdded: 0,
                        edgesRemoved: 0,
                        edgesChanged: 0,
                    },
                    fromScratch: true,
                    onCanvas: true,
                },
            ],
        })
        await openChat(page, "fast", "Alpha")
        await expect
            .poll(async () => (await storedChats(page)).fast.versions[0].svg, {
                timeout: 15000,
            })
            .toMatch(/^data:image\/svg/)
    })
})
