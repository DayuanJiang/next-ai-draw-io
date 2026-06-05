import { describe, expect, it } from "vitest"
import { isPrivateUrl } from "@/lib/ssrf-protection"

describe("isPrivateUrl", () => {
    it("blocks private IPv6 URLs", () => {
        expect(isPrivateUrl("http://[::1]/")).toBe(true)
        expect(isPrivateUrl("http://[0:0:0:0:0:0:0:1]/")).toBe(true)
        expect(isPrivateUrl("http://[::]/")).toBe(true)
        expect(isPrivateUrl("http://[::ffff:127.0.0.1]/")).toBe(true)
        expect(isPrivateUrl("http://[fc00::1]/")).toBe(true)
        expect(isPrivateUrl("http://[fd12:3456:789a::1]/")).toBe(true)
        expect(isPrivateUrl("http://[fe80::1]/")).toBe(true)
        expect(isPrivateUrl("http://[fe9f::1]/")).toBe(true)
        expect(isPrivateUrl("http://[febf::1]/")).toBe(true)
    })

    it("allows public URLs", () => {
        expect(isPrivateUrl("https://example.com/article")).toBe(false)
        expect(isPrivateUrl("https://fc00.example.com/article")).toBe(false)
    })
})
