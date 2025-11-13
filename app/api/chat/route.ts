import { bedrock } from '@ai-sdk/amazon-bedrock';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { smoothStream, streamText, convertToModelMessages } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

import { z } from "zod/v3";
import { replaceXMLParts } from "@/lib/utils";

export const maxDuration = 60
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

export async function POST(req: Request) {
  try {
    const { messages, xml } = await req.json();

    const systemMessage = `
You are an expert diagram creation assistant specializing in draw.io XML generation.
Your primary function is crafting clear, well-organized visual diagrams through precise XML specifications.
You can see the image that user uploaded.
Note that when you need to generate diagram about aws architecture, use **AWS 2025 icons**.

You utilize the following tools:
---Tool1---
tool name: display_diagram
description: Display a NEW diagram on draw.io. Use this when creating a diagram from scratch or when major structural changes are needed.
parameters: {
  xml: string
}
---Tool2---
tool name: edit_diagram
description: Edit specific parts of the EXISTING diagram. Use this when making small targeted changes like adding/removing elements, changing labels, or adjusting properties. This is more efficient than regenerating the entire diagram.
parameters: {
  edits: Array<{search: string, replace: string}>
}
---End of tools---

IMPORTANT: Choose the right tool:
- Use display_diagram for: Creating new diagrams, major restructuring, or when the current diagram XML is empty
- Use edit_diagram for: Small modifications, adding/removing elements, changing text/colors, repositioning items

Core capabilities:
- Generate valid, well-formed XML strings for draw.io diagrams
- Create professional flowcharts, mind maps, entity diagrams, and technical illustrations
- Convert user descriptions into visually appealing diagrams using basic shapes and connectors
- Apply proper spacing, alignment and visual hierarchy in diagram layouts
- Adapt artistic concepts into abstract diagram representations using available shapes
- Optimize element positioning to prevent overlapping and maintain readability
- Structure complex systems into clear, organized visual components

Layout constraints:
- CRITICAL: Keep all diagram elements within a single page viewport to avoid page breaks
- Position all elements with x coordinates between 0-800 and y coordinates between 0-600
- Maximum width for containers (like AWS cloud boxes): 700 pixels
- Maximum height for containers: 550 pixels
- Use compact, efficient layouts that fit the entire diagram in one view
- Start positioning from reasonable margins (e.g., x=40, y=40) and keep elements grouped closely
- For large diagrams with many elements, use vertical stacking or grid layouts that stay within bounds
- Avoid spreading elements too far apart horizontally - users should see the complete diagram without a page break line

Note that:
- Focus on producing clean, professional diagrams that effectively communicate the intended information through thoughtful layout and design choices.
- When artistic drawings are requested, creatively compose them using standard diagram shapes and connectors while maintaining visual clarity.
- Return XML only via tool calls, never in text responses.
- If user asks you to replicate a diagram based on an image, remember to match the diagram style and layout as closely as possible. Especially, pay attention to the lines and shapes, for example, if the lines are straight or curved, and if the shapes are rounded or square.
- Note that when you need to generate diagram about aws architecture, use **AWS 2025 icons**.

When using edit_diagram tool:
- Keep edits minimal - only include the specific line being changed plus 1-2 context lines
- Example GOOD edit: {"search": "  <mxCell id=\"2\" value=\"Old Text\">", "replace": "  <mxCell id=\"2\" value=\"New Text\">"}
- Example BAD edit: Including 10+ unchanged lines just to change one attribute
- For multiple changes, use separate edits: [{"search": "line1", "replace": "new1"}, {"search": "line2", "replace": "new2"}]
- RETRY POLICY: If edit_diagram fails because the search pattern cannot be found:
  * You may retry edit_diagram up to 3 times with adjusted search patterns
  * After 3 failed attempts, you MUST fall back to using display_diagram to regenerate the entire diagram
  * The error message will indicate how many retries remain
`;

    const lastMessage = messages[messages.length - 1];

    // Extract text from the last message parts
    const lastMessageText = lastMessage.parts?.find((part: any) => part.type === 'text')?.text || '';

    // Extract file parts (images) from the last message
    const fileParts = lastMessage.parts?.filter((part: any) => part.type === 'file') || [];

    const formattedTextContent = `
Current diagram XML:
"""xml
${xml || ''}
"""
User input:
"""md
${lastMessageText}
"""`;

    // Convert UIMessages to ModelMessages and add system message
    const modelMessages = convertToModelMessages(messages);
    let enhancedMessages = [...modelMessages];

    // Update the last message with formatted content if it's a user message
    if (enhancedMessages.length >= 1) {
      const lastModelMessage = enhancedMessages[enhancedMessages.length - 1];
      if (lastModelMessage.role === 'user') {
        // Build content array with text and file parts
        const contentParts: any[] = [
          { type: 'text', text: formattedTextContent }
        ];

        // Add image parts back
        for (const filePart of fileParts) {
          contentParts.push({
            type: 'image',
            image: filePart.url,
            mimeType: filePart.mediaType
          });
        }

        enhancedMessages = [
          ...enhancedMessages.slice(0, -1),
          { ...lastModelMessage, content: contentParts }
        ];
      }
    }

    console.log("Enhanced messages:", enhancedMessages);

    const result = streamText({
      // model: google("gemini-2.5-flash-preview-05-20"),
      // model: google("gemini-2.5-pro"),
      // model: bedrock('anthropic.claude-sonnet-4-20250514-v1:0'),
      system: systemMessage,
      model: bedrock('global.anthropic.claude-sonnet-4-5-20250929-v1:0'),
      // model: openrouter('moonshotai/kimi-k2:free'),
      // model: model,
      // providerOptions: {
      //   google: {
      //     thinkingConfig: {
      //       thinkingBudget: 128,
      //     },
      //   }
      // },
      // providerOptions: {
      //   openai: {
      //     reasoningEffort: "minimal"
      //   },
      // },
      providerOptions: {
        anthropic: {
          additionalModelRequestFields: {
            anthropic_beta: ['fine-grained-tool-streaming-2025-05-14']
          }
        }
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
          </root>
          - Note that when you need to generate diagram about aws architecture, use **AWS 2025 icons**.
          `,
          inputSchema: z.object({
            xml: z.string().describe("XML string to be displayed on draw.io")
          })
        },
        edit_diagram: {
          description: `Edit specific parts of the current diagram by replacing exact line matches. Use this tool to make targeted fixes without regenerating the entire XML.
IMPORTANT: Keep edits concise:
- Only include the lines that are changing, plus 1-2 surrounding lines for context if needed
- Break large changes into multiple smaller edits
- Each search must contain complete lines (never truncate mid-line)
- First match only - be specific enough to target the right element`,
          inputSchema: z.object({
            edits: z.array(z.object({
              search: z.string().describe("Exact lines to search for (including whitespace and indentation)"),
              replace: z.string().describe("Replacement lines")
            })).describe("Array of search/replace pairs to apply sequentially")
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
  } catch (error) {
    console.error('Error in chat route:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
