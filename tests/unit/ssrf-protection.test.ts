import { beforeEach, describe, expect, it, vi } from "vitest"
import { isPrivateUrl } from "@/lib/ssrf-protection"

// Mock DNS so tests are deterministic and never hit the network.
const lookupMock = vi.hoisted(() => vi.fn())
vi.mock("node:dns/promises", () => ({
    default: { lookup: lookupMock },
    lookup: lookupMock,
}))

describe("isPrivateUrl", () => {
    beforeEach(() => {
        lookupMock.mockReset()
    })

    it("blocks private IPv6 URLs (string-only fast path, no DNS)", async () => {
        expect(await isPrivateUrl("http://[::1]/")).toBe(true)
        expect(await isPrivateUrl("http://[0:0:0:0:0:0:0:1]/")).toBe(true)
        expect(await isPrivateUrl("http://[::]/")).toBe(true)
        expect(await isPrivateUrl("http://[::ffff:127.0.0.1]/")).toBe(true)
        expect(await isPrivateUrl("http://[fc00::1]/")).toBe(true)
        expect(await isPrivateUrl("http://[fd12:3456:789a::1]/")).toBe(true)
        expect(await isPrivateUrl("http://[fe80::1]/")).toBe(true)
        expect(await isPrivateUrl("http://[fe9f::1]/")).toBe(true)
        expect(await isPrivateUrl("http://[febf::1]/")).toBe(true)
        expect(lookupMock).not.toHaveBeenCalled()
    })

    it("blocks literal private IPv4 without DNS", async () => {
        expect(await isPrivateUrl("http://127.0.0.1/")).toBe(true)
        expect(await isPrivateUrl("http://10.0.0.5/")).toBe(true)
        expect(await isPrivateUrl("http://192.168.1.1/")).toBe(true)
        expect(await isPrivateUrl("http://169.254.169.254/")).toBe(true)
        expect(await isPrivateUrl("http://0.0.0.0/")).toBe(true)
        // 100.64.0.0/10 CGNAT (RFC 6598), routable in some cloud internal nets
        expect(await isPrivateUrl("http://100.64.0.1/")).toBe(true)
        expect(await isPrivateUrl("http://100.127.255.255/")).toBe(true)
        expect(lookupMock).not.toHaveBeenCalled()
    })

    it("treats CGNAT boundaries correctly", async () => {
        // 100.63.x and 100.128.x are outside 100.64.0.0/10 → public
        lookupMock.mockResolvedValue([{ address: "100.63.255.255", family: 4 }])
        expect(await isPrivateUrl("http://just-below.example/")).toBe(false)
        lookupMock.mockResolvedValue([{ address: "100.128.0.1", family: 4 }])
        expect(await isPrivateUrl("http://just-above.example/")).toBe(false)
    })

    it("blocks a hostname that resolves to a private IPv6 address", async () => {
        lookupMock.mockResolvedValue([{ address: "fd00::1", family: 6 }])
        expect(await isPrivateUrl("http://v6.example.com/")).toBe(true)
    })

    it("allows public URLs that resolve to public IPs", async () => {
        lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
        expect(await isPrivateUrl("https://example.com/article")).toBe(false)
    })

    it("blocks public-looking hostnames that resolve to a private IP (DNS-rebinding-style bypass)", async () => {
        // e.g. 127-0-0-1.sslip.io resolves to 127.0.0.1
        lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }])
        expect(await isPrivateUrl("http://127-0-0-1.sslip.io/")).toBe(true)
    })

    it("blocks when any resolved address is private", async () => {
        lookupMock.mockResolvedValue([
            { address: "93.184.216.34", family: 4 },
            { address: "10.1.2.3", family: 4 },
        ])
        expect(await isPrivateUrl("http://mixed.example.com/")).toBe(true)
    })

    it("blocks when DNS resolution fails", async () => {
        lookupMock.mockRejectedValue(new Error("ENOTFOUND"))
        expect(await isPrivateUrl("http://does-not-resolve.example/")).toBe(
            true,
        )
    })
})
