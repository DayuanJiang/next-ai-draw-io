import { streamText } from "ai"
import { getAIModel, type ClientOverrides } from "@/lib/ai-providers"
import { getSystemPrompt } from "@/lib/system-prompts"

export async function generateDiagramXML(description: string, overrides?: ClientOverrides): Promise<string> {
    const { model, providerOptions, headers, modelId } = getAIModel(overrides)
    const systemPrompt = getSystemPrompt(modelId, true)

    const result = streamText({
        model,
        system: systemPrompt,
        messages: [{ role: "user", content: description }],
        ...(providerOptions && providerOptions),
        ...(headers && { headers }),
    })

    const chunks: string[] = []
    for await (const chunk of result.textStream) {
        chunks.push(chunk)
    }
    const fullText = chunks.join("")

    // 尝试从 Markdown 代码块中提取 XML
    let xmlContent = fullText
    const markdownMatch = fullText.match(/```xml\s*([\s\S]*?)\s*```/i)
    if (markdownMatch) {
        xmlContent = markdownMatch[1]
    }

    // 查找 <mxfile> 标签
    const xmlMatch = xmlContent.match(/<mxfile[\s\S]*?<\/mxfile>/i)
    if (xmlMatch) {
        return xmlMatch[0]
    }

    // 如果没有找到完整的 <mxfile>，尝试构建一个
    if (xmlContent.includes("<mxCell")) {
        const wrappedXml = `<mxfile host="app.diagrams.net" modified="2026-02-11T00:00:00.000Z" agent="AI" version="24.0.0">
  <diagram name="Page-1" id="1">
    <mxGraphModel dx="1422" dy="794" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${xmlContent}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`
        return wrappedXml
    }

    console.error("[diagram-generator] 未找到有效的 XML，完整响应:", fullText)
    throw new Error("No diagram XML generated")
}
