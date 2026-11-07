import http from "node:http"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.stubEnv("DRAWIO_PREVIEW_URL", "https://diagram.example.net:13443")
const server = await import("../src/http-server.ts")
let port: number
beforeAll(async () => {
    port = await server.startHttpServer(
        45000 + Math.floor(Math.random() * 1000),
    )
})
afterAll(() => server.shutdown())

function request(
    path: string,
    headers: Record<string, string> = {},
    method = "GET",
) {
    return new Promise<{
        status: number
        headers: http.IncomingHttpHeaders
        body: string
    }>((resolve, reject) => {
        const req = http.request(
            {
                host: "127.0.0.1",
                port,
                path,
                method,
                headers: {
                    host: "diagram.example.net:13443",
                    "x-drawio-token": server.getApiToken(),
                    ...headers,
                },
            },
            (res) => {
                let body = ""
                res.on("data", (chunk) => {
                    body += chunk
                })
                res.on("end", () =>
                    resolve({
                        status: res.statusCode!,
                        headers: res.headers,
                        body,
                    }),
                )
            },
        )
        req.on("error", reject)
        req.end()
    })
}

describe("trusted remote preview", () => {
    it("uses the trusted origin for both preview variants", () => {
        expect(server.previewUrl(port, "mcp-remote", "classic")).toBe(
            "https://diagram.example.net:13443?mcp=mcp-remote",
        )
        expect(server.previewUrl(port, "mcp-remote")).toMatch(
            /^https:\/\/diagram.example.net:13443(?:\/shell\/)?\?mcp=mcp-remote$/,
        )
    })
    it("validates explicit canonical origin URLs", () => {
        expect(server.previewOriginFromEnv({})).toBeUndefined()
        for (const value of [
            "https://diagram.example.net",
            "https://diagram.example.net/",
            "http://localhost:6010",
            "http://127.0.0.1:6010/",
        ]) {
            expect(
                server.previewOriginFromEnv({ DRAWIO_PREVIEW_URL: value }),
            ).toBe(value.replace(/\/$/, ""))
        }
        for (const value of [
            "",
            "diagram.example.net",
            "//diagram.example.net",
            "http://diagram.example.net",
            "ftp://diagram.example.net",
            "https://user:pass@diagram.example.net",
            "https://diagram.example.net/path",
            "https://diagram.example.net/a/..",
            "https://diagram.example.net?",
            "https://diagram.example.net#",
            "https://diagram.example.net?x=1",
            "https://diagram.example.net/#x",
            " https://diagram.example.net",
            "https://diagram.example.net\\path",
        ]) {
            expect(() =>
                server.previewOriginFromEnv({ DRAWIO_PREVIEW_URL: value }),
            ).toThrow("DRAWIO_PREVIEW_URL")
        }
    })
    it("accepts only the exact Host and matching Origin", async () => {
        expect((await request("/?mcp=mcp-remote")).status).toBe(200)
        const res = await request("/api/state?sessionId=mcp-remote", {
            origin: "https://diagram.example.net:13443",
        })
        expect(res.status).toBe(200)
        expect(res.headers["access-control-allow-origin"]).toBe(
            "https://diagram.example.net:13443",
        )
        for (const host of [
            "evil.example",
            "diagram.example.net",
            "diagram.example.net:13444",
            "diagram.example.net.evil:13443",
        ]) {
            expect((await request("/", { host })).status).toBe(403)
        }
        for (const origin of [
            "null",
            "https://evil.example",
            "http://diagram.example.net:13443",
            "https://diagram.example.net",
            "http://localhost:6010",
        ]) {
            expect(
                (await request("/api/state?sessionId=mcp-remote", { origin }))
                    .status,
            ).toBe(403)
        }
        expect(
            (
                await request("/", {
                    host: "evil.example",
                    "x-forwarded-host": "diagram.example.net:13443",
                    "x-forwarded-proto": "https",
                })
            ).status,
        ).toBe(403)
    })
    it("preserves tokens, same-origin framing and localhost access", async () => {
        expect(
            (
                await request("/api/state?sessionId=mcp-remote", {
                    "x-drawio-token": "",
                })
            ).status,
        ).toBe(403)
        expect(
            (await request("/?mcp=mcp-remote")).headers[
                "content-security-policy"
            ],
        ).toBe("frame-ancestors 'self'")
        expect(
            (
                await request("/?mcp=mcp-remote", {
                    host: `localhost:${port}`,
                    origin: `http://localhost:${port}`,
                })
            ).status,
        ).toBe(200)
        expect(
            (
                await request("/?mcp=mcp-remote", {
                    host: `localhost:${port}`,
                    origin: "https://diagram.example.net:13443",
                })
            ).status,
        ).toBe(403)
        const redirect = await request("/shell?mcp=mcp-remote")
        expect(redirect.status).toBe(302)
        expect(redirect.headers.location).toBe("/shell/?mcp=mcp-remote")
        expect(
            (
                await request(
                    "/api/state",
                    { origin: "https://evil.example" },
                    "OPTIONS",
                )
            ).status,
        ).toBe(403)
    })
})
