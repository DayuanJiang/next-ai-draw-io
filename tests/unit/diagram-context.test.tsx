import { deflateRawSync } from "node:zlib"
import { act, renderHook } from "@testing-library/react"
import type React from "react"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DiagramProvider, useDiagram } from "@/contexts/diagram-context"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

// The provider with a stand-in draw.io that records each export request
function setup() {
    const { result } = renderHook(() => useDiagram(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
            <DiagramProvider>{children}</DiagramProvider>
        ),
    })
    const requests: { format: string; message: string }[] = []
    result.current.drawioRef.current = {
        exportDiagram: (r: any) => requests.push(r),
        load: vi.fn(),
    } as any
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
    return { result, requests, reply }
}

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

describe("exported files", () => {
    // Every save asked for, and the toast after a download
    async function save(format: "drawio" | "png" | "svg" | "xmlsvg") {
        const { result, requests, reply } = setup()
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
            () => {},
        )
        URL.createObjectURL = vi.fn(() => "blob:test")
        URL.revokeObjectURL = vi.fn()
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("{}")),
        )
        act(() => {
            result.current.saveDiagramToFile(
                "pic",
                format,
                undefined,
                "Exported {name}",
            )
        })
        const request = requests[0]
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

    it("give SVG pictures the margin, and the draw.io file none", async () => {
        expect(await save("svg")).toMatchObject({ format: "svg", border: 20 })
        expect(await save("xmlsvg")).toMatchObject({ border: 20 })
        expect(await save("drawio")).not.toHaveProperty("border")
    })
})
