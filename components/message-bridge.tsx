"use client"

import { useEffect } from "react"
import { useDiagram } from "@/contexts/diagram-context"

export function MessageBridge() {
    const {
        loadDiagram,
        chartXML,
        saveDiagramToFile,
        isDrawioReady,
        handleExportWithoutHistory,
    } = useDiagram()

    useEffect(() => {
        if (isDrawioReady) {
            window.parent.postMessage(JSON.stringify({ event: "init" }), "*")
        }
    }, [isDrawioReady])

    // Broadcast chartXML changes (sync)
    useEffect(() => {
        if (!chartXML) return
        window.parent.postMessage(
            JSON.stringify({
                event: "save",
                xml: chartXML,
            }),
            "*",
        )
    }, [chartXML])

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Check for trusted origin if configured
            const allowedOriginsStr = process.env.NEXT_PUBLIC_ALLOWED_ORIGIN
            if (allowedOriginsStr) {
                const allowedOrigins = allowedOriginsStr
                    .split(",")
                    .map((o) => o.trim())
                if (!allowedOrigins.includes(event.origin)) {
                    console.warn(
                        `[MessageBridge] Blocked message from unknown origin: ${event.origin}. Expected one of: ${allowedOrigins.join(", ")}`,
                    )
                    return
                }
            }

            let data = event.data
            try {
                if (typeof data === "string") {
                    data = JSON.parse(data)
                }
            } catch (e) {
                return
            }

            if (!data || typeof data !== "object") return

            const action = data.action

            switch (action) {
                case "status":
                    if (isDrawioReady) {
                        window.parent.postMessage(
                            JSON.stringify({ event: "init" }),
                            "*",
                        )
                    }
                    break

                case "load":
                    if (data.xml) {
                        loadDiagram(data.xml, true)
                    }
                    break

                case "save":
                    // Trigger an internal export to update chartXML.
                    // The useEffect above will catch the change and send the 'save' event.
                    handleExportWithoutHistory()
                    break

                case "export":
                    if (data.format) {
                        saveDiagramToFile("diagram", data.format)
                    }
                    break

                case "setTheme":
                    if (data.theme === "dark" || data.theme === "light") {
                        const isDark = data.theme === "dark"
                        document.documentElement.classList.toggle(
                            "dark",
                            isDark,
                        )
                        localStorage.setItem(
                            "next-ai-draw-io-dark-mode",
                            String(isDark),
                        )
                        window.location.reload()
                    }
                    break

                case "getTheme":
                    window.parent.postMessage(
                        JSON.stringify({
                            event: "themeResponse",
                            theme: document.documentElement.classList.contains(
                                "dark",
                            )
                                ? "dark"
                                : "light",
                        }),
                        "*",
                    )
                    break
            }
        }

        window.addEventListener("message", handleMessage)
        return () => window.removeEventListener("message", handleMessage)
    }, [
        loadDiagram,
        saveDiagramToFile,
        isDrawioReady,
        handleExportWithoutHistory,
    ])

    return null
}
