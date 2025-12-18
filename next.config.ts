import type { NextConfig } from "next"

const nextConfig: NextConfig = {
    /* config options here */
    output: "standalone",
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
}

export default nextConfig
