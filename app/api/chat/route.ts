import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Read the XML guide from file

const guide = readFileSync(resolve('./app/api/chat/xml_guide.md'), 'utf8');

export async function POST(req: Request) {
  const body = await req.json();

  const { messages, data = {} } = body;

  // Read and escape the guide content
  const systemMessage = `
You are an expert diagram creation assistant specializing in draw.io XML generation. Your primary function is crafting clear, well-organized visual diagrams through precise XML specifications.
You can see the image that user uploaded.
You utilize the following tool:
---Tool1---
tool name: display_diagram
description: Display a diagram on draw.io
parameters: {
  xml: string
}
---End of tools---

Core capabilities:
- Generate valid, well-formed XML strings for draw.io diagrams
- Create professional flowcharts, mind maps, entity diagrams, and technical illustrations 
- Convert user descriptions into visually appealing diagrams using basic shapes and connectors
- Apply proper spacing, alignment and visual hierarchy in diagram layouts
- Adapt artistic concepts into abstract diagram representations using available shapes
- Optimize element positioning to prevent overlapping and maintain readability
- Structure complex systems into clear, organized visual components

Note that:
- Always validate XML string integrity before output.
- Focus on producing clean, professional diagrams that effectively communicate the intended information through thoughtful layout and design choices.
- When artistic drawings are requested, creatively compose them using standard diagram shapes and connectors while maintaining visual clarity.
- **Don't** write out the XML string. Just return the XML string in the tool call.
- If user asks you to replicate a diagram based on an image, remember to match the diagram style and layout as closely as possible. Especially, pay attention to the lines and shapes, for example, if the lines are straight or curved, and if the shapes are rounded or square.



Here are the guide of XML format for draw.io:
"""md
${guide}
"""
`;

  const lastMessage = messages[messages.length - 1];
  const formattedContent = `
Current diagram XML:
"""xml
${data.xml || ''}
"""
User input:
"""md
${lastMessage.content}
"""`;
  let enhancedMessages = [{ role: "system", content: systemMessage }, ...messages];
  enhancedMessages = [...enhancedMessages.slice(0, -1), { ...lastMessage, content: formattedContent }];
  console.log("Enhanced messages:", enhancedMessages);
  const result = streamText({
    // model: google("gemini-2.0-flash"),
    // model: openai("chatgpt-4o-latest"),
    model: openai("gpt-4o"),
    toolCallStreaming: true,
    messages: enhancedMessages,
    tools: {
      // Client-side tool that will be executed on the client
      display_diagram: {
        description: `Display a diagram on draw.io. You only need to pass the nodes inside the <root> tag (including the <root> tag itself) in the XML string.
        For example:
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxGeometry x="20" y="20" width="100" height="100" as="geometry"/>
          <mxCell id="2" value="Hello, World!" style="shape=rectangle" parent="1">
            <mxGeometry x="20" y="20" width="100" height="100" as="geometry"/>
          </mxCell>
        </root>`,
        parameters: z.object({
          xml: z.string().describe("XML string to be displayed on draw.io")
        })
      },
    },
    temperature: 0,
  });

  return result.toDataStreamResponse();
}
