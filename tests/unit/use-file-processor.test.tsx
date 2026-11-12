import { act, renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toastUnexpectedError } from "@/lib/client-error-report"
import { extractPdfText, extractTextFileContent } from "@/lib/pdf-utils"
import { useFileProcessor } from "@/lib/use-file-processor"

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("@/lib/client-error-report", () => ({
    toastUnexpectedError: vi.fn(),
}))
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
// The toast texts the hook formats; toast is mocked, so any texts do
const messages = {
    tooLong: "{name} too long",
    noText: "{name} has no text",
    readFailed: "failed {name}",
    report: "Report",
}

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
        const { result } = renderHook(() => useFileProcessor(messages))

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
        const { result } = renderHook(() => useFileProcessor(messages))

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
        const { result } = renderHook(() => useFileProcessor(messages))

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

    it("turns away a PDF without text and keeps the other files", async () => {
        // unpdf gives the line breaks between the pages of a scanned PDF
        vi.mocked(extractPdfText).mockResolvedValue("\n\n")
        vi.mocked(extractTextFileContent).mockResolvedValue("notes")
        const scan = pdfFile()
        const b = textFile()
        const { result } = renderHook(() => useFileProcessor(messages))

        await act(async () => {
            await result.current.handleFileChange([scan, b])
        })
        expect(result.current.files).toEqual([b])
        expect(result.current.pdfData.has(scan)).toBe(false)
        expect(toast.error).toHaveBeenCalledWith("slow.pdf has no text")
    })

    it("takes a file that could not be read off the list", async () => {
        vi.mocked(extractPdfText).mockRejectedValue(new Error("Invalid PDF"))
        vi.spyOn(console, "error").mockImplementation(() => {})
        const broken = pdfFile()
        const { result } = renderHook(() => useFileProcessor(messages))

        await act(async () => {
            await result.current.handleFileChange([broken])
        })
        expect(result.current.files).toEqual([])
        expect(result.current.pdfData.has(broken)).toBe(false)
        expect(toastUnexpectedError).toHaveBeenCalled()
    })
})
