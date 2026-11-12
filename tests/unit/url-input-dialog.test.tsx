import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UrlInputDialog } from "@/components/url-input-dialog"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"

afterEach(cleanup)

function dialog(open: boolean, onSubmit = vi.fn()) {
    return (
        <DictionaryProvider dictionary={en as unknown as Dictionary}>
            <UrlInputDialog
                open={open}
                onOpenChange={() => {}}
                onSubmit={onSubmit}
                isExtracting={false}
            />
        </DictionaryProvider>
    )
}

const input = () =>
    screen.getByPlaceholderText<HTMLInputElement>("https://example.com/article")

function submit(text: string) {
    fireEvent.change(input(), { target: { value: text } })
    fireEvent.keyDown(input(), { key: "Enter" })
}

describe("UrlInputDialog", () => {
    it("reads a link typed without its scheme as an https one", () => {
        const onSubmit = vi.fn()
        render(dialog(true, onSubmit))
        submit(" example.com/article ")
        expect(onSubmit).toHaveBeenLastCalledWith("https://example.com/article")
        submit("http://example.com/plain")
        expect(onSubmit).toHaveBeenLastCalledWith("http://example.com/plain")
    })

    it("refuses text that is no address", () => {
        const onSubmit = vi.fn()
        render(dialog(true, onSubmit))
        submit("not an address")
        expect(screen.getByText(en.url.invalidFormat)).toBeTruthy()
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("is empty when opened again after a link was read", () => {
        const { rerender } = render(dialog(true))
        submit("https://example.com/article")
        expect(input().value).toBe("https://example.com/article")
        // The chat closes it when the link has been read
        rerender(dialog(false))
        rerender(dialog(true))
        expect(input().value).toBe("")
    })
})
