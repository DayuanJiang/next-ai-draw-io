import type { NextConfig } from "next"
import packageJson from "./package.json"

const nextConfig: NextConfig = {
    /* config options here */
    output: "standalone",
    // Support for subdirectory deployment (e.g., https://example.com/nextaidrawio)
    // Set NEXT_PUBLIC_BASE_PATH environment variable to your subdirectory path (e.g., /nextaidrawio)
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
    env: {
        APP_VERSION: packageJson.version,
    },
    // Include instrumentation.ts in standalone build for Langfuse telemetry
    outputFileTracingIncludes: {
        "*": ["./instrumentation.ts"],
    },
}

export default nextConfig

// Initialize OpenNext Cloudflare for local development only
// This must be a dynamic import to avoid loading workerd binary during builds
if (process.env.NODE_ENV === "development") {
    import("@opennextjs/cloudflare").then(
        ({ initOpenNextCloudflareForDev }) => {
            initOpenNextCloudflareForDev()
        },
    )
}
