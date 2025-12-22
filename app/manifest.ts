import type { MetadataRoute } from "next"
import { getAssetUrl } from "@/lib/base-path"
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Next AI Draw.io",
        short_name: "AIDraw.io",
        description:
            "Create AWS architecture diagrams, flowcharts, and technical diagrams using AI. Free online tool integrating draw.io with AI assistance for professional diagram creation.",
        start_url: getAssetUrl("/"),
        display: "standalone",
        background_color: "#f9fafb",
        theme_color: "#171d26",
        icons: [
            {
                src: getAssetUrl("/favicon-192x192.png"),
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: getAssetUrl("/favicon-512x512.png"),
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
        ],
    }
}
