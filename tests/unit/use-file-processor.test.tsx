import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { extractPdfText, extractTextFileContent } from "@/lib/pdf-utils"
import { useFileProcessor } from "@/lib/use-file-processor"

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@/lib/pdf-utils", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/pdf-utils")>()),
    extractPdfText: vi.fn(),
    extractTextFileContent: vi.fn(),
}))

// A promise we can resolve from the test, to control extraction timing
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => {
        resolve = r
    })
    return { promise, resolve }
}

const pdfFile = () =>
    new File(["%PDF"], "slow.pdf", { type: "application/pdf" })
const textFile = () => new File(["notes"], "notes.txt", { type: "text/plain" })

describe("useFileProcessor", () => {
    beforeEach(() => {
        vi.mocked(extractPdfText).mockReset()
        vi.mocked(extractTextFileContent).mockReset()
    })

    it("marks queued files as extracting before the first one finishes", async () => {
        const pdf = deferred<string>()
        vi.mocked(extractPdfText).mockReturnValue(pdf.promise)
        vi.mocked(extractTextFileContent).mockResolvedValue("notes")
        const a = pdfFile()
        const b = textFile()
        const { result } = renderHook(() => useFileProcessor())

        let done!: Promise<void>
        act(() => {
            done = result.current.handleFileChange([a, b])
        })

        expect(result.current.pdfData.get(a)?.isExtracting).toBe(true)
        expect(result.current.pdfData.get(b)?.isExtracting).toBe(true)

        await act(async () => {
            pdf.resolve("pdf text")
            await done
        })
        expect(result.current.pdfData.get(a)?.text).toBe("pdf text")
        expect(result.current.pdfData.get(b)?.text).toBe("notes")
    })

    it("keeps text of a file added while an earlier file is extracting", async () => {
        const pdf = deferred<string>()
        vi.mocked(extractPdfText).mockReturnValue(pdf.promise)
        vi.mocked(extractTextFileContent).mockResolvedValue("notes")
        const a = pdfFile()
        const b = textFile()
        const { result } = renderHook(() => useFileProcessor())

        let first!: Promise<void>
        act(() => {
            first = result.current.handleFileChange([a])
        })
        await act(async () => {
            await result.current.handleFileChange([a, b])
        })
        expect(result.current.pdfData.get(b)?.text).toBe("notes")

        await act(async () => {
            pdf.resolve("pdf text")
            await first
        })
        expect(result.current.pdfData.get(a)?.text).toBe("pdf text")
        expect(result.current.pdfData.get(b)?.text).toBe("notes")
    })

    it("does not bring back a file removed while extracting", async () => {
        const pdf = deferred<string>()
        vi.mocked(extractPdfText).mockReturnValue(pdf.promise)
        const a = pdfFile()
        const { result } = renderHook(() => useFileProcessor())

        let first!: Promise<void>
        act(() => {
            first = result.current.handleFileChange([a])
        })
        await act(async () => {
            await result.current.handleFileChange([])
        })

        await act(async () => {
            pdf.resolve("pdf text")
            await first
        })
        expect(result.current.pdfData.has(a)).toBe(false)
        expect(result.current.files).toEqual([])
    })
})
