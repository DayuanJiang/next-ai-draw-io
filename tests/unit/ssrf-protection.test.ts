import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isPrivateUrl, redirectGuardedFetch } from "@/lib/ssrf-protection"

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

describe("redirectGuardedFetch with the quota on", () => {
    const answers = (map: Record<string, Response>) =>
        vi.fn(
            async (url: string) =>
                map[String(url)] ?? new Response("?", { status: 404 }),
        )

    beforeEach(() => {
        lookupMock.mockReset()
        // Hosts ending in .example are public
        lookupMock.mockImplementation(async (host: string) =>
            host.endsWith(".example")
                ? [{ address: "93.184.216.34", family: 4 }]
                : [],
        )
        process.env.DYNAMODB_QUOTA_TABLE = "quota"
        delete process.env.ALLOW_PRIVATE_URLS
    })

    afterEach(() => {
        delete process.env.DYNAMODB_QUOTA_TABLE
        vi.unstubAllGlobals()
    })

    it("follows a redirect to a public address", async () => {
        // A user's own proxy that moves http to https
        vi.stubGlobal(
            "fetch",
            answers({
                "http://proxy.example/v1/chat": new Response(null, {
                    status: 308,
                    headers: { location: "https://proxy.example/v1/chat" },
                }),
                "https://proxy.example/v1/chat": new Response("ok"),
            }),
        )
        const guarded = redirectGuardedFetch()
        expect(guarded).toBeDefined()
        const res = await guarded?.("http://proxy.example/v1/chat", {
            method: "POST",
            body: "{}",
        })
        expect(await res?.text()).toBe("ok")
    })

    it("refuses a redirect to the server's own network", async () => {
        // It would be counted as a public endpoint while using the server's
        vi.stubGlobal(
            "fetch",
            answers({
                "https://public.example/api/chat": new Response(null, {
                    status: 307,
                    headers: { location: "http://127.0.0.1:11434/api/chat" },
                }),
            }),
        )
        await expect(
            redirectGuardedFetch()?.("https://public.example/api/chat", {
                method: "POST",
                body: "{}",
            }),
        ).rejects.toThrow(/private addresses/)
        expect(fetch).toHaveBeenCalledTimes(1)
    })

    it("follows a private address's redirect to another one", async () => {
        // Counted as the server's from the start
        vi.stubGlobal(
            "fetch",
            answers({
                "http://10.0.0.5:4000/v1/chat": new Response(null, {
                    status: 307,
                    headers: { location: "http://10.0.0.6:4000/v1/chat" },
                }),
                "http://10.0.0.6:4000/v1/chat": new Response("ok"),
            }),
        )
        const res = await redirectGuardedFetch()?.(
            "http://10.0.0.5:4000/v1/chat",
            { method: "POST", body: "{}" },
        )
        expect(await res?.text()).toBe("ok")
    })

    it("sends no credentials to another origin", async () => {
        const fetchMock = answers({
            "https://proxy.example/v1/chat": new Response(null, {
                status: 307,
                headers: { location: "https://other.example/v1/chat" },
            }),
            "https://other.example/v1/chat": new Response("ok"),
        })
        vi.stubGlobal("fetch", fetchMock)
        await redirectGuardedFetch()?.("https://proxy.example/v1/chat", {
            method: "POST",
            body: "{}",
            headers: {
                Authorization: "Bearer user-key",
                Cookie: "eo_token=1",
                "x-api-key": "anthropic-key",
                "x-goog-api-key": "google-key",
                "api-key": "azure-key",
                "Content-Type": "application/json",
            },
        })
        const sent = (call: number) =>
            new Headers(
                (
                    fetchMock.mock.calls[call] as unknown as [
                        string,
                        RequestInit,
                    ]
                )[1].headers,
            )
        expect(sent(0).get("authorization")).toBe("Bearer user-key")
        expect(sent(1).get("authorization")).toBeNull()
        expect(sent(1).get("cookie")).toBeNull()
        for (const name of ["x-api-key", "x-goog-api-key", "api-key"]) {
            expect(sent(1).get(name)).toBeNull()
        }
        expect(sent(1).get("content-type")).toBe("application/json")
    })

    it("is not used without the quota", () => {
        delete process.env.DYNAMODB_QUOTA_TABLE
        expect(redirectGuardedFetch()).toBeUndefined()
    })
})
