import { expect, getChatInput, getIframe, test } from "./lib/fixtures"

test("a script chunk that is gone after a new deployment reloads the page", async ({
    page,
}) => {
    // The scripts the About page's own HTML names load. Those of the editor
    // it links to are gone, as after a new deployment, until the browser
    // loads a page again.
    const html = await (await page.request.get("/en/about")).text()
    const own = new Set(
        [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map(
            (match) => match[1],
        ),
    )
    let pageLoads = 0
    page.on("request", (request) => {
        if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
        ) {
            pageLoads++
        }
    })
    await page.route("**/_next/static/chunks/*.js", (route) =>
        pageLoads > 1 || own.has(new URL(route.request().url()).pathname)
            ? route.continue()
            : route.fulfill({ status: 404 }),
    )
    await page.goto("/en/about", { waitUntil: "networkidle" })
    await page.locator('a[href="/en"]').first().click()

    // Without the reload, "Failed to load chunk" showed the crash screen
    await expect.poll(() => pageLoads).toBe(2)
    await expect(getIframe(page)).toBeVisible({ timeout: 30000 })
    await expect(getChatInput(page)).toBeVisible()
    await expect(page.getByText("Something went wrong")).toHaveCount(0)
})
