"use client";
import React from "react";
import { DrawIoEmbed } from "react-drawio";
import ChatPanel from "@/components/chat-panel";
import { useDiagram } from "@/contexts/diagram-context";

export default function Home() {
    const { drawioRef, handleDiagramExport } = useDiagram();

    return (
        <div className="flex h-screen bg-gray-100">
            <div className="w-2/3 p-1 h-full relative">
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
            <div className="w-1/3 h-full p-1">
                <ChatPanel />
            </div>
        </div>
    );
}
