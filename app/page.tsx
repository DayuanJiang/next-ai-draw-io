"use client";
import React from "react";
import { DrawIoEmbed } from "react-drawio";
import ChatPanel from "@/components/chat-panel";
import { DiagramProvider, useDiagram } from "@/contexts/diagram-context";

// Internal layout component
function DiagramPageLayout({ children }: { children: React.ReactNode }) {
    const { drawioRef, handleDiagramExport } = useDiagram();

    return (
        <div className="flex h-screen bg-gray-100">
            <div className="w-2/3 p-1 h-full">
                <div className="h-full relative">
                    <div className="absolute inset-0">
                        <div className="w-full h-full">
                            <DrawIoEmbed
                                ref={drawioRef}
                                onExport={handleDiagramExport}
                                urlParameters={{
                                    spin: true,
                                    libraries: false,
                                    saveAndExit: false,
                                    noExitBtn: true,
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
            <div className="w-1/3 h-full p-1">{children}</div>
        </div>
    );
}

export default function Home() {
    return (
        <DiagramProvider>
            <DiagramPageLayout>
                <ChatPanel />
            </DiagramPageLayout>
        </DiagramProvider>
    );
}
