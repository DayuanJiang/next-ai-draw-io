import { z } from "zod"
import { getApiEndpoint } from "@/lib/base-path"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import { formatMessage } from "@/lib/i18n/utils"
import { STORAGE_KEYS } from "@/lib/storage"

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

/** A failure is thrown with its text for the user, taken from `dict` */
export async function extractUrlContent(
    url: string,
    dict: Dictionary,
): Promise<UrlData> {
    const response = await fetch(getApiEndpoint("/api/parse-url"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-access-code":
                localStorage.getItem(STORAGE_KEYS.accessCode) || "",
        },
        body: JSON.stringify({ url }),
    })

    // Try to parse JSON once
    const raw = await response
        .json()
        .catch(() => ({ error: "Unexpected non-JSON response" }))

    if (!response.ok) {
        // The server names the cause with a code and sends its numbers
        // along; its own `error` text is English only
        const texts = dict.url.errors as Record<string, string>
        throw new Error(
            response.status === 401
                ? dict.errors.invalidAccessCode
                : formatMessage(texts[raw?.code] ?? dict.url.failed, raw),
        )
    }

    const parsed = UrlResponseSchema.safeParse(raw)
    if (!parsed.success) {
        throw new Error(dict.url.failed)
    }

    return {
        url,
        title: parsed.data.title,
        content: parsed.data.content,
        charCount: parsed.data.charCount,
        isExtracting: false,
    }
}
