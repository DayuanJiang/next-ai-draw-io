"use client"

import { Check, Copy, Download } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { convertToStructurizrDsl } from "@/lib/structurizr-utils"

interface ExportStructurizrDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    xml: string
}

export function ExportStructurizrDialog({
    open,
    onOpenChange,
    xml,
}: ExportStructurizrDialogProps) {
    const [dsl, setDsl] = useState("")
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        if (open && xml) {
            try {
                const result = convertToStructurizrDsl(xml)
                setDsl(result)
                setError("")
            } catch (err) {
                setError("Failed to convert diagram to DSL format")
                setDsl("")
                console.error("DSL conversion error:", err)
            }
        }
    }, [open, xml])

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(dsl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Failed to copy to clipboard:", err)
        }
    }

    const handleDownload = () => {
        const blob = new Blob([dsl], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "diagram.dsl"
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Export to Structurizr DSL</DialogTitle>
                    <DialogDescription>
                        C4 model diagram as code. Use with Structurizr Lite,
                        CLI, or cloud service.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                        {error}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <ScrollArea className="h-[400px] w-full rounded-md border">
                            <pre className="p-4 text-xs font-mono">
                                <code>{dsl}</code>
                            </pre>
                        </ScrollArea>
                    </div>
                )}

                <DialogFooter className="sm:justify-between">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={handleCopy}
                            disabled={!dsl}
                        >
                            {copied ? (
                                <>
                                    <Check className="w-4 h-4 mr-2" />
                                    Copied
                                </>
                            ) : (
                                <>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy
                                </>
                            )}
                        </Button>
                        <Button onClick={handleDownload} disabled={!dsl}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
