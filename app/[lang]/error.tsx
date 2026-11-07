"use client"

import { CrashScreen } from "@/components/crash-screen"
import { useDictionary } from "@/hooks/use-dictionary"

// A page under the layout crashed while rendering; the layout (and its
// dictionary) still works
export default function PageError({
    error,
}: {
    error: Error & { digest?: string }
}) {
    const dict = useDictionary()
    return (
        <CrashScreen
            error={error}
            strings={{ crash: dict.crash, report: dict.report }}
        />
    )
}
