import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"
import { saveDiagramImage } from "./diagram-storage"

export async function renderDiagramToImage(
  taskId: string,
  xml: string,
  format: "png" | "svg",
  options?: { width?: number; height?: number }
): Promise<{ url: string; size: number }> {
  // 配置 Puppeteer 以支持 serverless 环境
  const isProduction = process.env.NODE_ENV === "production"
  const browser = await puppeteer.launch({
    args: isProduction ? chromium.args : ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: isProduction ? await chromium.executablePath() : undefined,
    headless: chromium.headless,
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({
      width: options?.width || 1920,
      height: options?.height || 1080,
    })

    const drawioUrl =
      process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || "https://embed.diagrams.net"
    await page.goto(`${drawioUrl}/?embed=1&ui=min&spin=1&proto=json`, {
      timeout: 30000,
    })

    await page.waitForSelector("iframe", { timeout: 10000 })

    await page.evaluate((diagramXml) => {
      const iframe = document.querySelector("iframe") as HTMLIFrameElement
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ action: "load", xml: diagramXml }),
        "*"
      )
    }, xml)

    // 等待图表渲染完成（使用超时保护）
    await page.waitForFunction(
      () => {
        const iframe = document.querySelector("iframe") as HTMLIFrameElement
        const svg = iframe?.contentDocument?.querySelector("svg")
        return svg && svg.children.length > 0
      },
      { timeout: 10000 }
    )

    let buffer: Buffer
    if (format === "png") {
      const screenshot = await page.screenshot({ type: "png", fullPage: true })
      buffer = Buffer.from(screenshot)
    } else {
      const svg = await page.evaluate(() => {
        const iframe = document.querySelector("iframe") as HTMLIFrameElement
        const svgElement = iframe?.contentDocument?.querySelector("svg")
        if (!svgElement) {
          throw new Error("SVG element not found")
        }
        return svgElement.outerHTML
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
