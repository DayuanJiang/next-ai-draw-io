import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prefersTransparentPng, SaveDialog } from "@/components/save-dialog"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"

// A desktop browser: a fine pointer, a wide window
beforeEach(() => {
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: false })),
    )
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

function open(onSave = vi.fn()) {
    render(
        <DictionaryProvider dictionary={en as unknown as Dictionary}>
            <SaveDialog
                open
                onOpenChange={() => {}}
                onSave={onSave}
                defaultFilename="diagram"
            />
        </DictionaryProvider>,
    )
    return onSave
}

const formatTile = (name: RegExp) => screen.getByRole("radio", { name })

describe("the export dialog", () => {
    it("moves the focus to the file name after a mouse click on a format, and keeps it on the format from the keyboard", () => {
        open()
        const png = formatTile(new RegExp(en.save.formats.png))
        png.focus()
        // Enter or Space on a button: a click with detail 0
        fireEvent.click(png, { detail: 0 })
        expect(png.getAttribute("aria-checked")).toBe("true")
        expect(document.activeElement).toBe(png)
        const svg = formatTile(new RegExp(`^${en.save.formats.svg}`))
        fireEvent.click(svg, { detail: 1 })
        expect(document.activeElement).toBe(
            screen.getByRole("textbox", { name: en.save.filename }),
        )
    })

    it("uses the transparent background picked when storage is blocked", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("full", "QuotaExceededError")
        })
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError")
        })
        const onSave = open()
        fireEvent.click(formatTile(new RegExp(en.save.formats.png)), {
            detail: 1,
        })
        fireEvent.click(
            screen.getByRole("checkbox", {
                name: en.save.transparentBackground,
            }),
        )
        fireEvent.click(
            screen.getByRole("button", { name: en.workspace.export }),
        )
        expect(onSave).toHaveBeenCalledWith("diagram", "png")
        expect(prefersTransparentPng()).toBe(true)
    })
})
