"use client"

import { Link, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useDictionary } from "@/hooks/use-dictionary"

interface UrlInputDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (url: string) => void
    isExtracting: boolean
}

export function UrlInputDialog({
    open,
    onOpenChange,
    onSubmit,
    isExtracting,
}: UrlInputDialogProps) {
    const dict = useDictionary()
    const [url, setUrl] = useState("")
    const [error, setError] = useState("")

    const handleSubmit = () => {
        setError("")

        if (!url.trim()) {
            setError("Please enter a URL")
            return
        }

        try {
            new URL(url)
        } catch {
            setError("Invalid URL format")
            return
        }

        onSubmit(url.trim())
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !isExtracting) {
            e.preventDefault()
            handleSubmit()
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{dict.pdf.title}</DialogTitle>
                    <DialogDescription>
                        {dict.pdf.description}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Input
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value)
                                setError("")
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="https://example.com/article"
                            disabled={isExtracting}
                            autoFocus
                        />
                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isExtracting}
                    >
                        {dict.pdf.Cancel}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isExtracting || !url.trim()}
                    >
                        {isExtracting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {dict.pdf.Extracting}
                            </>
                        ) : (
                            <>
                                <Link className="mr-2 h-4 w-4" />
                                {dict.pdf.extract}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
