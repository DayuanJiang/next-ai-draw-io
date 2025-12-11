"use client"

import { useEffect } from "react"
import { useDiagram } from "@/contexts/diagram-context"

/**
 * Listens for messages from the parent window (iframe host)
 * and translates them into DiagramContext actions.
 */
export function MessageBridge() {
    const { loadDiagram, chartXML, saveDiagramToFile, isDrawioReady } =
        useDiagram()

    // Announce readiness when draw.io loads
    useEffect(() => {
        if (isDrawioReady) {
            window.parent.postMessage(JSON.stringify({ event: "init" }), "*")
        }
    }, [isDrawioReady])

    // Listen for inbound commands
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // In production, you might want to check event.origin check here.
            // For localhost dev, we skip strict origin check or verify against allowed list.

            let data = event.data
            try {
                if (typeof data === "string") {
                    data = JSON.parse(data)
                }
            } catch (e) {
                // Not JSON, ignore
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
