import { expect, test } from "@playwright/test"

const mockDrawio = `<!doctype html>
<script>
    const send = (message) => parent.postMessage(JSON.stringify(message), "*")
    send({ event: "init" })
    addEventListener("message", (event) => {
        const message = JSON.parse(event.data)
        if (message.action !== "load") return
        send({ event: "load", xml: message.xml || "", scale: 1 })
        if (message.xml === "host-diagram") {
            send({ event: "save", xml: message.xml })
        }
    })
</script>`

test.describe("Draw.io embed mode", () => {
    test("shows only a full-screen editor with save and exit controls enabled", async ({
        page,
    }) => {
        await page.route("https://embed.diagrams.net/**", (route) =>
            route.fulfill({ contentType: "text/html", body: mockDrawio }),
        )
        await page.goto("/?embed=1", { waitUntil: "domcontentloaded" })

        const container = page.getByTestId("drawio-embed-container")
        await expect(container).toBeVisible()
        await expect(
            page.locator("textarea[aria-label='Chat input']"),
        ).toHaveCount(0)
        await expect(page.locator('[role="separator"]')).toHaveCount(0)

        const iframe = container.locator("iframe.diagrams-iframe")
        await expect(iframe).toBeAttached()
        const iframeUrl = new URL((await iframe.getAttribute("src")) ?? "")
        expect(iframeUrl.searchParams.get("saveAndExit")).toBe("1")
        expect(iframeUrl.searchParams.get("noSaveBtn")).toBe("0")
        expect(iframeUrl.searchParams.get("noExitBtn")).toBe("0")
    })

    test("bridges the standard init, load, and save messages", async ({
        baseURL,
        page,
    }) => {
        await page.route("https://embed.diagrams.net/**", (route) =>
            route.fulfill({ contentType: "text/html", body: mockDrawio }),
        )
        await page.setContent(`
            <script>
                window.receivedEvents = []
                addEventListener("message", (event) => {
                    const message = JSON.parse(event.data)
                    window.receivedEvents.push(message)
                    if (message.event === "init") {
                        event.source.postMessage(JSON.stringify({
                            action: "load",
                            xml: "host-diagram"
                        }), "*")
                    }
                })
            </script>
            <iframe id="hosted-editor" src="${baseURL}/?embed=1"></iframe>
        `)

        await page.waitForFunction(() =>
            (
                window as typeof window & {
                    receivedEvents: Array<{ event: string; xml?: string }>
                }
            ).receivedEvents.some(
                (message) =>
                    message.event === "save" && message.xml === "host-diagram",
            ),
        )

        const events = await page.evaluate(
            () =>
                (
                    window as typeof window & {
                        receivedEvents: Array<{ event: string; xml?: string }>
                    }
                ).receivedEvents,
        )
        expect(
            events.filter((message) => message.event === "init"),
        ).toHaveLength(1)
        expect(events).toContainEqual({
            event: "load",
            scale: 1,
            xml: "host-diagram",
        })
        expect(events).toContainEqual({ event: "save", xml: "host-diagram" })
    })
})
