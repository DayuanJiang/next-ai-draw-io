import { createElement, useEffect, useRef } from "react"
import { toast } from "sonner"
import { UpdateToast } from "@/components/update-toast"

export function useAutoUpdate() {
    const downloadToastId = useRef<string | number | null>(null)

    useEffect(() => {
        const api = (window as Window).electronAPI
        if (!api?.onUpdateStatus) return

        const cleanup = api.onUpdateStatus((data) => {
            switch (data.status) {
                case "available":
                    toast.custom(
                        (t) =>
                            createElement(UpdateToast, {
                                variant: "download",
                                version: data.version,
                                onDownload: () => {
                                    toast.dismiss(t)
                                    api.startDownload().catch(() => {
                                        // Error will come through update-status channel
                                    })
                                },
                                onDismiss: () => toast.dismiss(t),
                            }),
                        { duration: 15000 },
                    )
                    break

                case "available-manual":
                    toast.custom(
                        (t) =>
                            createElement(UpdateToast, {
                                variant: "manual",
                                version: data.version,
                                url: data.url,
                                onDismiss: () => toast.dismiss(t),
                            }),
                        { duration: Number.POSITIVE_INFINITY },
                    )
                    break

                case "downloading": {
                    const id =
                        downloadToastId.current ??
                        `download-progress-${Date.now()}`
                    downloadToastId.current = id
                    toast.custom(
                        (t) =>
                            createElement(UpdateToast, {
                                variant: "downloading",
                                percent: data.percent,
                                onDismiss: () => toast.dismiss(t),
                            }),
                        { id, duration: Number.POSITIVE_INFINITY },
                    )
                    break
                }

                case "downloaded":
                    // Dismiss progress toast — native restart dialog handles the rest
                    if (downloadToastId.current) {
                        toast.dismiss(downloadToastId.current)
                        downloadToastId.current = null
                    }
                    break

                case "error":
                    if (downloadToastId.current) {
                        // Error during active download — inform the user
                        toast.dismiss(downloadToastId.current)
                        downloadToastId.current = null
                        toast.error(
                            "Update download failed. Please try again later.",
                        )
                    }
                    // Otherwise: silent — background check failure, logged in main process
                    break
            }
        })

        return cleanup
    }, [])
}
