// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as chat } from "@/app/api/chat/route"
import { POST as parseUrl } from "@/app/api/parse-url/route"
import { POST as providerModels } from "@/app/api/provider-models/route"
import { POST as validateDiagram } from "@/app/api/validate-diagram/route"
import { POST as validateModel } from "@/app/api/validate-model/route"

// The routes that run models or fetch URLs, which a page on another site
// could otherwise make the user's own server do
const ROUTES = {
    chat,
    "parse-url": parseUrl,
    "provider-models": providerModels,
    "validate-diagram": validateDiagram,
    "validate-model": validateModel,
}

const body = JSON.stringify({
    messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    ],
    url: "https://example.com",
    provider: "openai",
    apiKey: "k",
    modelId: "gpt-5.5",
    imageData: "data:image/png;base64,AAAA",
})

const saved = process.env.NEXT_AI_DRAWIO_DESKTOP

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            throw new Error("no network in tests")
        }),
    )
})

afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_AI_DRAWIO_DESKTOP
    else process.env.NEXT_AI_DRAWIO_DESKTOP = saved
    vi.unstubAllGlobals()
})

describe("requests another website could send", () => {
    for (const [name, post] of Object.entries(ROUTES)) {
        it(`${name}: refuses a text body, which needs no CORS preflight`, async () => {
            // fetch(..., { mode: "no-cors", body: JSON.stringify(...) })
            // from another site arrives as text/plain
            const res = await post(
                new Request(`http://127.0.0.1:61337/api/${name}`, {
                    method: "POST",
                    body,
                }),
            )
            expect(res.status).toBe(415)
            expect(fetch).not.toHaveBeenCalled()
        })

        it(`${name}: desktop app refuses a foreign Host (DNS rebinding)`, async () => {
            process.env.NEXT_AI_DRAWIO_DESKTOP = "1"
            const res = await post(
                new Request(`http://127.0.0.1:61337/api/${name}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        host: "rebind.attacker.example:61337",
                    },
                    body,
                }),
            )
            expect(res.status).toBe(403)
            expect(fetch).not.toHaveBeenCalled()
        })
    }

    it("lets the desktop window's own requests through", async () => {
        process.env.NEXT_AI_DRAWIO_DESKTOP = "1"
        const res = await validateModel(
            new Request("http://127.0.0.1:61337/api/validate-model", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    host: "127.0.0.1:61337",
                },
                body: JSON.stringify({ provider: "openai" }),
            }),
        )
        // Past the check: the route's own validation answers
        expect(res.status).toBe(400)
        expect(await res.text()).toMatch(/required/)
    })
})
