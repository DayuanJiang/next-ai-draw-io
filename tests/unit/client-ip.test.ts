import { NextRequest } from "next/server"
import { afterEach, describe, expect, it } from "vitest"
import { getUserIdFromRequest } from "@/lib/user-id"
import { proxy } from "@/proxy"

const idFor = (ip: string) => `user-${Buffer.from(ip).toString("base64url")}`

afterEach(() => {
    delete process.env.CLIENT_IP_HEADER
    delete process.env.ORIGIN_SECRET
})

describe("getUserIdFromRequest", () => {
    const req = new Request("http://localhost/api/chat", {
        headers: {
            "x-forwarded-for": "203.0.113.9, 198.51.100.7",
            "cf-connecting-ip": "198.51.100.7",
        },
    })

    it("uses the first X-Forwarded-For entry by default", () => {
        expect(getUserIdFromRequest(req)).toBe(idFor("203.0.113.9"))
    })

    it("uses CLIENT_IP_HEADER when set", () => {
        process.env.CLIENT_IP_HEADER = "cf-connecting-ip"
        expect(getUserIdFromRequest(req)).toBe(idFor("198.51.100.7"))
    })

    it("is anonymous when the configured header is missing", () => {
        process.env.CLIENT_IP_HEADER = "cf-connecting-ip"
        expect(
            getUserIdFromRequest(new Request("http://localhost/api/chat")),
        ).toBe("anonymous")
    })
})

describe("ORIGIN_SECRET", () => {
    const call = (path: string, secret?: string) =>
        proxy(
            new NextRequest(`http://localhost${path}`, {
                headers: secret ? { "x-origin-secret": secret } : {},
            }),
        )

    it("lets every API call through when unset", () => {
        expect(call("/api/chat")).toBeUndefined()
    })

    it("refuses API calls without the right header", async () => {
        process.env.ORIGIN_SECRET = "s3cret"
        for (const res of [call("/api/chat"), call("/api/chat", "wrong")]) {
            expect(res?.status).toBe(403)
        }
        expect(call("/api/chat", "s3cret")).toBeUndefined()
    })

    it("leaves pages alone, such as the health check on /", () => {
        process.env.ORIGIN_SECRET = "s3cret"
        expect(call("/")?.status).toBe(307)
        expect(call("/en")).toBeUndefined()
    })
})
