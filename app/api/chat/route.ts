import { bedrock } from '@ai-sdk/amazon-bedrock';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { smoothStream, streamText, convertToModelMessages } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

import { z } from "zod/v3";

export const maxDuration = 60
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
// Read the XML guide from file
export async function POST(req: Request) {
  const body = await req.json();

  const { messages, data = {} } = body;
  const guide = readFileSync(resolve('./app/api/chat/xml_guide.md'), 'utf8');

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
- Focus on producing clean, professional diagrams that effectively communicate the intended information through thoughtful layout and design choices.
- When artistic drawings are requested, creatively compose them using standard diagram shapes and connectors while maintaining visual clarity.
- **Don't** write out the XML string. Just return the XML string in the tool call.
- If user asks you to replicate a diagram based on an image, remember to match the diagram style and layout as closely as possible. Especially, pay attention to the lines and shapes, for example, if the lines are straight or curved, and if the shapes are rounded or square.

here is a guide for the XML format: ${guide}
`;

  const lastMessage = messages[messages.length - 1];

  // Extract text from the last message parts
  const lastMessageText = lastMessage.parts?.find((part: any) => part.type === 'text')?.text || '';

  const formattedContent = `
Current diagram XML:
"""xml
${data.xml || ''}
"""
User input:
"""md
${lastMessageText}
"""`;

  // Convert UIMessages to ModelMessages and add system message
  const modelMessages = convertToModelMessages(messages);
  let enhancedMessages = [{ role: "system" as const, content: systemMessage }, ...modelMessages];

  // Update the last message with formatted content if it's a user message
  if (enhancedMessages.length > 1) {
    const lastModelMessage = enhancedMessages[enhancedMessages.length - 1];
    if (lastModelMessage.role === 'user') {
      enhancedMessages = [
        ...enhancedMessages.slice(0, -1),
        { ...lastModelMessage, content: formattedContent }
      ];
    }
  }

  // console.log("Enhanced messages:", enhancedMessages);

  const result = streamText({
    // model: google("gemini-2.5-flash-preview-05-20"),
    // model: google("gemini-2.5-pro"),
    // model: bedrock('anthropic.claude-sonnet-4-20250514-v1:0'),
    model: openai.chat('gpt-5'),
    // model: openrouter('moonshotai/kimi-k2:free'),
    // model: model,
    // providerOptions: {
    //   google: {
    //     thinkingConfig: {
    //       thinkingBudget: 128,
    //     },
    //   }
    // },
    providerOptions: {
      openai: {
        reasoningEffort: "minimal"
      },
    },
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
        inputSchema: z.object({
          xml: z.string().describe("XML string to be displayed on draw.io")
        })
      },
    },
    temperature: 0,
  });

  // Error handler function to provide detailed error messages

  function errorHandler(error: unknown) {
    if (error == null) {
      return 'unknown error';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return JSON.stringify(error);
  }

  return result.toUIMessageStreamResponse({
    onError: errorHandler,
  });
}
