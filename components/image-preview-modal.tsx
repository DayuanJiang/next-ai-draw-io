"use client"

import { Download, X, ZoomIn, ZoomOut } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

interface ImagePreviewModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    imageUrl: string
    imageAlt?: string
}

export function ImagePreviewModal({
    open,
    onOpenChange,
    imageUrl,
    imageAlt = "预览图片",
}: ImagePreviewModalProps) {
    const [zoom, setZoom] = useState(100)

    useEffect(() => {
        if (open) {
            setZoom(100)
        }
    }, [open])

    const handleDownload = async () => {
        try {
            // Convert image to PNG if it's not already
            const img = new Image()
            img.crossOrigin = "anonymous"

            await new Promise((resolve, reject) => {
                img.onload = resolve
                img.onerror = reject
                img.src = imageUrl
            })

            const canvas = document.createElement("canvas")
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext("2d")

            if (ctx) {
                ctx.drawImage(img, 0, 0)
                canvas.toBlob((blob) => {
                    if (blob) {
                        const url = URL.createObjectURL(blob)
                        const link = document.createElement("a")
                        link.href = url
                        link.download = `ai-generated-image-${Date.now()}.png`
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        URL.revokeObjectURL(url)
                        toast.success("图片已下载")
                    }
                }, "image/png")
            }
        } catch (error) {
            console.error("Download failed:", error)
            // Fallback to direct download
            const link = document.createElement("a")
            link.href = imageUrl
            link.download = `ai-generated-image-${Date.now()}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            toast.success("图片已下载")
        }
    }

    const handleZoomIn = () => {
        setZoom((prev) => Math.min(prev + 25, 200))
    }

    const handleZoomOut = () => {
        setZoom((prev) => Math.max(prev - 25, 50))
    }

    const handleReset = () => {
        setZoom(100)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[90vw] max-h-[90vh] p-0">
                <DialogHeader className="p-4 pb-0">
                    <div className="flex items-center justify-between">
                        <DialogTitle>{imageAlt}</DialogTitle>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleZoomOut}
                                disabled={zoom <= 50}
                                title="缩小"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleReset}
                                className="min-w-[60px]"
                            >
                                {zoom}%
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleZoomIn}
                                disabled={zoom >= 200}
                                title="放大"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleDownload}
                                title="下载为 PNG"
                            >
                                <Download className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onOpenChange(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </DialogHeader>
                <div className="overflow-auto p-4 flex items-center justify-center bg-muted/30">
                    <img
                        src={imageUrl}
                        alt={imageAlt}
                        style={{
                            width: `${zoom}%`,
                            height: "auto",
                            maxWidth: "none",
                        }}
                        className="rounded-lg"
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
