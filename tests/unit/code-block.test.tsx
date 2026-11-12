import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { CodeBlock } from "@/components/code-block"
import { useSettingsStore } from "@/stores/settings-store"

afterEach(() => {
    cleanup()
    useSettingsStore.setState({ isDark: false })
})

// The light theme's tag names and punctuation: 1.14:1 and 1.39:1 on the
// dark panel
const DARK_BLUE = "rgb(0, 0, 159)"
const DARK_GREY = "rgb(57, 58, 52)"

describe("CodeBlock", () => {
    it("leaves the light theme's dark colors out in dark mode", () => {
        const xml = '<mxCell id="2" value="Start"/>'
        const light = render(<CodeBlock code={xml} />)
        expect(light.container.innerHTML).toContain(DARK_BLUE)
        expect(light.container.innerHTML).toContain(DARK_GREY)
        cleanup()

        useSettingsStore.setState({ isDark: true })
        const dark = render(<CodeBlock code={xml} />)
        expect(dark.container.textContent).toBe(xml)
        expect(dark.container.innerHTML).not.toContain(DARK_BLUE)
        expect(dark.container.innerHTML).not.toContain(DARK_GREY)
    })
})
