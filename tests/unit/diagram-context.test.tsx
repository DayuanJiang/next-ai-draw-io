import { deflateRawSync } from "node:zlib"
import { act, renderHook } from "@testing-library/react"
import type React from "react"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DiagramProvider, useDiagram } from "@/contexts/diagram-context"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// The provider with a stand-in draw.io that records each export request;
// started: draw.io has reported its first load
function setup({ started = true } = {}) {
    const { result } = renderHook(() => useDiagram(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
            <DiagramProvider>{children}</DiagramProvider>
        ),
    })
    const requests: { format: string; message: string }[] = []
    const load = vi.fn()
    result.current.drawioRef.current = {
        exportDiagram: (r: any) => requests.push(r),
        load,
    } as any
    if (started) act(() => result.current.onDrawioLoad())
    // draw.io's reply to a request: it echoes the request in `message`.
    // Async, so what the caller does with the result runs before it returns
    const reply = (request: { message: string }, data: string, xml = "") =>
        act(async () => {
            result.current.handleDiagramExport({
                event: "export",
                data,
                xml,
                format: "xmlsvg",
                message: request,
            } as any)
        })
    return { result, requests, reply, load }
}

const oneBox =
    '<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Held" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'

// An editable SVG as draw.io exports it: the diagram, compressed, in its
// content attribute
const svgOf = (label: string) => {
    const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="${label}" vertex="1" parent="1"/></root></mxGraphModel>`
    const packed = deflateRawSync(
        Buffer.from(encodeURIComponent(model)),
    ).toString("base64")
    const content = `<mxfile><diagram id="p">${packed}</diagram></mxfile>`
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" content="${content}"></svg>`
    return `data:image/svg+xml;base64,${btoa(svg)}`
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe("exports in flight at the same time", () => {
    it("give the chat's export only its own reply", async () => {
        const { result, requests, reply } = setup()
        // An edit's history export is still on its way when the chat exports
        const older = result.current.fetchDiagramXml()
        const current = result.current.fetchDiagramXml()
        let currentDone = false
        current.then(() => {
            currentDone = true
        })
        await reply(requests[0], svgOf("older"))
        expect(await older).toContain('value="older"')
        expect(currentDone).toBe(false)
        await reply(requests[1], svgOf("current"))
        expect(await current).toContain('value="current"')
    })

    it("save each file with its own result", async () => {
        const { result, requests, reply } = setup()
        const saved: { name: string; href: string }[] = []
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
            function (this: HTMLAnchorElement) {
                saved.push({ name: this.download, href: this.href })
            },
        )
        const blobs = new Map<string, Blob>()
        URL.createObjectURL = vi.fn((blob: Blob) => {
            const url = `blob:test-${blobs.size}`
            blobs.set(url, blob)
            return url
        })
        URL.revokeObjectURL = vi.fn()
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("{}")),
        )

        const twoPages =
            '<mxfile><diagram id="a" name="A"><mxGraphModel><root/></mxGraphModel></diagram><diagram id="b" name="B"><mxGraphModel><root/></mxGraphModel></diagram></mxfile>'
        act(() => {
            result.current.saveDiagramToFile("doc", "drawio")
            result.current.saveDiagramToFile("pic", "png")
        })
        // The PNG answers first
        await reply(requests[1], "data:image/png;base64,iVBORw0KGgo=")
        await reply(requests[0], svgOf("doc"), twoPages)

        expect(saved.map((s) => s.name)).toEqual(["pic.png", "doc.drawio"])
        expect(saved[0].href).toMatch(/^data:image\/png/)
        const file = blobs.get(saved[1].href)
        const text = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.readAsText(file as Blob)
        })
        expect(text).toContain('name="A"')
        expect(text).toContain('name="B"')
        vi.unstubAllGlobals()
    })
})

describe("the app's own exports", () => {
    it("read the page's XML without waiting for the diagram's pictures", async () => {
        const { result, requests, reply } = setup()
        const xml = result.current.fetchDiagramXml()
        expect(requests[0]).toMatchObject({
            format: "xmlsvg",
            embedImages: false,
        })
        await reply(requests[0], svgOf("x"))
        expect(await xml).toContain('value="x"')
    })

    it("take a version's picture in the format that leaves the canvas usable", async () => {
        const { result, requests, reply } = setup()
        const svg = result.current.getVersionSvg()
        // A plain "svg" export locks the canvas while pictures download
        expect(requests[0]).toMatchObject({ format: "xmlsvg", theme: "auto" })
        await reply(requests[0], svgOf("x"))
        expect(await svg).toBe(svgOf("x"))
    })

    it("take the screenshot check's picture of the page on screen", async () => {
        const { result, requests, reply } = setup()
        act(() => {
            result.current.loadDiagram(oneBox, true)
        })
        const png = result.current.captureValidationPng()
        expect(requests[0]).toMatchObject({ format: "png", currentPage: true })
        await reply(requests[0], "data:image/png;base64,iVBORw0KGgo=")
        expect(await png).toMatch(/^data:image\/png/)
    })

    it("take the screenshot check's picture of the page it is given", async () => {
        const { result, requests } = setup()
        act(() => {
            result.current.loadDiagram(oneBox, true)
        })
        // The page the AI drew on, also when another one is on screen
        result.current.captureValidationPng("p")
        expect(requests[0]).toMatchObject({ format: "png", pageId: "p" })
        expect(requests[0]).not.toHaveProperty("currentPage")
    })
})

describe("before draw.io has started", () => {
    it("the chat gets the page of the document held, with no export", async () => {
        const { result, requests, load } = setup({ started: false })
        act(() => {
            result.current.loadDiagram(oneBox, true)
        })
        load.mockClear()
        // An export sent now would be lost, and the send would fail
        expect(await result.current.fetchDiagramXml()).toContain('value="Held"')
        expect(requests).toEqual([])

        // draw.io's first load puts the document on the canvas; from then
        // on the canvas is asked
        act(() => result.current.onDrawioLoad())
        expect(load).toHaveBeenCalledTimes(1)
        expect(load.mock.calls[0][0].xml).toContain('value="Held"')
        result.current.fetchDiagramXml()
        expect(requests).toHaveLength(1)
    })

    it("an empty canvas is the blank page", async () => {
        const { result, requests } = setup({ started: false })
        const xml = await result.current.fetchDiagramXml()
        expect(xml).toContain("<mxGraphModel")
        expect(xml).not.toContain("vertex")
        expect(requests).toEqual([])
    })
})

describe("exported files", () => {
    // The requests the last save sent to our own server
    let fetched: string[] = []
    // The file the last save downloaded (a PNG is a data URL, not a file)
    let savedFile: Blob | undefined
    // Every save asked for, and the toast after a download
    async function save(
        format: "drawio" | "png" | "svg" | "xmlsvg",
        sessionId?: string,
    ) {
        const { result, requests, reply } = setup()
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
            () => {},
        )
        savedFile = undefined
        URL.createObjectURL = vi.fn((blob: Blob) => {
            savedFile = blob
            return "blob:test"
        })
        URL.revokeObjectURL = vi.fn()
        fetched = []
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                fetched.push(url)
                return new Response("{}")
            }),
        )
        act(() => {
            result.current.saveDiagramToFile(
                "pic",
                format,
                sessionId,
                "Exported {name}",
            )
        })
        const request = requests[0]
        // draw.io answers an "xml" export with the document alone
        if (format === "drawio") await reply(request, "", oneBox)
        else
            await reply(
                request,
                format === "png"
                    ? "data:image/png;base64,iVBORw0KGgo="
                    : svgOf("x"),
            )
        vi.unstubAllGlobals()
        return request
    }

    afterEach(() => {
        localStorage.clear()
        vi.mocked(toast.success).mockClear()
        vi.mocked(toast.error).mockClear()
        vi.useRealTimers()
    })

    it("draw a PNG of the page on screen at twice the size on white, with a margin", async () => {
        expect(await save("png")).toMatchObject({
            format: "png",
            scale: 2,
            border: 20,
            currentPage: true,
            background: "#ffffff",
        })
        expect(toast.success).toHaveBeenCalledWith("Exported pic.png", {
            duration: 4000,
        })
    })

    it("leave out the background when the dialog asked for that", async () => {
        localStorage.setItem("next-ai-draw-io-png-transparent", "true")
        const request = await save("png")
        expect(request).toMatchObject({ transparent: true, border: 20 })
        expect(request).not.toHaveProperty("background")
    })

    it("export a PNG when storage is blocked", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError")
        })
        expect(await save("png")).toMatchObject({
            format: "png",
            background: "#ffffff",
        })
        expect(toast.success).toHaveBeenCalledWith("Exported pic.png", {
            duration: 4000,
        })
    })

    it("flag the chat's trace as saved, and ask nothing of a server without a chat", async () => {
        await save("png", "chat-session-1")
        expect(fetched).toEqual(["/api/log-save"])
        // The MCP preview saves without a chat session, and its server has
        // no such route (it answered 403 to every export)
        await save("png")
        expect(fetched).toEqual([])
    })

    it("give SVG pictures the margin, and the draw.io file none", async () => {
        expect(await save("svg")).toMatchObject({ format: "svg", border: 20 })
        expect(await save("xmlsvg")).toMatchObject({ border: 20 })
        expect(await save("drawio")).not.toHaveProperty("border")
    })

    it("say so when draw.io gives no file", async () => {
        const { result } = setup()
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => {})
        vi.spyOn(console, "warn").mockImplementation(() => {})
        vi.useFakeTimers()
        act(() => {
            result.current.saveDiagramToFile(
                "pic",
                "png",
                undefined,
                "Exported {name}",
                "Export failed",
            )
        })
        // draw.io never answers (it is still loading, or failed to load);
        // the export dialog closed with the click
        await act(() => vi.advanceTimersByTimeAsync(30000))
        expect(toast.error).toHaveBeenCalledWith("Export failed")
        expect(toast.success).not.toHaveBeenCalled()
        expect(click).not.toHaveBeenCalled()
    })

    it("save the draw.io file with its pages as plain XML", async () => {
        // An xmlsvg export's xml has each page compressed: no diff, and
        // no other tool, can read it
        expect(await save("drawio")).toMatchObject({ format: "xml" })
        expect(toast.success).toHaveBeenCalledWith("Exported pic.drawio", {
            duration: 4000,
        })
        const text = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.readAsText(savedFile as Blob)
        })
        expect(text).toBe(oneBox)
    })

    it("draw an SVG in light colors on white, whatever the viewer's dark mode", async () => {
        for (const format of ["svg", "xmlsvg"] as const) {
            expect(await save(format)).toMatchObject({
                format,
                theme: "light",
                background: "#ffffff",
            })
        }
        // Without a background when the dialog asked for that
        localStorage.setItem("next-ai-draw-io-png-transparent", "true")
        const request = await save("svg")
        expect(request).toMatchObject({ theme: "light" })
        expect(request).not.toHaveProperty("background")
    })
})
