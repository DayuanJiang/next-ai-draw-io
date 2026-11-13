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
    experimental: {
        // proxy.ts runs on /api/*, and Next keeps only this much of a
        // request body it passed: a cut chat request is unreadable JSON.
        // The default 10 MB is less than one message with five 2 MB images.
        proxyClientMaxBodySize: "32mb",
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
    // The bundled draw.io is about 15 files that load one after another.
    // Next serves public files with max-age=0: without this header each
    // visit asks the server about every one of them again, seven round
    // trips in a row before the canvas can start. Their paths carry no
    // version, so a release with a newer draw.io reaches a returning
    // browser only after this time: 4 hours keeps that short.
    async headers() {
        return [
            {
                source: "/drawio/:path*",
                headers: [
                    { key: "Cache-Control", value: "public, max-age=14400" },
                ],
            },
        ]
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
