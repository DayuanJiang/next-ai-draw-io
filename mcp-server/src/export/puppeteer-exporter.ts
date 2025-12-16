/**
 * Puppeteer-based diagram exporter
 * Uses headless browser to render draw.io diagrams to PNG/SVG
 */

import puppeteer, { type Browser, type Page } from "puppeteer"

export interface ExportOptions {
    format: "png" | "svg" | "drawio"
    scale: number
    background?: string
    border: number
}

export interface ExportResult {
    data: string // Base64 encoded
    mimeType: string
    filename: string
}

// Singleton browser instance for performance
let browserInstance: Browser | null = null

/**
 * Get or create a browser instance
 */
async function getBrowser(): Promise<Browser> {
    if (!browserInstance || !browserInstance.connected) {
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
        const noSandbox = process.env.PUPPETEER_NO_SANDBOX === "true"

        browserInstance = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-gpu",
                ...(noSandbox ? ["--disable-web-security"] : []),
            ],
            ...(executablePath && { executablePath }),
        })

        console.error("[puppeteer-exporter] Browser launched")
    }
    return browserInstance
}

/**
 * Export a draw.io diagram to the specified format
 */
export async function exportDiagram(
    xml: string,
    options: ExportOptions
): Promise<ExportResult> {
    // For .drawio format, just return the XML directly (no rendering needed)
    if (options.format === "drawio") {
        return {
            data: Buffer.from(xml, "utf-8").toString("base64"),
            mimeType: "application/xml",
            filename: "diagram.drawio",
        }
    }

    const browser = await getBrowser()
    const page = await browser.newPage()

    try {
        // Set viewport for consistent rendering
        await page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: options.scale,
        })

        // Create HTML page with draw.io viewer
        const html = createDrawioViewerHtml(xml, options)
        await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 })

        // Initialize the viewer by setting data-mxgraph attribute via JavaScript
        // This must be done AFTER the viewer script loads
        await page.evaluate((diagramXml) => {
            const config = {
                highlight: "#0000ff",
                nav: false,
                resize: true,
                toolbar: "",
                edit: "_blank",
                xml: diagramXml,
            }
            const mxgraphDiv = document.querySelector(".mxgraph")
            if (mxgraphDiv) {
                mxgraphDiv.setAttribute("data-mxgraph", JSON.stringify(config))
                // @ts-ignore - GraphViewer is loaded from external script
                if (typeof GraphViewer !== "undefined") {
                    // @ts-ignore
                    GraphViewer.createViewerForElement(mxgraphDiv)
                }
            }
        }, xml)

        // Wait for the diagram to render (SVG appears in container)
        await page.waitForFunction(
            () => {
                const container = document.getElementById("diagram-container")
                return container && container.getElementsByTagName("svg").length > 0
            },
            { timeout: 30000 }
        )

        // Additional wait for complex diagrams to fully render
        await new Promise((resolve) => setTimeout(resolve, 2000))

        if (options.format === "svg") {
            // Extract SVG content
            const svgContent = await page.evaluate(() => {
                const container = document.getElementById("diagram-container")
                const svg = container?.querySelector("svg")
                if (svg) {
                    // Clone and clean up the SVG
                    const clone = svg.cloneNode(true) as SVGElement
                    // Remove any scripts or interactive elements
                    clone.querySelectorAll("script").forEach((s) => s.remove())
                    return new XMLSerializer().serializeToString(clone)
                }
                return null
            })

            if (!svgContent) {
                throw new Error("Failed to extract SVG content from rendered diagram")
            }

            return {
                data: Buffer.from(svgContent, "utf-8").toString("base64"),
                mimeType: "image/svg+xml",
                filename: "diagram.svg",
            }
        }

        // PNG: Take screenshot of the diagram container
        const containerElement = await page.$("#diagram-container")
        if (!containerElement) {
            throw new Error("Diagram container not found")
        }

        const screenshot = await containerElement.screenshot({
            type: "png",
            omitBackground: !options.background,
            encoding: "base64",
        })

        return {
            data: screenshot as string,
            mimeType: "image/png",
            filename: "diagram.png",
        }
    } finally {
        await page.close()
    }
}

/**
 * Create HTML page with embedded draw.io viewer
 * The XML is passed via a global variable and set after script loads
 */
function createDrawioViewerHtml(xml: string, options: ExportOptions): string {
    const backgroundColor = options.background || "transparent"
    const padding = options.border || 10

    // Escape XML for embedding in JavaScript string
    const jsEscapedXml = JSON.stringify(xml)

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: ${backgroundColor};
        }
        #diagram-container {
            padding: ${padding}px;
            background: ${backgroundColor};
            display: inline-block;
        }
        #diagram-container svg {
            display: block;
        }
    </style>
</head>
<body>
    <div id="diagram-container">
        <div class="mxgraph" style="max-width:100%;"></div>
    </div>
    <script>
        // Store XML for later use
        window.diagramXml = ${jsEscapedXml};
    </script>
    <script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
</body>
</html>`
}

/**
 * Close the browser instance (for cleanup)
 */
export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close()
        browserInstance = null
        console.error("[puppeteer-exporter] Browser closed")
    }
}

// Cleanup on process exit
process.on("exit", () => {
    if (browserInstance) {
        browserInstance.close().catch(() => {
            // Ignore errors on exit
        })
    }
})

process.on("SIGINT", async () => {
    await closeBrowser()
})

process.on("SIGTERM", async () => {
    await closeBrowser()
})
