"use client"

import { useState } from "react"
import Image from "@/components/image-with-basepath"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"

interface HistoryDialogProps {
    showHistory: boolean
    onToggleHistory: (show: boolean) => void
}

export function HistoryDialog({
    showHistory,
    onToggleHistory,
}: HistoryDialogProps) {
    const dict = useDictionary()
    const { loadDiagram: onDisplayChart, diagramHistory } = useDiagram()
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const handleClose = () => {
        setSelectedIndex(null)
        onToggleHistory(false)
    }

    const handleConfirmRestore = () => {
        if (selectedIndex !== null) {
            // Skip validation for trusted history snapshots
            onDisplayChart(diagramHistory[selectedIndex].xml, true)
            handleClose()
        }
    }

    return (
        <Dialog open={showHistory} onOpenChange={onToggleHistory}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto scrollbar-thin">
                <DialogHeader>
                    <DialogTitle>{dict.history.title}</DialogTitle>
                    <DialogDescription>
                        {dict.history.description}
                    </DialogDescription>
                </DialogHeader>

                {diagramHistory.length === 0 ? (
                    <div className="text-center p-4 text-gray-500">
                        {dict.history.noHistory}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
                        {diagramHistory.map((item, index) => (
                            <div
                                key={index}
                                className={`border rounded-md p-2 cursor-pointer hover:border-primary transition-colors ${
                                    selectedIndex === index
                                        ? "border-primary ring-2 ring-primary"
                                        : ""
                                }`}
                                onClick={() => setSelectedIndex(index)}
                            >
                                <div className="aspect-video bg-white rounded overflow-hidden flex items-center justify-center">
                                    <Image
                                        src={item.svg}
                                        alt={`${dict.history.version} ${index + 1}`}
                                        width={200}
                                        height={100}
                                        className="object-contain w-full h-full p-1"
                                    />
                                </div>
                                <div className="text-xs text-center mt-1 text-gray-500">
                                    {dict.history.version} {index + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    {selectedIndex !== null ? (
                        <>
                            <div className="flex-1 text-sm text-muted-foreground">
                                {formatMessage(dict.history.restoreTo, {
                                    version: selectedIndex + 1,
                                })}
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => setSelectedIndex(null)}
                            >
                                {dict.common.cancel}
                            </Button>
                            <Button onClick={handleConfirmRestore}>
                                {dict.common.confirm}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" onClick={handleClose}>
                            {dict.common.close}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
