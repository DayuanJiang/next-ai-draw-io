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
import { useLanguage } from "@/contexts/language-context";

interface HistoryDialogProps {
    showHistory: boolean;
    onToggleHistory: (show: boolean) => void;
}

export function HistoryDialog({
    showHistory,
    onToggleHistory,
}: HistoryDialogProps) {
    const { loadDiagram: onDisplayChart, diagramHistory } = useDiagram();
    const { t } = useLanguage();

    return (
        <Dialog open={showHistory} onOpenChange={onToggleHistory}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("history.title")}</DialogTitle>
                    <DialogDescription>
                        {t("history.description")}
                    </DialogDescription>
                </DialogHeader>

                {diagramHistory.length === 0 ? (
                    <div className="text-center p-4 text-gray-500">
                        {t("history.empty")}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
                        {diagramHistory.map((item, index) => (
                            <div
                                key={index}
                                className="border rounded-md p-2 cursor-pointer hover:border-primary transition-colors"
                                onClick={() => {
                                    onDisplayChart(item.xml);
                                    onToggleHistory(false);
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
                                    {t("history.version")} {index + 1}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onToggleHistory(false)}
                    >
                        {t("history.close")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
