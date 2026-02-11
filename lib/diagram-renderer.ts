import { saveDiagramImage } from "./diagram-storage"

export async function renderDiagramToImage(
  taskId: string,
  xml: string,
  format: "png" | "svg",
  options?: { width?: number; height?: number }
): Promise<{ url: string; size: number }> {
  // 配置 Puppeteer 以支持 serverless 环境
  const isProduction = process.env.NODE_ENV === "production"

  let browser
  if (isProduction) {
    // 生产环境：使用 puppeteer-core + chromium
    const puppeteerCore = await import("puppeteer-core")
    const chromium = await import("@sparticuz/chromium")
    browser = await puppeteerCore.default.launch({
      args: chromium.default.args,
      executablePath: await chromium.default.executablePath(),
      headless: chromium.default.headless,
    })
  } else {
    // 开发环境：使用完整的 puppeteer（自带 Chrome）
    const puppeteer = await import("puppeteer")
    browser = await puppeteer.default.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    })
  }

  try {
    const page = await browser.newPage()
    await page.setViewport({
      width: options?.width || 1920,
      height: options?.height || 1080,
    })

    const drawioUrl =
      process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || "https://embed.diagrams.net"

    // 使用简化的 URL 参数，确保 iframe 能够正确加载
    await page.goto(`${drawioUrl}/?embed=1&proto=json&spin=1`, {
      timeout: 30000,
      waitUntil: 'networkidle0',
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
