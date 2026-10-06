import { deflateRawSync } from "node:zlib"
import { act, renderHook } from "@testing-library/react"
import type React from "react"
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
    // draw.io's reply to a request: it echoes the request in `message`
    const reply = (request: { message: string }, data: string, xml = "") =>
        act(() =>
            result.current.handleDiagramExport({
                event: "export",
                data,
                xml,
                format: "xmlsvg",
                message: request,
            } as any),
        )
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
    it("give the chat's export only its own reply", () => {
        const { result, requests, reply } = setup()
        // An edit's history export is still on its way when the chat exports
        act(() => {
            result.current.handleExport()
        })
        let tag = ""
        const got: string[] = []
        act(() => {
            tag = result.current.handleExport()
            result.current.exportResolversRef.current[tag] = (xml) =>
                got.push(xml)
        })
        reply(requests[0], svgOf("older"))
        expect(got).toEqual([])
        reply(requests[1], svgOf("current"))
        expect(got).toHaveLength(1)
        expect(got[0]).toContain('value="current"')
        expect(result.current.exportResolversRef.current[tag]).toBeUndefined()
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
        reply(requests[1], "data:image/png;base64,iVBORw0KGgo=")
        reply(requests[0], svgOf("doc"), twoPages)

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
