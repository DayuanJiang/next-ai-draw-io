import { z } from "zod"
import { getApiEndpoint } from "@/lib/base-path"

export interface UrlData {
    url: string
    title: string
    content: string
    charCount: number
    isExtracting: boolean
}

const UrlResponseSchema = z.object({
    title: z.string().default("Untitled"),
    content: z.string(),
    charCount: z.number().int().nonnegative(),
})

export async function extractUrlContent(url: string): Promise<UrlData> {
    const response = await fetch(getApiEndpoint("/api/parse-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    })

    // Try to parse JSON once
    const raw = await response
        .json()
        .catch(() => ({ error: "Unexpected non-JSON response" }))

    if (!response.ok) {
        const message =
            typeof raw === "object" && raw && "error" in raw
                ? String((raw as any).error)
                : "Failed to extract URL content"
        throw new Error(message)
    }

    const parsed = UrlResponseSchema.safeParse(raw)
    if (!parsed.success) {
        throw new Error("Malformed response from URL extraction API")
    }

    return {
        url,
        title: parsed.data.title,
        content: parsed.data.content,
        charCount: parsed.data.charCount,
        isExtracting: false,
    }
}
