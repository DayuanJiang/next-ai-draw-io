import type { Browser } from "puppeteer"

class BrowserPool {
  private browser: Browser | null = null
  private lastUsed: number = 0
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000 // 5分钟
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private launchPromise: Promise<Browser> | null = null // 防止并发竞态

  async getBrowser(): Promise<Browser> {
    // 已有可用浏览器实例
    if (this.browser && this.browser.connected) {
      this.lastUsed = Date.now()
      this.resetIdleTimer()
      return this.browser
    }

    // 正在启动中，复用同一个 Promise 防止并发启动多个浏览器
    if (this.launchPromise) {
      return this.launchPromise
    }

    this.launchPromise = this.launchBrowser()
    try {
      const browser = await this.launchPromise
      return browser
    } finally {
      this.launchPromise = null
    }
  }

  private async launchBrowser(): Promise<Browser> {
    const isProduction = process.env.NODE_ENV === "production"

    let browser: Browser
    if (isProduction) {
      const puppeteerCore = await import("puppeteer-core")
      const chromium = await import("@sparticuz/chromium")
      browser = await puppeteerCore.default.launch({
        args: chromium.default.args,
        executablePath: await chromium.default.executablePath(),
      })
    } else {
      const puppeteer = await import("puppeteer")
      browser = await puppeteer.default.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
      })
    }

    // 监听浏览器断开事件，自动清理引用
    browser.on("disconnected", () => {
      console.log("[browser-pool] 浏览器进程断开连接，清理引用")
      if (this.browser === browser) {
        this.browser = null
        this.clearIdleTimer()
      }
    })

    this.browser = browser
    this.lastUsed = Date.now()
    this.resetIdleTimer()
    return browser
  }

  private resetIdleTimer() {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(async () => {
      if (this.browser && Date.now() - this.lastUsed > this.IDLE_TIMEOUT) {
        console.log("[browser-pool] 浏览器空闲超时，关闭实例")
        await this.closeBrowser()
      }
    }, this.IDLE_TIMEOUT)
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  private async closeBrowser() {
    this.clearIdleTimer()
    if (this.browser) {
      try {
        await this.browser.close()
      } catch {
        // 浏览器可能已经关闭
      }
      this.browser = null
    }
  }
}

export const browserPool = new BrowserPool()
