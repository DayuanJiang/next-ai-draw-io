import type { NextConfig } from "next"

const nextConfig: NextConfig = {
    /* config options here */
    output: "standalone",
}

export default nextConfig

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

initOpenNextCloudflareForDev()
