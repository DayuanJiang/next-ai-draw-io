import { promises as fs } from "node:fs"
import { app, BrowserWindow, dialog, type WebContents } from "electron"
import { getMenuTranslations, getPreferredLocale } from "./menu-i18n"

/**
 * draw.io makes a PDF by printing a preview window it opens. A browser's
 * print preview keeps the page size the preview sets (the crop size), but
 * Electron sends window.print() to the system print dialog, whose fixed
 * paper sizes add margins and turn wide diagrams (#1035). The PDF is made
 * with printToPDF instead, which uses the page's own size.
 */

// The window each page opened last: draw.io's print preview
const lastOpened = new WeakMap<WebContents, BrowserWindow>()

export function trackOpenedWindows(contents: WebContents): void {
    contents.on("did-create-window", (child) => {
        lastOpened.set(contents, child)
    })
}

/** Save the preview `contents` opened last as a PDF; whether it was saved */
export async function savePreviewAsPdf(
    contents: WebContents,
    fileName: string,
): Promise<boolean> {
    const preview = lastOpened.get(contents)
    if (!preview || preview.isDestroyed()) {
        throw new Error("No print preview to save")
    }
    preview.hide()
    try {
        const pdf = await preview.webContents.printToPDF({
            preferCSSPageSize: true,
            printBackground: true,
        })
        const options = {
            defaultPath: fileName,
            filters: [{ name: "PDF", extensions: ["pdf"] }],
        }
        const owner = BrowserWindow.fromWebContents(contents)
        const { canceled, filePath } = owner
            ? await dialog.showSaveDialog(owner, options)
            : await dialog.showSaveDialog(options)
        if (canceled || !filePath) return false
        await fs.writeFile(filePath, pdf)
        return true
    } catch (error) {
        // The page's fallback for a rejected save is to print the preview,
        // which is closed below and so prints nothing: without this box a
        // file that cannot be written (locked by a PDF reader, read-only
        // folder) ends in no PDF and no message
        const t = getMenuTranslations(getPreferredLocale(app.getLocale()))
        dialog.showErrorBox(t.pdfSaveFailed, (error as Error).message)
        return false
    } finally {
        if (!preview.isDestroyed()) preview.close()
    }
}
