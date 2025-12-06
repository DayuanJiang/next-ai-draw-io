"use client"

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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface SettingsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCloseProtectionChange?: (enabled: boolean) => void
}

export const STORAGE_ACCESS_CODE_KEY = "next-ai-draw-io-access-code"
export const STORAGE_CLOSE_PROTECTION_KEY = "next-ai-draw-io-close-protection"

export function SettingsDialog({
    open,
    onOpenChange,
    onCloseProtectionChange,
}: SettingsDialogProps) {
    const [accessCode, setAccessCode] = useState("")
    const [closeProtection, setCloseProtection] = useState(true)
    const [isVerifying, setIsVerifying] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        if (open) {
            const storedCode =
                localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
            setAccessCode(storedCode)

            const storedCloseProtection = localStorage.getItem(
                STORAGE_CLOSE_PROTECTION_KEY,
            )
            // Default to true if not set
            setCloseProtection(storedCloseProtection !== "false")
            setError("")
        }
    }, [open])

    const handleSave = async () => {
        setError("")
        setIsVerifying(true)

        try {
            // Verify access code with server
            const response = await fetch("/api/verify-access-code", {
                method: "POST",
                headers: {
                    "x-access-code": accessCode.trim(),
                },
            })

            const data = await response.json()

            if (!data.valid) {
                setError(data.message || "Invalid access code")
                setIsVerifying(false)
                return
            }

            // Save settings only if verification passes
            localStorage.setItem(STORAGE_ACCESS_CODE_KEY, accessCode.trim())
            localStorage.setItem(
                STORAGE_CLOSE_PROTECTION_KEY,
                closeProtection.toString(),
            )
            onCloseProtectionChange?.(closeProtection)
            onOpenChange(false)
        } catch {
            setError("Failed to verify access code")
        } finally {
            setIsVerifying(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault()
            handleSave()
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Configure your access settings.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Access Code
                        </label>
                        <Input
                            type="password"
                            value={accessCode}
                            onChange={(e) => setAccessCode(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter access code"
                            autoComplete="off"
                        />
                        <p className="text-[0.8rem] text-muted-foreground">
                            Required if the server has enabled access control.
                        </p>
                        {error && (
                            <p className="text-[0.8rem] text-destructive">
                                {error}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="close-protection">
                                Close Protection
                            </Label>
                            <p className="text-[0.8rem] text-muted-foreground">
                                Show confirmation when leaving the page.
                            </p>
                        </div>
                        <Switch
                            id="close-protection"
                            checked={closeProtection}
                            onCheckedChange={setCloseProtection}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isVerifying}>
                        {isVerifying ? "Verifying..." : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
