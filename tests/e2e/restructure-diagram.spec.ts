/**
 * restructure_diagram through the real tool path, in the real app.
 *
 * The unit tests cover the engine; this covers the wiring: a tool call arriving on the
 * stream, the client handler reading the live canvas, the engine running in the browser,
 * and the result landing in the editor.
 */
import { expect, test } from "@playwright/test"
import * as pako from "pako"
import { getChatInput, sendMessage } from "./lib/fixtures"
import { createMockToolResponse } from "./lib/helpers"

/**
 * Undo draw.io's export compression: the <diagram> body is URI-encoded, raw-deflated and
 * base64'd. Returns the document unchanged when it is already plain XML.
 */
function inflateDiagram(xml: string): string | null {
    if (xml.includes("<mxCell")) return xml
    const body = xml.match(/<diagram[^>]*>([^<]+)<\/diagram>/)?.[1]
    if (!body) return null
    try {
        const bin = Buffer.from(body, "base64")
        const out = pako.inflate(new Uint8Array(bin), { windowBits: -15 })
        return decodeURIComponent(new TextDecoder("utf-8").decode(out))
    } catch {
        return null
    }
}

/** Operations that build a small VPC diagram from an empty canvas. */
const BUILD = {
    operations: [
        { op: "set_title", title: "Test VPC" },
        { op: "add_box", id: "users", label: "Users" },
        {
            op: "add_container",
            id: "vpc",
            label: "VPC 10.0.0.0/16",
            dir: "col",
            gname: "group_vpc",
        },
        {
            op: "add_icon",
            id: "alb",
            parent: "vpc",
            name: "application_load_balancer",
            label: "ALB",
        },
        { op: "add_icon", id: "ec2", parent: "vpc", name: "ec2", label: "EC2" },
        { op: "link", source: "users", target: "alb", label: "HTTPS", step: 1 },
        { op: "link", source: "alb", target: "ec2", label: "route", step: 2 },
    ],
}

test.describe("restructure_diagram", () => {
    test("a structural tool call renders a diagram in the editor", async ({
        page,
    }) => {
        test.setTimeout(180000)

        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockToolResponse(
                    "restructure_diagram",
                    BUILD,
                    "Building the VPC diagram.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 60000 })
        await page.waitForTimeout(6000)

        await sendMessage(page, "Draw a simple VPC")

        // The engine's output has to actually reach the canvas.
        const canvas = page.frameLocator("iframe")
        await expect(
            canvas.getByText("VPC 10.0.0.0/16", { exact: true }).first(),
        ).toBeVisible({ timeout: 30000 })
        await expect(
            canvas.getByText("ALB", { exact: true }).first(),
        ).toBeVisible({ timeout: 20000 })
        await expect(
            canvas.getByText("Users", { exact: true }).first(),
        ).toBeVisible({ timeout: 20000 })
        await expect(
            canvas.getByText("Test VPC", { exact: true }).first(),
        ).toBeVisible({ timeout: 20000 })

        // Step numbers come through on the edge labels.
        await expect(
            canvas.getByText("1. HTTPS", { exact: true }).first(),
        ).toBeVisible({ timeout: 20000 })

        // And the XML carries real stencils and container markers, not a fallback box.
        // Ask the editor for the document directly rather than waiting for an autosave:
        // loading a diagram does not always trigger one, and clicking a shape to force it
        // is unreliable when an edge overlaps the label.
        const xml = await page.evaluate(
            () =>
                new Promise<string | null>((resolve) => {
                    const iframe = document.querySelector(
                        "iframe",
                    ) as HTMLIFrameElement
                    const onMsg = (e: MessageEvent) => {
                        if (typeof e.data !== "string") return
                        try {
                            const m = JSON.parse(e.data)
                            if (m.event === "export" && m.xml) {
                                window.removeEventListener("message", onMsg)
                                resolve(m.xml as string)
                            }
                        } catch {
                            /* not our message */
                        }
                    }
                    window.addEventListener("message", onMsg)
                    iframe.contentWindow?.postMessage(
                        JSON.stringify({
                            action: "export",
                            format: "xmlsvg",
                            xml: 1,
                        }),
                        "*",
                    )
                    setTimeout(() => {
                        window.removeEventListener("message", onMsg)
                        resolve(null)
                    }, 10000)
                }),
        )

        expect(xml, "editor did not return the document").toBeTruthy()
        // draw.io compresses the <diagram> body on export (base64 + raw deflate).
        const plain = xml ? inflateDiagram(xml) : null
        expect(plain, "could not decompress the exported diagram").toBeTruthy()
        if (plain) {
            expect(plain).toContain("resIcon=mxgraph.aws4.ec2")
            expect(plain).toContain("grIcon=mxgraph.aws4.group_vpc")
            expect(plain).toContain("container=1")
            expect(plain).toContain("dai_dir=col")
        }
    })

    test("an invented stencil name comes back as a correctable error", async ({
        page,
    }) => {
        test.setTimeout(120000)

        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockToolResponse(
                    "restructure_diagram",
                    {
                        operations: [
                            {
                                op: "add_icon",
                                id: "x",
                                name: "s3_bucket_storage",
                                label: "Bucket",
                            },
                        ],
                    },
                    "Adding a bucket.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 60000 })
        await page.waitForTimeout(6000)

        await sendMessage(page, "Add an S3 bucket")

        // The call is rejected rather than rendering a blank square where the icon should
        // be. The catalog's suggestions go back to the model over the tool-result
        // channel; the UI only shows that the tool errored (which is how this repo
        // surfaces every tool error — see error-handling.spec.ts).
        await expect(page.locator('text="Error"').first()).toBeVisible({
            timeout: 30000,
        })

        // Nothing was drawn.
        const canvas = page.frameLocator("iframe")
        await expect(canvas.getByText("Bucket", { exact: true })).toHaveCount(0)
    })

    test("a second call edits the existing diagram instead of replacing it", async ({
        page,
    }) => {
        test.setTimeout(240000)

        let call = 0
        await page.route("**/api/chat", async (route) => {
            call++
            const body =
                call === 1
                    ? createMockToolResponse(
                          "restructure_diagram",
                          BUILD,
                          "Building it.",
                      )
                    : createMockToolResponse(
                          "restructure_diagram",
                          {
                              operations: [
                                  {
                                      op: "add_icon",
                                      id: "rds",
                                      parent: "vpc",
                                      name: "rds",
                                      label: "RDS",
                                  },
                                  {
                                      op: "link",
                                      source: "ec2",
                                      target: "rds",
                                      label: "query",
                                  },
                              ],
                          },
                          "Adding the database.",
                      )
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body,
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 60000 })
        await page.waitForTimeout(6000)

        const canvas = page.frameLocator("iframe")
        await sendMessage(page, "Draw a simple VPC")
        await expect(
            canvas.getByText("ALB", { exact: true }).first(),
        ).toBeVisible({ timeout: 30000 })

        // Second turn: one operation adds a node. Everything from the first turn stays.
        await getChatInput(page).waitFor({ state: "visible" })
        await sendMessage(page, "Add a database")

        await expect(
            canvas.getByText("RDS", { exact: true }).first(),
        ).toBeVisible({ timeout: 30000 })
        await expect(
            canvas.getByText("ALB", { exact: true }).first(),
        ).toBeVisible()
        await expect(
            canvas.getByText("Users", { exact: true }).first(),
        ).toBeVisible()
        await expect(
            canvas.getByText("VPC 10.0.0.0/16", { exact: true }).first(),
        ).toBeVisible()
    })
})
