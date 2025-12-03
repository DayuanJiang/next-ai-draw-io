"use client";
import React, { useState, useEffect } from "react";
import { DrawIoEmbed } from "react-drawio";
import ChatPanel from "@/components/chat-panel";
import { useDiagram } from "@/contexts/diagram-context";
import { Monitor } from "lucide-react";

export default function Home() {
    const { drawioRef, handleDiagramExport } = useDiagram();
    const [isMobile, setIsMobile] = useState(false);
    const [isChatVisible, setIsChatVisible] = useState(true);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
                event.preventDefault();
                setIsChatVisible((prev) => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="flex h-screen bg-background relative overflow-hidden">
            {/* Mobile warning overlay */}
            {isMobile && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-background">
                    <div className="text-center p-8 max-w-sm mx-auto animate-fade-in">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                            <Monitor className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-xl font-semibold text-foreground mb-3">
                            Desktop Required
                        </h1>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            This application works best on desktop or laptop devices. Please open it on a larger screen for the full experience.
                        </p>
                    </div>
                </div>
            )}

            {/* Draw.io Canvas */}
            <div
                className={`${isChatVisible ? 'w-2/3' : 'w-full'} h-full relative transition-all duration-300 ease-out`}
            >
                <div className="absolute inset-2 rounded-xl overflow-hidden shadow-soft-lg border border-border/30 bg-white">
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

            {/* Chat Panel */}
            <div
                className={`${isChatVisible ? 'w-1/3' : 'w-12'} h-full transition-all duration-300 ease-out`}
            >
                <div className="h-full py-2 pr-2">
                    <ChatPanel
                        isVisible={isChatVisible}
                        onToggleVisibility={() => setIsChatVisible(!isChatVisible)}
                    />
                </div>
            </div>
        </div>
    );
}
