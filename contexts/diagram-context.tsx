"use client";

import React, { createContext, useContext, useRef, useState } from "react";
import type { DrawIoEmbedRef } from "react-drawio";
import { extractDiagramXML } from "../lib/utils";
import type { ExportFormat } from "@/components/save-dialog";

interface DiagramContextType {
    chartXML: string;
    latestSvg: string;
    diagramHistory: { svg: string; xml: string }[];
    loadDiagram: (chart: string) => void;
    handleExport: () => void;
    handleExportWithoutHistory: () => void;
    resolverRef: React.Ref<((value: string) => void) | null>;
    drawioRef: React.Ref<DrawIoEmbedRef | null>;
    handleDiagramExport: (data: any) => void;
    clearDiagram: () => void;
    saveDiagramToFile: (filename: string, format: ExportFormat, sessionId?: string) => void;
}

const DiagramContext = createContext<DiagramContextType | undefined>(undefined);

export function DiagramProvider({ children }: { children: React.ReactNode }) {
    const [chartXML, setChartXML] = useState<string>("");
    const [latestSvg, setLatestSvg] = useState<string>("");
    const [diagramHistory, setDiagramHistory] = useState<
        { svg: string; xml: string }[]
    >([]);
    const drawioRef = useRef<DrawIoEmbedRef | null>(null);
    const resolverRef = useRef<((value: string) => void) | null>(null);
    // Track if we're expecting an export for history (user-initiated)
    const expectHistoryExportRef = useRef<boolean>(false);
    // Track if we're expecting an export for file save (stores raw export data)
    const saveResolverRef = useRef<{
        resolver: ((data: string) => void) | null;
        format: ExportFormat | null;
    }>({ resolver: null, format: null });

    const handleExport = () => {
        if (drawioRef.current) {
            // Mark that this export should be saved to history
            expectHistoryExportRef.current = true;
            drawioRef.current.exportDiagram({
                format: "xmlsvg",
            });
        }
    };

    const handleExportWithoutHistory = () => {
        if (drawioRef.current) {
            // Export without saving to history (for edit_diagram fetching current state)
            drawioRef.current.exportDiagram({
                format: "xmlsvg",
            });
        }
    };

    const loadDiagram = (chart: string) => {
        if (drawioRef.current) {
            drawioRef.current.load({
                xml: chart,
            });
        }
    };

    const handleDiagramExport = (data: any) => {
        // Handle save to file if requested (process raw data before extraction)
        if (saveResolverRef.current.resolver) {
            const format = saveResolverRef.current.format;
            saveResolverRef.current.resolver(data.data);
            saveResolverRef.current = { resolver: null, format: null };
            // For non-xmlsvg formats, skip XML extraction as it will fail
            // Only drawio (which uses xmlsvg internally) has the content attribute
            if (format === "png" || format === "svg") {
                return;
            }
        }

        const extractedXML = extractDiagramXML(data.data);
        setChartXML(extractedXML);
        setLatestSvg(data.data);

        // Only add to history if this was a user-initiated export
        if (expectHistoryExportRef.current) {
            setDiagramHistory((prev) => [
                ...prev,
                {
                    svg: data.data,
                    xml: extractedXML,
                },
            ]);
            expectHistoryExportRef.current = false;
        }

        if (resolverRef.current) {
            resolverRef.current(extractedXML);
            resolverRef.current = null;
        }
    };

    const clearDiagram = () => {
        const emptyDiagram = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
        loadDiagram(emptyDiagram);
        setChartXML(emptyDiagram);
        setLatestSvg("");
        setDiagramHistory([]);
    };

    const saveDiagramToFile = (filename: string, format: ExportFormat, sessionId?: string) => {
        if (!drawioRef.current) {
            console.warn("Draw.io editor not ready");
            return;
        }

        // Map format to draw.io export format
        const drawioFormat = format === "drawio" ? "xmlsvg" : format;

        // Set up the resolver before triggering export
        saveResolverRef.current = {
            resolver: (exportData: string) => {
                let fileContent: string | Blob;
                let mimeType: string;
                let extension: string;

                if (format === "drawio") {
                    // Extract XML from SVG for .drawio format
                    const xml = extractDiagramXML(exportData);
                    let xmlContent = xml;
                    if (!xml.includes("<mxfile")) {
                        xmlContent = `<mxfile><diagram name="Page-1" id="page-1">${xml}</diagram></mxfile>`;
                    }
                    fileContent = xmlContent;
                    mimeType = "application/xml";
                    extension = ".drawio";

                    // Log XML to Langfuse
                    logSaveToLangfuse(xmlContent, filename, format, sessionId);
                } else if (format === "png") {
                    // PNG data comes as base64 data URL
                    fileContent = exportData;
                    mimeType = "image/png";
                    extension = ".png";
                    logSaveToLangfuse(exportData, filename, format, sessionId);
                } else {
                    // SVG format
                    fileContent = exportData;
                    mimeType = "image/svg+xml";
                    extension = ".svg";
                    logSaveToLangfuse(exportData, filename, format, sessionId);
                }

                // Handle download
                let url: string;
                if (typeof fileContent === "string" && fileContent.startsWith("data:")) {
                    // Already a data URL (PNG)
                    url = fileContent;
                } else {
                    const blob = new Blob([fileContent], { type: mimeType });
                    url = URL.createObjectURL(blob);
                }

                const a = document.createElement("a");
                a.href = url;
                a.download = `${filename}${extension}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // Delay URL revocation to ensure download completes
                if (!url.startsWith("data:")) {
                    setTimeout(() => URL.revokeObjectURL(url), 100);
                }
            },
            format,
        };

        // Export diagram - callback will be handled in handleDiagramExport
        drawioRef.current.exportDiagram({ format: drawioFormat });
    };

    // Log save event to Langfuse
    const logSaveToLangfuse = async (content: string, filename: string, format: string, sessionId?: string) => {
        try {
            await fetch("/api/log-save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ xml: content, filename, format, sessionId }),
            });
        } catch (error) {
            console.warn("Failed to log save to Langfuse:", error);
        }
    };

    return (
        <DiagramContext.Provider
            value={{
                chartXML,
                latestSvg,
                diagramHistory,
                loadDiagram,
                handleExport,
                handleExportWithoutHistory,
                resolverRef,
                drawioRef,
                handleDiagramExport,
                clearDiagram,
                saveDiagramToFile,
            }}
        >
            {children}
        </DiagramContext.Provider>
    );
}

export function useDiagram() {
    const context = useContext(DiagramContext);
    if (context === undefined) {
        throw new Error("useDiagram must be used within a DiagramProvider");
    }
    return context;
}
