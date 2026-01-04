export interface UrlData {
    url: string
    title: string
    content: string
    charCount: number
    isExtracting: boolean
}

export async function extractUrlContent(url: string): Promise<UrlData> {
    const response = await fetch("/api/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error || "Failed to extract URL content")
    }

    const data = await response.json()
    return {
        url,
        title: data.title,
        content: data.content,
        charCount: data.charCount,
        isExtracting: false,
    }
}
