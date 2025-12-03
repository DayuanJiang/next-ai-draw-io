"use client";

import React, { createContext, useContext, useRef, useState } from "react";
import type { DrawIoEmbedRef } from "react-drawio";
import { extractDiagramXML } from "../lib/utils";

interface DiagramContextType {
    chartXML: string;
    latestSvg: string;
    diagramHistory: { svg: string; xml: string }[];
    loadDiagram: (chart: string) => void;
    handleExport: () => void;
    resolverRef: React.Ref<((value: string) => void) | null>;
    drawioRef: React.Ref<DrawIoEmbedRef | null>;
    handleDiagramExport: (data: any) => void;
    clearDiagram: () => void;
    saveDiagramToFile: (filename: string) => void;
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
    // Track if we're expecting an export for file save
    const saveResolverRef = useRef<((xml: string) => void) | null>(null);

    const handleExport = () => {
        if (drawioRef.current) {
            // Mark that this export should be saved to history
            expectHistoryExportRef.current = true;
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

        // Handle save to file if requested
        if (saveResolverRef.current) {
            saveResolverRef.current(extractedXML);
            saveResolverRef.current = null;
        }
    };

    const clearDiagram = () => {
        const emptyDiagram = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
        loadDiagram(emptyDiagram);
        setChartXML(emptyDiagram);
        setLatestSvg("");
        setDiagramHistory([]);
    };

    const saveDiagramToFile = (filename: string) => {
        if (!drawioRef.current) {
            console.warn("Draw.io editor not ready");
            return;
        }

        // Export diagram and save when export completes
        drawioRef.current.exportDiagram({ format: "xmlsvg" });
        saveResolverRef.current = (xml: string) => {
            // Wrap in proper .drawio format
            let fileContent = xml;
            if (!xml.includes("<mxfile")) {
                fileContent = `<mxfile><diagram name="Page-1" id="page-1">${xml}</diagram></mxfile>`;
            }

            const blob = new Blob([fileContent], { type: "application/xml" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            // Add .drawio extension if not present
            a.download = filename.endsWith(".drawio") ? filename : `${filename}.drawio`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Delay URL revocation to ensure download completes
            setTimeout(() => URL.revokeObjectURL(url), 100);
        };
    };

    return (
        <DiagramContext.Provider
            value={{
                chartXML,
                latestSvg,
                diagramHistory,
                loadDiagram,
                handleExport,
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
