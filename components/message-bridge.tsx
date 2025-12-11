"use client"

import { useEffect } from "react"
import { useDiagram } from "@/contexts/diagram-context"

export function MessageBridge() {
    const { loadDiagram, chartXML, saveDiagramToFile, isDrawioReady } =
        useDiagram()

    useEffect(() => {
        if (isDrawioReady) {
            window.parent.postMessage(JSON.stringify({ event: "init" }), "*")
        }
    }, [isDrawioReady])

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
                    // Parent asking "are you there?"
                    // If we are mounted, we are at least partially ready.
                    // If drawio is fully ready, we send init.
                    if (isDrawioReady) {
                        window.parent.postMessage(
                            JSON.stringify({ event: "init" }),
                            "*",
                        )
                    }
                    break

                case "load":
                    if (data.xml) {
                        loadDiagram(data.xml, true) // skip validation if trusted? or keep validation
                    }
                    break

                case "save":
                    // Parent wants the current XML
                    window.parent.postMessage(
                        JSON.stringify({
                            event: "save",
                            xml: chartXML,
                        }),
                        "*",
                    )
                    break

                case "export":
                    // Parent wants to export/download
                    // data.format could be 'png', 'svg', 'xml' (drawio)
                    if (data.format) {
                        // usage: saveDiagramToFile(filename, format, sessionId)
                        // We use a default filename "diagram"
                        saveDiagramToFile("diagram", data.format)

                        // NOTE: saveDiagramToFile triggers a download in the *iframe*.
                        // If the parent wants the data URI back, this bridge needs
                        // significant changes to hooking into the saveResolver.
                        // For now, "download in iframe" fulfills "export the diagram".
                    }
                    break
            }
        }

        window.addEventListener("message", handleMessage)
        return () => window.removeEventListener("message", handleMessage)
    }, [loadDiagram, chartXML, saveDiagramToFile, isDrawioReady])

    return null // logical component only, no UI
}
