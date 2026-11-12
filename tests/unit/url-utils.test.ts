import { afterEach, describe, expect, it, vi } from "vitest"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import zh from "@/lib/i18n/dictionaries/zh.json"
import { STORAGE_KEYS } from "@/lib/storage"
import { extractUrlContent } from "@/lib/url-utils"

const dict = zh as unknown as Dictionary

describe("extractUrlContent", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        localStorage.clear()
    })

    it("sends the saved access code with the request", async () => {
        localStorage.setItem(STORAGE_KEYS.accessCode, "secret")
        const body = { title: "T", content: "body", charCount: 4 }
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response(JSON.stringify(body)))
        vi.stubGlobal("fetch", fetchMock)

        const data = await extractUrlContent("https://example.com", dict)

        expect(data.content).toBe("body")
        const headers = fetchMock.mock.calls[0][1].headers
        expect(headers["x-access-code"]).toBe("secret")
    })

    it("reports a failure in the page's language, by the server's code", async () => {
        const answer = (status: number, body: unknown) =>
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    async () => new Response(JSON.stringify(body), { status }),
                ),
            )
        const failure = () =>
            extractUrlContent("https://example.com", dict).catch(
                (e: Error) => e.message,
            )

        answer(400, {
            error: "The website answered with status 404",
            code: "http_error",
            status: 404,
        })
        expect(await failure()).toBe("网站返回了错误（404）。")

        answer(400, {
            error: "Content exceeds 150k character limit (473.9k chars)",
            code: "too_long",
            limit: 150,
            size: "473.9",
        })
        expect(await failure()).toBe(
            "页面文字超过了 150k 字符的上限（473.9k 字符）。",
        )

        // No code: the general text, not the server's English one
        answer(400, { error: "Could not fetch URL content" })
        expect(await failure()).toBe(zh.url.failed)

        answer(401, { error: "Invalid or missing access code." })
        expect(await failure()).toBe(zh.errors.invalidAccessCode)
    })
})
