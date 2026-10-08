import { useEffect, useState } from "react"
import { PANEL_MIN_WIDTH, useSettingsStore } from "@/stores/settings-store"

// Room the canvas keeps next to the chat panel in a small window
const MIN_CANVAS_WIDTH = 400

/** The chat panel's width, narrower when the window has no room for it */
export function usePanelWidth(): number {
    const width = useSettingsStore((s) => s.panelWidth)
    // Set after mounting, so the server render and the first one agree
    const [windowWidth, setWindowWidth] = useState(Number.POSITIVE_INFINITY)
    useEffect(() => {
        const update = () => setWindowWidth(window.innerWidth)
        update()
        window.addEventListener("resize", update)
        return () => window.removeEventListener("resize", update)
    }, [])
    return Math.max(
        PANEL_MIN_WIDTH,
        Math.min(width, windowWidth - MIN_CANVAS_WIDTH),
    )
}
