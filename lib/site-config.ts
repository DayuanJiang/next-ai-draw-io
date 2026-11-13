import { getApiEndpoint } from "@/lib/base-path"

/** What the server tells every page about itself (app/api/config) */
export interface SiteConfig {
    /** Google Analytics measurement id, when the server has one */
    gaId?: string
    /** The server keeps a usage log of the editor's actions */
    usageLog?: boolean
}

let config: Promise<SiteConfig> | undefined

/** Asked once per page load; empty when the server cannot be reached */
export function siteConfig(): Promise<SiteConfig> {
    config ??= fetch(getApiEndpoint("/api/config"))
        .then((res) => res.json())
        .catch(() => ({}))
    return config
}
