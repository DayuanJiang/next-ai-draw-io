import type { NextConfig } from "next"
import packageJson from "./package.json"

const nextConfig: NextConfig = {
    /* config options here */
    output: "standalone",
    env: {
        APP_VERSION: packageJson.version,
    },
}

export default nextConfig
