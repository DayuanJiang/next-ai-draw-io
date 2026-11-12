/**
 * Starting the embedded HTTP server when its port cannot be used. In a file
 * of its own: the server is module state, and the other tests start one.
 */

import http from "node:http"
import net from "node:net"
import { afterAll, describe, expect, it } from "vitest"
import { shutdown, startHttpServer } from "../src/http-server.ts"

afterAll(() => shutdown())

/** Another program on a port above 6020, where no next port is tried */
function occupyPort(): Promise<net.Server> {
    return new Promise((resolve, reject) => {
        const blocker = net.createServer()
        blocker.on("error", reject)
        blocker.listen(0, "127.0.0.1", () => resolve(blocker))
    })
}

describe("startHttpServer", () => {
    it("fails on every call for a PORT that is no port", async () => {
        await expect(startHttpServer(70000)).rejects.toThrow()
        await expect(startHttpServer(70000)).rejects.toThrow()
    })

    it("fails on every call while the port is taken, and starts once it is free", async () => {
        const blocker = await occupyPort()
        const port = (blocker.address() as net.AddressInfo).port
        expect(port).toBeGreaterThan(6020)

        // The second call used to resolve with the port of the other program
        await expect(startHttpServer(port)).rejects.toThrow(
            `Port ${port} is in use`,
        )
        await expect(startHttpServer(port)).rejects.toThrow(
            `Port ${port} is in use`,
        )

        await new Promise((resolve) => blocker.close(resolve))
        expect(await startHttpServer(port)).toBe(port)
        // This process answers there (403: the request carries no token)
        const status = await new Promise<number | undefined>(
            (resolve, reject) => {
                http.get(
                    {
                        host: "127.0.0.1",
                        port,
                        path: "/api/state?sessionId=mcp-start",
                        headers: { host: `localhost:${port}` },
                    },
                    (res) => {
                        res.resume()
                        resolve(res.statusCode)
                    },
                ).on("error", reject)
            },
        )
        expect(status).toBe(403)
    })
})
