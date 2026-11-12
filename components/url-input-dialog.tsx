"use client"

import { Link, Loader2 } from "lucide-react"
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

    // Each opening starts empty: the link read last time is in the chat
    useEffect(() => {
        if (open) {
            setUrl("")
            setError("")
        }
    }, [open])

    const handleSubmit = () => {
        setError("")

        const typed = url.trim()
        if (!typed) {
            setError(dict.url.enterUrl)
            return
        }
        // A link typed without its scheme ("example.com/article") is an
        // https one
        const link = /^[a-z][a-z\d+.-]*:\/\//i.test(typed)
            ? typed
            : `https://${typed}`

        // Text with spaces is no address, though Chrome's URL takes it as
        // a host name
        let valid = !/\s/.test(link)
        try {
            new URL(link)
        } catch {
            valid = false
        }
        if (!valid) {
            setError(dict.url.invalidFormat)
            return
        }

        onSubmit(link)
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
                    <DialogTitle>{dict.url.title}</DialogTitle>
                    <DialogDescription>
                        {dict.url.description}
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
                        {dict.url.Cancel}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isExtracting || !url.trim()}
                    >
                        {isExtracting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {dict.url.Extracting}
                            </>
                        ) : (
                            <>
                                <Link className="mr-2 h-4 w-4" />
                                {dict.url.extract}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
