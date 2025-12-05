"use client";
import React, { useState, useEffect, useRef } from "react";
import { DrawIoEmbed } from "react-drawio";
import ChatPanel from "@/components/chat-panel";
import { useDiagram } from "@/contexts/diagram-context";
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
            <ResizablePanelGroup
                key={isMobile ? "mobile" : "desktop"}
                direction={isMobile ? "vertical" : "horizontal"}
                className="h-full"
            >
                {/* Draw.io Canvas */}
                <ResizablePanel defaultSize={isMobile ? 50 : 67} minSize={20}>
                    <div className={`h-full relative ${isMobile ? "p-1" : "p-2"}`}>
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
                    defaultSize={isMobile ? 50 : 33}
                    minSize={isMobile ? 20 : 15}
                    maxSize={isMobile ? 80 : 50}
                    collapsible={!isMobile}
                    collapsedSize={isMobile ? 0 : 3}
                    onCollapse={() => setIsChatVisible(false)}
                    onExpand={() => setIsChatVisible(true)}
                >
                    <div className={`h-full ${isMobile ? "p-1" : "py-2 pr-2"}`}>
                        <ChatPanel
                            isVisible={isChatVisible}
                            onToggleVisibility={toggleChatPanel}
                            drawioUi={drawioUi}
                            onToggleDrawioUi={() => {
                                const newTheme = drawioUi === "min" ? "sketch" : "min";
                                localStorage.setItem("drawio-theme", newTheme);
                                setDrawioUi(newTheme);
                            }}
                            isMobile={isMobile}
                        />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
