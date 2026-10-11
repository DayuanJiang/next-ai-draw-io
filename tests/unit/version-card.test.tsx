import { cleanup, fireEvent, render } from "@testing-library/react"
import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { VersionCard } from "@/components/canvas/version-card"
import { VersionStrip } from "@/components/canvas/version-strip"
import {
    type VersionItem,
    VersionsProvider,
    type VersionsSource,
} from "@/components/canvas/versions-context"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import { EMPTY_SUMMARY } from "@/lib/diagram-diff"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"

afterEach(cleanup)

// jsdom has no scrolling; the strip scrolls to its newest version
Element.prototype.scrollTo = vi.fn()

const version = (id: string, number: number): VersionItem => ({
    id,
    number,
    xml: `<mxfile>${id}</mxfile>`,
    beforeXml: "",
    svg: "",
    summary: { ...EMPTY_SUMMARY, shapesAdded: 2 },
})

function source(overrides: Partial<VersionsSource> = {}): VersionsSource {
    return {
        versions: [version("v1", 1), version("v2", 2)],
        onCanvasId: "v2",
        undoneId: null,
        isBusy: false,
        canUndo: true,
        canRedo: false,
        restore: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        ...overrides,
    }
}

function mount(ui: React.ReactNode, value: VersionsSource) {
    return render(
        <DictionaryProvider dictionary={en as unknown as Dictionary}>
            <VersionsProvider value={value}>{ui}</VersionsProvider>
        </DictionaryProvider>,
    )
}

describe("VersionCard", () => {
    it("undoes the latest version from the source", () => {
        const value = source()
        const { getByTestId, container } = mount(
            <VersionCard
                version={value.versions[1]}
                isLatest
                label="Changed the diagram"
                data-tool-state="output-available"
            />,
            value,
        )
        expect(container.textContent).toContain("v2")
        expect(container.textContent).toContain("Added 2 shapes")
        expect(getByTestId("version-card").dataset.toolState).toBe(
            "output-available",
        )
        fireEvent.click(getByTestId("version-undo"))
        expect(value.undo).toHaveBeenCalled()
        expect(value.redo).not.toHaveBeenCalled()
    })

    it("redoes an undone change and says so", () => {
        const value = source({
            onCanvasId: null,
            undoneId: "v2",
            canUndo: false,
            canRedo: true,
        })
        const { getByTestId, container } = mount(
            <VersionCard version={value.versions[1]} isLatest label="x" />,
            value,
        )
        expect(container.textContent).toContain("Change undone")
        fireEvent.click(getByTestId("version-undo"))
        expect(value.redo).toHaveBeenCalled()
    })

    it("restores an older version; not while busy", () => {
        const value = source({ isBusy: true })
        const { getByTestId, rerender } = mount(
            <VersionCard
                version={value.versions[0]}
                isLatest={false}
                label="x"
            />,
            value,
        )
        expect(
            (getByTestId("version-restore") as HTMLButtonElement).disabled,
        ).toBe(true)
        const idle = source()
        rerender(
            <DictionaryProvider dictionary={en as unknown as Dictionary}>
                <VersionsProvider value={idle}>
                    <VersionCard
                        version={idle.versions[0]}
                        isLatest={false}
                        label="x"
                    />
                </VersionsProvider>
            </DictionaryProvider>,
        )
        fireEvent.click(getByTestId("version-restore"))
        expect(idle.restore).toHaveBeenCalledWith("v1")
    })
})

describe("VersionStrip", () => {
    it("shows one thumbnail per version, the one on the canvas marked", () => {
        const { getAllByTestId } = mount(<VersionStrip />, source())
        const thumbs = getAllByTestId("version-thumb")
        expect(thumbs).toHaveLength(2)
        expect(thumbs[1].title).toContain("Canvas now")
        expect(thumbs[0].title).not.toContain("Canvas now")
    })

    it("hides below the minimum", () => {
        const one = source({ versions: [version("v1", 1)] })
        const { container, rerender } = mount(<VersionStrip />, one)
        expect(container.textContent).toBe("")
        rerender(
            <DictionaryProvider dictionary={en as unknown as Dictionary}>
                <VersionsProvider value={one}>
                    <VersionStrip minVersions={1} />
                </VersionsProvider>
            </DictionaryProvider>,
        )
        expect(container.textContent).toContain("Versions")
    })
})
