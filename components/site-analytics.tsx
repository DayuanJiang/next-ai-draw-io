"use client"

import { GoogleAnalytics } from "@next/third-parties/google"
import { useEffect, useState } from "react"
import { siteConfig } from "@/lib/site-config"

/**
 * Google Analytics, on servers that run with NEXT_PUBLIC_GA_ID. The page
 * asks the server for the id: pages are rendered when the app is built, and
 * the published Docker image is built without one.
 */
export function SiteAnalytics() {
    const [gaId, setGaId] = useState<string>()
    useEffect(() => {
        void siteConfig().then((config) => setGaId(config.gaId))
    }, [])
    return gaId ? <GoogleAnalytics gaId={gaId} /> : null
}
