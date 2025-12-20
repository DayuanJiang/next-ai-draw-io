"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useDictionary } from "@/hooks/use-dictionary"

interface ResetWarningModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onClear: () => void
}

export function ResetWarningModal({
    open,
    onOpenChange,
    onClear,
}: ResetWarningModalProps) {
    const dict = useDictionary()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{dict.dialogs.clearTitle}</DialogTitle>
                    <DialogDescription>
                        {dict.dialogs.clearDescription}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        {dict.common.cancel}
                    </Button>
                    <Button variant="destructive" onClick={onClear}>
                        {dict.dialogs.clearEverything}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
