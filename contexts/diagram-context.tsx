"use client";

import React, { createContext, useContext, useRef, useState } from "react";
import type { DrawIoEmbedRef } from "react-drawio";
import { extractDiagramXML, formatXML } from "../lib/utils";

interface DiagramContextType {
    chartXML: string;
    latestSvg: string;
    diagramHistory: { svg: string; xml: string }[];
    lastAgentGeneratedXml: string;
    getLastAgentGeneratedXml: () => string;
    setLastAgentGeneratedXml: (xml: string) => void;
    markAgentDiagramPending: () => void;
    loadDiagram: (chart: string) => void;
    handleExport: () => void;
    resolverRef: React.Ref<((value: string) => void) | null>;
    drawioRef: React.Ref<DrawIoEmbedRef | null>;
    handleDiagramExport: (data: any) => void;
    clearDiagram: () => void;
}

const DiagramContext = createContext<DiagramContextType | undefined>(undefined);

export function DiagramProvider({ children }: { children: React.ReactNode }) {
    const [chartXML, setChartXML] = useState<string>("");
    const [latestSvg, setLatestSvg] = useState<string>("");
    const [diagramHistory, setDiagramHistory] = useState<
        { svg: string; xml: string }[]
    >([]);
    const [lastAgentGeneratedXml, setLastAgentGeneratedXmlState] = useState<string>("");
    const lastAgentGeneratedXmlRef = useRef<string>("");
    const agentDiagramPendingRef = useRef<boolean>(false);
    const drawioRef = useRef<DrawIoEmbedRef | null>(null);
    const resolverRef = useRef<((value: string) => void) | null>(null);

    // Wrapper to keep ref and state in sync
    const setLastAgentGeneratedXml = (xml: string) => {
        lastAgentGeneratedXmlRef.current = xml;
        setLastAgentGeneratedXmlState(xml);
    };

    // Getter that returns the ref value (always up-to-date, even in async contexts)
    const getLastAgentGeneratedXml = () => lastAgentGeneratedXmlRef.current;

    const markAgentDiagramPending = () => {
        console.log('[DiagramContext] markAgentDiagramPending called');
        agentDiagramPendingRef.current = true;
    };

    const handleExport = () => {
        if (drawioRef.current) {
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
        setDiagramHistory((prev) => [
            ...prev,
            {
                svg: data.data,
                xml: extractedXML,
            },
        ]);

        // If agent just generated a diagram, update lastAgentGeneratedXml with the exported XML
        // This ensures we compare apples-to-apples (both formatted the same way)
        if (agentDiagramPendingRef.current) {
            const formatted = formatXML(extractedXML);
            console.log('[DiagramContext] Setting lastAgentGeneratedXml from export, length:', formatted.length);
            setLastAgentGeneratedXml(formatted);
            agentDiagramPendingRef.current = false;
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
        setLastAgentGeneratedXml("");
    };

    return (
        <DiagramContext.Provider
            value={{
                chartXML,
                latestSvg,
                diagramHistory,
                lastAgentGeneratedXml,
                getLastAgentGeneratedXml,
                setLastAgentGeneratedXml,
                markAgentDiagramPending,
                loadDiagram,
                handleExport,
                resolverRef,
                drawioRef,
                handleDiagramExport,
                clearDiagram,
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
