// @vitest-environment node
import { EventEmitter } from "node:events"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

// The file the user picks in the save dialog, and the error box
const electron = vi.hoisted(() => ({ savePath: "", showErrorBox: vi.fn() }))
vi.mock("electron", () => ({
    app: { getLocale: () => "en-US", getPath: () => "/nonexistent" },
    BrowserWindow: { fromWebContents: () => null },
    dialog: {
        showSaveDialog: async () => ({
            canceled: false,
            filePath: electron.savePath,
        }),
        showErrorBox: electron.showErrorBox,
    },
}))

import {
    savePreviewAsPdf,
    trackOpenedWindows,
} from "@/electron/main/pdf-export"

/** A page that opened a print preview, as draw.io does for a PDF */
function pageWithPreview() {
    const contents = new EventEmitter() as any
    trackOpenedWindows(contents)
    const preview = {
        closed: false,
        isDestroyed: () => preview.closed,
        hide: () => {},
        close: () => {
            preview.closed = true
        },
        webContents: { printToPDF: async () => Buffer.from("%PDF") },
    }
    contents.emit("did-create-window", preview)
    return { contents, preview }
}

describe("desktop PDF export", () => {
    it("saves the preview to the chosen file", async () => {
        const { contents, preview } = pageWithPreview()
        electron.savePath = join(mkdtempSync(join(tmpdir(), "pdf-")), "a.pdf")
        expect(await savePreviewAsPdf(contents, "a.pdf")).toBe(true)
        expect(readFileSync(electron.savePath, "utf8")).toBe("%PDF")
        expect(preview.closed).toBe(true)
        expect(electron.showErrorBox).not.toHaveBeenCalled()
    })

    it("says why when the file cannot be written", async () => {
        const { contents, preview } = pageWithPreview()
        // A folder that is gone, like a disconnected network drive
        electron.savePath = join(
            mkdtempSync(join(tmpdir(), "pdf-")),
            "gone",
            "a.pdf",
        )
        expect(await savePreviewAsPdf(contents, "a.pdf")).toBe(false)
        expect(electron.showErrorBox).toHaveBeenCalledWith(
            "Could not save the PDF",
            expect.stringContaining("ENOENT"),
        )
        expect(preview.closed).toBe(true)
    })
})
