"use client"

import { useEffect, useRef, useState } from "react"
import { useDictionary } from "@/hooks/use-dictionary"
import { wrapWithMxFile } from "@/lib/utils"

// Dev XML presets for streaming simulator
const DEV_XML_PRESETS: Record<string, string> = {
    "Simple Box": `<mxCell id="2" value="Hello World" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
  <mxGeometry x="120" y="100" width="120" height="60" as="geometry"/>
</mxCell>`,
    "Two Boxes with Arrow": `<mxCell id="2" value="Start" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="100" height="50" as="geometry"/>
</mxCell>
<mxCell id="3" value="End" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
  <mxGeometry x="300" y="100" width="100" height="50" as="geometry"/>
</mxCell>
<mxCell id="4" value="" style="endArrow=classic;html=1;" edge="1" parent="1" source="2" target="3">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>`,
    Flowchart: `<mxCell id="2" value="Start" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="160" y="40" width="80" height="40" as="geometry"/>
</mxCell>
<mxCell id="3" value="Process A" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
  <mxGeometry x="140" y="120" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="4" value="Decision" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
  <mxGeometry x="150" y="220" width="100" height="80" as="geometry"/>
</mxCell>
<mxCell id="5" value="Process B" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
  <mxGeometry x="300" y="230" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="6" value="End" style="ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
  <mxGeometry x="160" y="340" width="80" height="40" as="geometry"/>
</mxCell>
<mxCell id="7" style="endArrow=classic;html=1;" edge="1" parent="1" source="2" target="3">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="8" style="endArrow=classic;html=1;" edge="1" parent="1" source="3" target="4">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="9" value="Yes" style="endArrow=classic;html=1;" edge="1" parent="1" source="4" target="6">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="10" value="No" style="endArrow=classic;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;" edge="1" parent="1" source="4" target="5">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>`,
    "Truncated (Error Test)": `<mxCell id="2" value="This cell is truncated" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
  <mxGeometry x="120" y="100" width="120" height="60" as="geometry"/>
</mxCell>
<mxCell id="3" value="Incomplete" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor`,
    "HTML Escape + Cell Truncate": `<mxCell id="2" value="<b>Chain-of-Thought Prompting</b><br/><font size='12'>Eliciting Reasoning in Large Language Models</font>" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=16;fontStyle=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="720" height="60" as="geometry"/>
</mxCell>
<mxCell id="3" value="<b>Problem: LLM Reasoning Limitations</b><br/>• Scaling parameters alone insufficient for logical tasks<br/>• Arithmetic, commonsense, symbolic reasoning challenges<br/>• Standard prompting fails on multi-step problems" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="1">
  <mxGeometry x="40" y="120" width="340" height="120" as="geometry"/>
</mxCell>
<mxCell id="4" value="<b>Traditional Approaches</b><br/>1. <b>Finetuning:</b> Expensive, task-specific<br/>2. <b>Standard Few-Shot:</b> Input→Output pairs<br/>   (No explanation of reasoning)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
  <mxGeometry x="420" y="120" width="340" height="120" as="geometry"/>
</mxCell>
<mxCell id="5" value="<b>CoT Methodology</b><br/>• Add reasoning steps to few-shot examples<br/>• Natural language intermediate steps<br/>• No parameter updates needed<br/>• Model learns to generate own thought process" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="40" y="260" width="340" height="100" as="geometry"/>
</mxCell>
<mxCell id="6" value="<b>Example Comparison</b><br/><b>Standard:</b><br/>Q: Roger has 5 balls. He buys 2 cans of 3 balls. How many?<br/>A: 11.<br/><br/><b>CoT:</b><br/>Q: Roger has 5 balls. He buys 2 cans of 3 balls. How many?<br/>A: Roger started with 5 balls. 2 cans of 3 tennis balls each is 6 tennis balls. 5 + 6 = 11. The answer is 11." style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
  <mxGeometry x="420" y="260" width="340" height="140" as="geometry"/>
</mxCell>
<mxCell id="7" value="<b>Experimental Models</b><br/>• GPT-3 (175B)<br/>• LaMDA (137B)<br/>• PaLM (540B)<br/>• UL2 (20B)<br/>• Codex" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
  <mxGeometry x="40" y="380" width="340" height="100" as="geometry"/>
</mxCell>
<mxCell id="8" value="<b>Reasoning Domains Tested</b><br/>1. <b>Arithmetic:</b> GSM8K, SVAMP, ASDiv, AQuA, MAWPS<br/>2. <b>Commonsense:</b> CSQA, StrategyQA, Date Understanding, Sports Understanding<br/>3. <b>Symbolic:</b> Last Letter Concatenation, Coin Flip" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1">
  <mxGeometry x="420" y="420" width="340" height="100" as="geometry"/>
</mxCell>
<mxCell id="9" value="<b>Key Results: Arithmetic</b><br/>• PaLM 540B + CoT: <b>56.9%</b> on GSM8K<br/>   (vs 17.9% standard)<br/>• Surpassed finetuned GPT-3 (55%)<br/>• With calculator: <b>58.6%</b>" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="40" y="500" width="220" height="100" as="geometry"/>
</mxCell>
<mxCell id="10" value="<b>Key Results: Commonsense</b><br/>• StrategyQA: <b>75.6%</b><br/>   (vs 69.4% SOTA)<br/>• Sports Understanding: <b>95.4%</b><br/>   (vs 84% human)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="280" y="500" width="220" height="100" as="geometry"/>
</mxCell>
<mxCell id="11" value="<b>Key Results: Symbolic</b><br/>• OOD Generalization<br/>• Coin Flip: Trained on 2 flips<br/>   Works on 3-4 flips with CoT<br/>• Standard prompting fails" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
  <mxGeometry x="540" y="500" width="220" height="100" as="geometry"/>
</mxCell>
<mxCell id="12" value="<b>Emergent Ability of Scale</b><br/>• Small models (&lt;10B): No benefit, often harmful<br/>• Large models (100B+): Reasoning emerges<br/>• CoT gains increase dramatically with scale" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="1">
  <mxGeometry x="40" y="620" width="340" height="80" as="geometry"/>
</mxCell>
<mxCell id="13" value="<b>Ablation Studies</b><br/>1. Equation only: Worse than CoT<br/>2. Variable compute (...): No improvement<br/>3. Answer first, then reasoning: Same as baseline<br/>→ Content matters, not just extra tokens" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
  <mxGeometry x="420" y="620" width="340" height="80" as="geometry"/>
</mxCell>
<mxCell id="14" value="<b>Error Analysis</b><br/>• Semantic understanding errors<br/>• One-step missing errors<br/>• Calculation errors<br/>• Larger models reduce semantic/missing-step errors" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
  <mxGeometry x="40" y="720" width="340" height="80" as="geometry"/>
</mxCell>
<mxCell id="15" value="<b>Conclusion</b><br/>• CoT unlocks reasoning potential<br/>• Simple paradigm: &quot;show your work&quot;<br/>• Emergent capability of large models<br/>• No specialized architecture needed" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
  <mxGeometry x="420" y="720" width="340" height="80" as="geometry"/>
</mxCell>
<mxCell id="16" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="3" target="5">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="17" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="4" target="6">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="18" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="5" target="7">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="19" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="6" target="8">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="20" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.25;entryY=0;" edge="1" parent="1" source="7" target="9">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="21" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="7" target="10">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="22" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.75;entryY=0;" edge="1" parent="1" source="7" target="11">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="23" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="9" target="12">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="24" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="10" target="13">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="25" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="11" target="14">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="26" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="12" target="15">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="27" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="13" target="15">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
<mxCell id="28" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="14" target="15">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>`,
}

interface DevXmlSimulatorProps {
    setMessages: React.Dispatch<React.SetStateAction<any[]>>
    onDisplayChart: (xml: string) => void
    onShowQuotaToast?: () => void
}

export function DevXmlSimulator({
    setMessages,
    onDisplayChart,
    onShowQuotaToast,
}: DevXmlSimulatorProps) {
    const dict = useDictionary()
    const [devXml, setDevXml] = useState("")
    const [isSimulating, setIsSimulating] = useState(false)
    const [devIntervalMs, setDevIntervalMs] = useState(1)
    const [devChunkSize, setDevChunkSize] = useState(10)
    const devStopRef = useRef(false)
    const devXmlInitializedRef = useRef(false)

    // Restore dev XML from localStorage on mount (after hydration)
    useEffect(() => {
        const saved = localStorage.getItem("dev-xml-simulator")
        if (saved) setDevXml(saved)
        devXmlInitializedRef.current = true
    }, [])

    // Save dev XML to localStorage (only after initial load)
    useEffect(() => {
        if (devXmlInitializedRef.current) {
            localStorage.setItem("dev-xml-simulator", devXml)
        }
    }, [devXml])

    const handleDevSimulate = async () => {
        if (!devXml.trim() || isSimulating) return

        setIsSimulating(true)
        devStopRef.current = false
        const toolCallId = `dev-sim-${Date.now()}`
        const xml = devXml.trim()

        // Add user message and initial assistant message with empty XML
        const userMsg = {
            id: `user-${Date.now()}`,
            role: "user" as const,
            parts: [
                {
                    type: "text" as const,
                    text: dict.dev.simulatingMessage,
                },
            ],
        }
        const assistantMsg = {
            id: `assistant-${Date.now()}`,
            role: "assistant" as const,
            parts: [
                {
                    type: "tool-display_diagram" as const,
                    toolCallId,
                    state: "input-streaming" as const,
                    input: { xml: "" },
                },
            ],
        }
        setMessages((prev) => [...prev, userMsg, assistantMsg] as any)

        // Stream characters progressively
        for (let i = 0; i < xml.length; i += devChunkSize) {
            if (devStopRef.current) {
                setIsSimulating(false)
                return
            }

            const chunk = xml.slice(0, i + devChunkSize)

            setMessages((prev) => {
                const updated = [...prev]
                const lastMsg = updated[updated.length - 1] as any
                if (lastMsg?.role === "assistant" && lastMsg.parts?.[0]) {
                    lastMsg.parts[0].input = { xml: chunk }
                }
                return updated
            })

            await new Promise((r) => setTimeout(r, devIntervalMs))
        }

        if (devStopRef.current) {
            setIsSimulating(false)
            return
        }

        // Finalize: set state to output-available
        setMessages((prev) => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1] as any
            if (lastMsg?.role === "assistant" && lastMsg.parts?.[0]) {
                lastMsg.parts[0].state = "output-available"
                lastMsg.parts[0].output = dict.dev.successMessage
                lastMsg.parts[0].input = { xml }
            }
            return updated
        })

        // Display the final diagram
        const fullXml = wrapWithMxFile(xml)
        onDisplayChart(fullXml)

        setIsSimulating(false)
    }

    return (
        <div className="border-t border-dashed border-orange-500/50 px-4 py-2 bg-orange-50/50 dark:bg-orange-950/30">
            <details>
                <summary className="text-xs text-orange-600 dark:text-orange-400 cursor-pointer font-medium">
                    {dict.dev.title}
                </summary>
                <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">
                            {dict.dev.preset}
                        </label>
                        <select
                            onChange={(e) => {
                                if (e.target.value) {
                                    setDevXml(DEV_XML_PRESETS[e.target.value])
                                }
                            }}
                            className="flex-1 text-xs p-1 border rounded bg-background"
                            defaultValue=""
                        >
                            <option value="" disabled>
                                {dict.dev.selectPreset}
                            </option>
                            {Object.keys(DEV_XML_PRESETS).map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => setDevXml("")}
                            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground border rounded"
                        >
                            {dict.dev.clear}
                        </button>
                    </div>
                    <textarea
                        value={devXml}
                        onChange={(e) => setDevXml(e.target.value)}
                        placeholder={dict.dev.placeholder}
                        className="w-full h-24 text-xs font-mono p-2 border rounded bg-background"
                    />
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 flex-1">
                            <label className="text-xs text-muted-foreground whitespace-nowrap">
                                {dict.dev.interval}
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="200"
                                step="1"
                                value={devIntervalMs}
                                onChange={(e) =>
                                    setDevIntervalMs(Number(e.target.value))
                                }
                                className="flex-1 h-1 accent-orange-500"
                            />
                            <span className="text-xs text-muted-foreground w-12">
                                {devIntervalMs}ms
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground whitespace-nowrap">
                                {dict.dev.chars}
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={devChunkSize}
                                onChange={(e) =>
                                    setDevChunkSize(
                                        Math.max(1, Number(e.target.value)),
                                    )
                                }
                                className="w-14 text-xs p-1 border rounded bg-background"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleDevSimulate}
                            disabled={isSimulating || !devXml.trim()}
                            className="px-3 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSimulating
                                ? dict.dev.streaming
                                : `${dict.dev.simulate} (${devChunkSize} chars/${devIntervalMs}ms)`}
                        </button>
                        {isSimulating && (
                            <button
                                type="button"
                                onClick={() => {
                                    devStopRef.current = true
                                }}
                                className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                                {dict.dev.stop}
                            </button>
                        )}
                        {onShowQuotaToast && (
                            <button
                                type="button"
                                onClick={onShowQuotaToast}
                                className="px-3 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
                            >
                                {dict.dev.testQuotaToast}
                            </button>
                        )}
                    </div>
                </div>
            </details>
        </div>
    )
}
