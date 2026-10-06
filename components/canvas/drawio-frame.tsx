"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import {
    DRAWIO_CONFIG,
    EMPTY_DRAWIO_DOCUMENT,
} from "@/lib/drawio/drawio-config"
import {
    attachEditor,
    detachEditor,
    watchForEditorUi,
} from "@/lib/drawio/editor-bridge"

export interface DrawioExportEvent {
    event: "export"
    format: string
    data: string
    xml: string
    message: { message?: string; [key: string]: unknown }
}

export interface DrawioFrameHandle {
    load: (data: { xml: string }) => void
    exportDiagram: (data: {
        format: string
        message?: string
        [key: string]: unknown
    }) => void
}

interface DrawioFrameProps {
    src: string
    /** CSS sent with the configure message (works cross-origin too) */
    configCss: string
    /** CSS injected once the editor is reachable directly (same origin) */
    editorCss: string
    /** draw.io's dark mode, switched in place when the editor is reachable */
    dark: boolean
    onLoad?: () => void
    onAutoSave?: (data: { xml?: string }) => void
    onExport?: (data: DrawioExportEvent) => void
    /** Called once we know whether the editor can be driven directly */
    onEditorAccess?: (hasEditor: boolean) => void
}

const STYLE_ID = "next-ai-drawio-theme"

/**
 * The draw.io editor in an iframe, speaking draw.io's postMessage embed
 * protocol (same messages react-drawio used). When the iframe is same-origin
 * it also hands the editor object to editor-bridge for direct control.
 */
export const DrawioFrame = forwardRef<DrawioFrameHandle, DrawioFrameProps>(
    function DrawioFrame(
        {
            src,
            configCss,
            editorCss,
            dark,
            onLoad,
            onAutoSave,
            onExport,
            onEditorAccess,
        },
        ref,
    ) {
        const iframeRef = useRef<HTMLIFrameElement>(null)
        const editorUiRef = useRef<any>(null)
        const attachedRef = useRef(false)
        const configCssRef = useRef(configCss)
        configCssRef.current = configCss
        const editorCssRef = useRef(editorCss)
        editorCssRef.current = editorCss
        const darkRef = useRef(dark)
        darkRef.current = dark
        // Handlers change on every render; the message listener reads refs
        const handlersRef = useRef({
            onLoad,
            onAutoSave,
            onExport,
            onEditorAccess,
        })
        handlersRef.current = { onLoad, onAutoSave, onExport, onEditorAccess }

        // draw.io's origin: messages go only there, and only its messages
        // count (the frame could be navigated to another site)
        // (read on use: there is no window while the page renders on the server)
        const drawioOrigin = () => new URL(src, window.location.href).origin

        const send = (action: string, data: Record<string, unknown> = {}) => {
            iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ action, ...data }),
                drawioOrigin(),
            )
        }

        useImperativeHandle(ref, () => ({
            load: ({ xml }) => send("load", { xml, autosave: 1 }),
            exportDiagram: (data) => send("export", data),
        }))

        // Same-origin only: keep the theme CSS current without a reload
        const applyThemeCss = () => {
            if (!attachedRef.current) return
            try {
                const doc = iframeRef.current?.contentDocument
                if (!doc?.head) return
                let style = doc.getElementById(STYLE_ID)
                if (!style) {
                    style = doc.createElement("style")
                    style.id = STYLE_ID
                    doc.head.appendChild(style)
                }
                style.textContent = editorCssRef.current
            } catch {
                // Cross-origin: the configure message already applied it
            }
        }

        useEffect(() => {
            applyThemeCss()
        }, [editorCss])

        // Same-origin only: draw.io's own dark mode, without a reload
        const applyDarkMode = () => {
            if (!attachedRef.current) return
            try {
                // Runs on every load: switch only when it differs
                const frameWindow = iframeRef.current?.contentWindow as any
                if (frameWindow?.Editor?.isDarkMode?.() === darkRef.current) {
                    return
                }
                editorUiRef.current?.setDarkMode?.(darkRef.current)
            } catch (error) {
                console.warn("Failed to set draw.io's dark mode:", error)
            }
        }

        useEffect(() => {
            applyDarkMode()
        }, [dark])

        useEffect(() => {
            const iframe = iframeRef.current
            if (!iframe) return
            editorUiRef.current = null
            attachedRef.current = false
            let reported: boolean | null = null
            const report = (value: boolean) => {
                if (reported === value) return
                reported = value
                handlersRef.current.onEditorAccess?.(value)
            }

            // Watch for draw.io's scripts so the editor object can be caught
            // as it starts. Stops once hooked, or when the frame turns out to
            // be cross-origin.
            const startedAt = Date.now()
            const poll = setInterval(() => {
                const frameWindow = iframe.contentWindow as any
                if (!frameWindow) return
                let ready = false
                try {
                    ready =
                        frameWindow.location.href !== "about:blank" &&
                        !!frameWindow.EditorUi
                } catch {
                    clearInterval(poll)
                    report(false)
                    return
                }
                if (ready) {
                    clearInterval(poll)
                    // Called on every action state update: once per editor
                    const ok = watchForEditorUi(frameWindow, (ui) => {
                        if (editorUiRef.current === ui) return
                        editorUiRef.current = ui
                        // draw.io follows the system's theme on its own:
                        // keep the app's
                        ui.addListener?.("darkModeChanged", () =>
                            applyDarkMode(),
                        )
                    })
                    if (!ok) report(false)
                } else if (Date.now() - startedAt > 60_000) {
                    clearInterval(poll)
                }
            }, 5)

            const handleMessage = (event: MessageEvent) => {
                if (event.source !== iframe.contentWindow) return
                if (event.origin !== drawioOrigin()) return
                if (typeof event.data !== "string") return
                let data: any
                try {
                    data = JSON.parse(event.data)
                } catch {
                    return
                }
                const handlers = handlersRef.current
                switch (data.event) {
                    case "init":
                        send("load", {
                            xml: EMPTY_DRAWIO_DOCUMENT,
                            autosave: 1,
                        })
                        break
                    case "configure":
                        send("configure", {
                            config: {
                                ...DRAWIO_CONFIG,
                                css: configCssRef.current,
                            },
                        })
                        break
                    case "load": {
                        const tryAttach = () => {
                            const ui = editorUiRef.current
                            if (!ui || !iframe.contentWindow) return false
                            attachEditor(ui, iframe.contentWindow)
                            attachedRef.current = true
                            applyThemeCss()
                            applyDarkMode()
                            report(true)
                            return true
                        }
                        // The editor object is usually caught before the
                        // first load; give it a moment, then fall back to
                        // draw.io's own toolbar
                        if (!tryAttach()) {
                            setTimeout(() => {
                                if (!tryAttach()) report(false)
                            }, 800)
                        }
                        handlers.onLoad?.()
                        break
                    }
                    case "autosave":
                        handlers.onAutoSave?.(data)
                        break
                    case "export":
                        handlers.onExport?.(data)
                        break
                }
            }

            window.addEventListener("message", handleMessage)
            return () => {
                clearInterval(poll)
                window.removeEventListener("message", handleMessage)
                detachEditor()
            }
        }, [src])

        return (
            <iframe
                ref={iframeRef}
                src={src}
                title="draw.io"
                allow="clipboard-read; clipboard-write"
                className="block h-full w-full border-0"
            />
        )
    },
)
