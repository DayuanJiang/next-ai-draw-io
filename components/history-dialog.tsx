"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useDiagram } from "@/contexts/diagram-context";

interface HistoryDialogProps {
    showHistory: boolean;
    setShowHistory: (show: boolean) => void;
}

export function HistoryDialog({
    showHistory,
    setShowHistory,
}: HistoryDialogProps) {
    const { loadDiagram: onDisplayChart, diagramHistory } = useDiagram();

    return (
        <Dialog open={showHistory} onOpenChange={setShowHistory}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Diagram History</DialogTitle>
                    <DialogDescription>
                        Here saved each diagram before AI modification.
                        <br />
                        Click on a diagram to restore it
                    </DialogDescription>
                </DialogHeader>

                {diagramHistory.length === 0 ? (
                    <div className="text-center p-4 text-gray-500">
                        No history available yet. Send messages to create
                        diagram history.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
                        {diagramHistory.map((item, index) => (
                            <div
                                key={index}
                                className="border rounded-md p-2 cursor-pointer hover:border-primary transition-colors"
                                onClick={() => {
                                    onDisplayChart(item.xml);
                                    setShowHistory(false);
                                }}
                            >
                                <div className="aspect-video bg-white rounded overflow-hidden flex items-center justify-center">
                                    <Image
                                        src={item.svg}
                                        alt={`Diagram version ${index + 1}`}
                                        width={200}
                                        height={100}
                                        className="object-contain w-full h-full p-1"
                                    />
                                </div>
                                <div className="text-xs text-center mt-1 text-gray-500">
                                    Version {index + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setShowHistory(false)}
                    >
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
