import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
        // vi.stubEnv values are undone after each test
        unstubEnvs: true,
        setupFiles: ["tests/setup.ts"],
        // The package source uses Node16 module resolution with explicit .js
        // extensions in imports. Vitest+esbuild handles the .ts→.js mapping
        // transparently, so no extra alias config is needed.
    },
})
