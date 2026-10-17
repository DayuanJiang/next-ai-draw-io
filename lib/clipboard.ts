import { useState } from "react"

/** Copy text, falling back to execCommand for non-secure contexts (HTTP) */
export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        const textarea = document.createElement("textarea")
        textarea.value = text
        textarea.style.position = "fixed"
        textarea.style.left = "-9999px"
        textarea.style.opacity = "0"
        document.body.appendChild(textarea)
        try {
            textarea.select()
            return document.execCommand("copy")
        } catch {
            return false
        } finally {
            document.body.removeChild(textarea)
        }
    }
}

/** Copy text and show "copied" for a moment; onFail runs when it failed */
export function useCopy(onFail?: () => void) {
    const [copied, setCopied] = useState(false)
    const copy = async (text: string) => {
        const ok = await copyText(text)
        if (!ok) onFail?.()
        setCopied(ok)
        setTimeout(() => setCopied(false), 1500)
    }
    return { copied, copy }
}
