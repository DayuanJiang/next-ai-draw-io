import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Next AI Draw.io",
        short_name: "AIDraw.io",
        description:
            "Create AWS architecture diagrams, flowcharts, and technical diagrams using AI. Free online tool integrating draw.io with AI assistance for professional diagram creation.",
        start_url: "/",
        display: "standalone",
        background_color: "#f9fafb",
        theme_color: "#171d26",
        icons: [
            {
                src: "/favicon-192x192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/favicon-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
        ],
    }
}
