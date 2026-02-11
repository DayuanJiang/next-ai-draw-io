import { streamText } from "ai"
import { getAIModel } from "@/lib/ai-providers"
import { getSystemPrompt } from "@/lib/system-prompts"

export async function generateDiagramXML(description: string): Promise<string> {
    const { model, providerOptions, headers, modelId } = getAIModel()
    const systemPrompt = getSystemPrompt(modelId, true)

    const result = streamText({
        model,
        system: systemPrompt,
        messages: [{ role: "user", content: description }],
        ...(providerOptions && providerOptions),
        ...(headers && { headers }),
    })

    let fullText = ""
    for await (const chunk of result.textStream) {
        fullText += chunk
    }

    const xmlMatch = fullText.match(/<mxfile[\s\S]*?<\/mxfile>/i)
    if (!xmlMatch) {
        throw new Error("No diagram XML generated")
    }

    return xmlMatch[0]
}
