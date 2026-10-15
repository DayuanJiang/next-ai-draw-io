import { useEffect, useRef, useState } from "react"
import { DrawioFrame } from "@/components/canvas/drawio-frame"
import { useLocale } from "@/components/canvas/locale-context"
import { OutlineOffer } from "@/components/canvas/outline-offer"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    DRAWIO_CSS,
    type DrawioSource,
    getDrawioSrc,
    webDrawioSource,
} from "@/lib/drawio/drawio-config"
import {
    centerEmptyPage,
    keepCenter,
    refitIfRecent,
} from "@/lib/drawio/editor-bridge"
import { i18n, type Locale } from "@/lib/i18n/config"
import { STORAGE_KEYS } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { useCanvasStore } from "@/stores/canvas-store"
import { useSettingsStore } from "@/stores/settings-store"

/** Size of the canvas area, for overlays that stay inside it */
export interface CanvasSize {
    width: number
    height: number
}

/**
 * The draw.io canvas, with draw.io's own toolbar, menus and page tabs, and
 * an overlay laid over it (the web app's "ask AI" button; only when the
 * page can drive draw.io directly, not with an external cross-origin
 * draw.io).
 */
export function CanvasStage({
    className,
    style,
    hideOverlays = false,
    overlay,
    drawioSource,
    waitForSavedLocale = false,
}: {
    className?: string
    style?: React.CSSProperties
    /** Hide the overlay (e.g. while the start screen covers the canvas) */
    hideOverlays?: boolean
    /** Rendered over the canvas once draw.io is ready */
    overlay?: (size: CanvasSize) => React.ReactNode
    /** Where the editor comes from; none: the web app's own copy (the MCP
     * shell passes what its server configured) */
    drawioSource?: DrawioSource
    /** Web app: the page is about to switch to the language picked last
     * time (useSavedLocale in the workspace); do not load draw.io in the
     * URL's language meanwhile */
    waitForSavedLocale?: boolean
}) {
    const dict = useDictionary()
    const lang = useLocale()
    const {
        drawioRef,
        handleDiagramAutoSave,
        handleDiagramExport,
        onDrawioLoad,
        resetDrawioReady,
        isDrawioReady,
    } = useDiagram()
    const isDark = useSettingsStore((s) => s.isDark)
    const hasEditor = useCanvasStore((s) => s.hasEditor)
    // Canvas width when the chat panel starts sliding in or out
    const slideStartWidthRef = useRef(0)

    const [src, setSrc] = useState<string | null>(null)
    // null until draw.io tells us whether we can drive it directly
    const [editorAccess, setEditorAccess] = useState<boolean | null>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 })

    useEffect(() => {
        // Load draw.io once, in the language the page will have
        if (waitForSavedLocale) {
            const saved = localStorage.getItem(STORAGE_KEYS.locale)
            if (
                saved &&
                saved !== lang &&
                i18n.locales.includes(saved as Locale)
            ) {
                return
            }
        }
        // The theme class is set before the page renders; the settings store
        // may not have read it yet
        const dark = document.documentElement.classList.contains("dark")
        setSrc(getDrawioSrc(drawioSource ?? webDrawioSource(lang), dark))
    }, [lang])

    // A new iframe starts over: draw.io reports load and access again
    useEffect(() => {
        resetDrawioReady()
        setEditorAccess(null)
    }, [src])

    // Cross-origin draw.io only takes its dark mode when it starts: reload
    // it when that is not the theme now (also one switched while it
    // loaded). Same-origin switches it in place.
    useEffect(() => {
        if (editorAccess !== false || !src) return
        const startedDark = new URL(src).searchParams.get("dark") === "1"
        if (startedDark === isDark) return
        setSrc(getDrawioSrc(drawioSource ?? webDrawioSource(lang), isDark))
    }, [isDark, editorAccess, lang, src])

    useEffect(() => {
        const stage = stageRef.current
        if (!stage) return
        // React passes no transitionstart
        const onSlideStart = (event: TransitionEvent) => {
            if (event.target !== stage || event.propertyName !== "right") return
            slideStartWidthRef.current = stage.clientWidth
        }
        stage.addEventListener("transitionstart", onSlideStart)
        const observer = new ResizeObserver(([entry]) => {
            setSize({
                width: entry.contentRect.width,
                height: entry.contentRect.height,
            })
            refitIfRecent()
        })
        observer.observe(stage)
        return () => {
            observer.disconnect()
            stage.removeEventListener("transitionstart", onSlideStart)
        }
    }, [])

    const showOverlays = hasEditor && isDrawioReady && !hideOverlays

    return (
        <div
            ref={stageRef}
            className={cn("absolute overflow-hidden bg-canvas", className)}
            style={style}
            data-testid="canvas-stage"
            // The chat panel slides in or out (the canvas's right edge moves):
            // once the canvas has its final size, fit a diagram just drawn,
            // or keep the view's middle
            onTransitionEnd={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.propertyName !== "right") return
                const stage = event.currentTarget
                // Let draw.io take the new size first. An empty page (the
                // first answer is on its way) goes to the middle.
                setTimeout(() => {
                    if (refitIfRecent(4000) || centerEmptyPage()) return
                    keepCenter(slideStartWidthRef.current, stage.clientWidth)
                }, 60)
            }}
        >
            {src && (
                <DrawioFrame
                    key={src}
                    ref={drawioRef}
                    src={src}
                    css={DRAWIO_CSS}
                    dark={isDark}
                    onLoad={onDrawioLoad}
                    onAutoSave={handleDiagramAutoSave}
                    onExport={handleDiagramExport}
                    onEditorAccess={setEditorAccess}
                />
            )}

            {/* Covers the iframe until draw.io has loaded and been styled */}
            {(!isDrawioReady || editorAccess === null) && (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-canvas"
                    data-testid="canvas-loading"
                >
                    <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                        <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                        {dict.workspace.canvasLoading}
                    </div>
                </div>
            )}

            {showOverlays && overlay?.(size)}
            {showOverlays && <OutlineOffer />}
        </div>
    )
}
