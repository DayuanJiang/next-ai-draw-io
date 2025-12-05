"use client";
import React, { useState, useEffect, useRef } from "react";
import { DrawIoEmbed } from "react-drawio";
import ChatPanel from "@/components/chat-panel";
import { useDiagram } from "@/contexts/diagram-context";
import { Monitor } from "lucide-react";
import {
    ResizablePanelGroup,
    ResizablePanel,
    ResizableHandle,
} from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";

export default function Home() {
    const { drawioRef, handleDiagramExport } = useDiagram();
    const [isMobile, setIsMobile] = useState(false);
    const [isChatVisible, setIsChatVisible] = useState(true);
    const [drawioUi, setDrawioUi] = useState<"min" | "sketch">(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("drawio-theme");
            if (saved === "min" || saved === "sketch") return saved;
        }
        return "min";
    });
    const chatPanelRef = useRef<ImperativePanelHandle>(null);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const toggleChatPanel = () => {
        const panel = chatPanelRef.current;
        if (panel) {
            if (panel.isCollapsed()) {
                panel.expand();
                setIsChatVisible(true);
            } else {
                panel.collapse();
                setIsChatVisible(false);
            }
        }
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "b") {
                event.preventDefault();
                toggleChatPanel();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Show confirmation dialog when user tries to leave the page
    // This helps prevent accidental navigation from browser back gestures
    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            return "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    return (
        <div className="h-screen bg-background relative overflow-hidden">
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
                            This application works best on desktop or laptop
                            devices. Please open it on a larger screen for the
                            full experience.
                        </p>
                    </div>
                </div>
            )}

            <ResizablePanelGroup direction="horizontal" className="h-full">
                {/* Draw.io Canvas */}
                <ResizablePanel defaultSize={67} minSize={30}>
                    <div className="h-full relative p-2">
                        <div className="h-full rounded-xl overflow-hidden shadow-soft-lg border border-border/30 bg-white">
                            <DrawIoEmbed
                                key={drawioUi}
                                ref={drawioRef}
                                onExport={handleDiagramExport}
                                urlParameters={{
                                    ui: drawioUi,
                                    spin: true,
                                    libraries: false,
                                    saveAndExit: false,
                                    noExitBtn: true,
                                }}
                            />
                        </div>
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Chat Panel */}
                <ResizablePanel
                    ref={chatPanelRef}
                    defaultSize={33}
                    minSize={15}
                    maxSize={50}
                    collapsible
                    collapsedSize={3}
                    onCollapse={() => setIsChatVisible(false)}
                    onExpand={() => setIsChatVisible(true)}
                >
                    <div className="h-full py-2 pr-2">
                        <ChatPanel
                            isVisible={isChatVisible}
                            onToggleVisibility={toggleChatPanel}
                            drawioUi={drawioUi}
                            onToggleDrawioUi={() => {
                                const newTheme = drawioUi === "min" ? "sketch" : "min";
                                localStorage.setItem("drawio-theme", newTheme);
                                setDrawioUi(newTheme);
                            }}
                        />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
