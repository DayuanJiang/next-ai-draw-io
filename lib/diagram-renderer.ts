import puppeteer from "puppeteer"
import { saveDiagramImage } from "./diagram-storage"

export async function renderDiagramToImage(
  taskId: string,
  xml: string,
  format: "png" | "svg",
  options?: { width?: number; height?: number }
): Promise<{ url: string; size: number }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({
      width: options?.width || 1920,
      height: options?.height || 1080,
    })

    const drawioUrl =
      process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || "https://embed.diagrams.net"
    await page.goto(`${drawioUrl}/?embed=1&ui=min&spin=1&proto=json`)

    await page.waitForSelector("iframe")

    await page.evaluate((diagramXml) => {
      const iframe = document.querySelector("iframe") as HTMLIFrameElement
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ action: "load", xml: diagramXml }),
        "*"
      )
    }, xml)

    await new Promise((resolve) => setTimeout(resolve, 2000))

    let buffer: Buffer
    if (format === "png") {
      const screenshot = await page.screenshot({ type: "png", fullPage: true })
      buffer = Buffer.from(screenshot)
    } else {
      const svg = await page.evaluate(() => {
        const iframe = document.querySelector("iframe") as HTMLIFrameElement
        return iframe?.contentDocument?.querySelector("svg")?.outerHTML || ""
      })
      buffer = Buffer.from(svg, "utf-8")
    }

    saveDiagramImage(taskId, buffer, format)

    return {
      url: `/api/generate-diagram/${taskId}/download`,
      size: buffer.length,
    }
  } finally {
    await browser.close()
  }
}
