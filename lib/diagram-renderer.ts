import { saveDiagramImage } from "./diagram-storage"
import { browserPool } from "./browser-pool"

const allowedResources = new Set(['document', 'script', 'xhr', 'fetch'])

export async function renderDiagramToImage(
  taskId: string,
  xml: string,
  format: "png" | "svg",
  options?: { width?: number; height?: number }
): Promise<{ url: string; size: number }> {
  const browser = await browserPool.getBrowser()
  const page = await browser.newPage()

  try {
    // 禁用不必要的资源加载以加快速度
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (allowedResources.has(req.resourceType())) {
        req.continue()
      } else {
        req.abort()
      }
    })

    await page.setViewport({
      width: options?.width || 1920,
      height: options?.height || 1080,
    })

    const drawioUrl =
      process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || "https://embed.diagrams.net"
    const fullUrl = `${drawioUrl}/?embed=1&proto=json&spin=1`

    try {
      await page.goto(fullUrl, {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[diagram-renderer] 页面加载失败:", message)
      throw error
    }

    // 等待 iframe 出现
    const iframeHandle = await page.waitForSelector("iframe", { timeout: 15000 })
    if (!iframeHandle) {
      throw new Error("Draw.io 页面中没有找到 iframe 元素")
    }

    await page.evaluate((diagramXml) => {
      const iframe = document.querySelector("iframe") as HTMLIFrameElement
      iframe?.contentWindow?.postMessage(
        JSON.stringify({ action: "load", xml: diagramXml }),
        "*"
      )
    }, xml)

    // 等待图表渲染完成
    await page.waitForFunction(
      () => {
        const iframe = document.querySelector("iframe") as HTMLIFrameElement
        const svg = iframe?.contentDocument?.querySelector("svg")
        return svg && svg.children.length > 0
      },
      { timeout: 15000 }
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

    await saveDiagramImage(taskId, buffer, format)

    return {
      url: `/api/generate-diagram/${taskId}/download`,
      size: buffer.length,
    }
  } finally {
    await page.close()
  }
}
