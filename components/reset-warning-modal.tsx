"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/language-context";

interface ResetWarningModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onClear: () => void;
}

export function ResetWarningModal({
    open,
    onOpenChange,
    onClear,
}: ResetWarningModalProps) {
    const { t } = useLanguage();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("modal.clearTitle")}</DialogTitle>
                    <DialogDescription>
                        {t("modal.clearDescription")}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        {t("modal.cancel")}
                    </Button>
                    <Button variant="destructive" onClick={onClear}>
                        {t("modal.clearAll")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
