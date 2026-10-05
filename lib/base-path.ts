/**
 * Get the base path for API calls and static assets
 * This is used for subdirectory deployment support
 *
 * Example: If deployed at https://example.com/nextaidrawio, this returns "/nextaidrawio"
 * For root deployment, this returns ""
 *
 * Set NEXT_PUBLIC_BASE_PATH environment variable to your subdirectory path (e.g., /nextaidrawio)
 */
export function getBasePath(): string {
    // Read from environment variable (must start with NEXT_PUBLIC_ to be available on client)
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
    if (basePath && !basePath.startsWith("/")) {
        console.warn("NEXT_PUBLIC_BASE_PATH should start with /")
    }
    return basePath
}

/**
 * Get full API endpoint URL
 * @param endpoint - API endpoint path (e.g., "/api/chat", "/api/config")
 * @returns Full API path with base path prefix
 */
export function getApiEndpoint(endpoint: string): string {
    const basePath = getBasePath()
    return `${basePath}${endpoint}`
}

/**
 * Get full static asset URL
 * @param assetPath - Asset path (e.g., "/example.png", "/chain-of-thought.txt")
 * @returns Full asset path with base path prefix
 */
export function getAssetUrl(assetPath: string): string {
    const basePath = getBasePath()
    return `${basePath}${assetPath}`
}
