import { defineConfig } from "@playwright/test"

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? [["list"], ["html"]] : "html",
    webServer: {
        command: process.env.CI ? "npm run start" : "npm run dev",
        port: process.env.CI ? 6001 : 6002,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
    use: {
        baseURL: process.env.CI
            ? "http://localhost:6001"
            : "http://localhost:6002",
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: { browserName: "chromium" },
        },
    ],
})
