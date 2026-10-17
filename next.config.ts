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
    // Include instrumentation.ts in standalone build for Langfuse telemetry,
    // the shape library docs get_shape_library reads at run time, and the
    // docs pages' Markdown
    outputFileTracingIncludes: {
        "*": ["./instrumentation.ts"],
        "/api/chat": ["./docs/shape-libraries/*.md"],
        "/[lang]/docs/[[...slug]]": [
            "./docs/en/*.md",
            "./docs/cn/*.md",
            "./docs/ja/*.md",
            "./docs/tw/*.md",
        ],
        "/sitemap.xml": [
            "./docs/en/*.md",
            "./docs/cn/*.md",
            "./docs/ja/*.md",
            "./docs/tw/*.md",
        ],
    },
    // The Chinese and Japanese About pages used to be separate routes. The
    // addresses without a language, which Google still has, go there in one
    // step instead of through the language redirect first.
    async redirects() {
        return [
            { source: "/about/cn", destination: "/zh/about", permanent: true },
            { source: "/about/ja", destination: "/ja/about", permanent: true },
            {
                source: "/:lang/about/cn",
                destination: "/zh/about",
                permanent: true,
            },
            {
                source: "/:lang/about/ja",
                destination: "/ja/about",
                permanent: true,
            },
        ]
    },
}

export default nextConfig
