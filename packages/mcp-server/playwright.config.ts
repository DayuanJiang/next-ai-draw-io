import { defineConfig } from "@playwright/test"

// Browser tests of the built package (npm run build first): each spec
// starts the MCP server itself over stdio, so there is no web server here.
// Playwright comes from the repository root (npm ci there).
export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 90_000,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: "list",
    use: {
        browserName: "chromium",
        trace: "retain-on-failure",
    },
})
