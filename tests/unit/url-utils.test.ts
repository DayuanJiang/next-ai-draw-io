import { afterEach, describe, expect, it, vi } from "vitest"
import { STORAGE_KEYS } from "@/lib/storage"
import { extractUrlContent } from "@/lib/url-utils"

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

        const data = await extractUrlContent("https://example.com")

        expect(data.content).toBe("body")
        const headers = fetchMock.mock.calls[0][1].headers
        expect(headers["x-access-code"]).toBe("secret")
    })
})
