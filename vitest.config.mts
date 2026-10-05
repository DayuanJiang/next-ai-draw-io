import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
    plugins: [tsconfigPaths(), react()],
    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.{ts,tsx}"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["lib/**/*.ts", "app/**/*.ts", "app/**/*.tsx"],
            exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"],
        },
    },
})
