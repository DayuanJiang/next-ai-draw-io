import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { getAIModel } from '@/lib/ai-providers';
import { findCachedResponse } from '@/lib/cached-responses';
import { z } from "zod";

export const maxDuration = 300;

// Helper function to check if diagram is minimal/empty
function isMinimalDiagram(xml: string): boolean {
  const stripped = xml.replace(/\s/g, '');
  return !stripped.includes('id="2"');
}

// Helper function to create cached stream response
function createCachedStreamResponse(xml: string): Response {
  const toolCallId = `cached-${Date.now()}`;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'tool-input-start', toolCallId, toolName: 'display_diagram' });
      writer.write({ type: 'tool-input-delta', toolCallId, inputTextDelta: xml });
      writer.write({ type: 'tool-input-available', toolCallId, toolName: 'display_diagram', input: { xml } });
      writer.write({ type: 'finish' });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  try {
    const { messages, xml } = await req.json();

    // === CACHE CHECK START ===
    const isFirstMessage = messages.length === 1;
    const isEmptyDiagram = !xml || xml.trim() === '' || isMinimalDiagram(xml);

    if (isFirstMessage && isEmptyDiagram) {
      const lastMessage = messages[0];
      const textPart = lastMessage.parts?.find((p: any) => p.type === 'text');
      const filePart = lastMessage.parts?.find((p: any) => p.type === 'file');

      const cached = findCachedResponse(textPart?.text || '', !!filePart);

      if (cached) {
        console.log('[Cache] Returning cached response for:', textPart?.text);
        return createCachedStreamResponse(cached.xml);
      }
    }
    // === CACHE CHECK END ===

    const systemMessage = `
You are an expert diagram creation assistant specializing in draw.io XML generation.
Your primary function is chat with user and crafting clear, well-organized visual diagrams through precise XML specifications.
You can see the image that user uploaded.

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
- Use proper tool calls to generate or edit diagrams;
  - never return raw XML in text responses,
  - never use display_diagram to generate messages that you want to send user directly. e.g. to generate a "hello" text box when you want to greet user.
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

## Draw.io XML Structure Reference

Basic structure:
\`\`\`xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- All other cells go here as siblings -->
  </root>
</mxGraphModel>
\`\`\`

CRITICAL RULES:
1. Always include the two root cells: <mxCell id="0"/> and <mxCell id="1" parent="0"/>
2. ALL mxCell elements must be DIRECT children of <root> - NEVER nest mxCell inside another mxCell
3. Use unique sequential IDs for all cells (start from "2" for user content)
4. Set parent="1" for top-level shapes, or parent="<container-id>" for grouped elements

Shape (vertex) example:
\`\`\`xml
<mxCell id="2" value="Label" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>
\`\`\`

Connector (edge) example:
\`\`\`xml
<mxCell id="3" style="endArrow=classic;html=1;" edge="1" parent="1" source="2" target="4">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
\`\`\`

Common styles:
- Shapes: rounded=1 (rounded corners), fillColor=#hex, strokeColor=#hex
- Edges: endArrow=classic/block/open/none, startArrow=none/classic, curved=1, edgeStyle=orthogonalEdgeStyle
- Text: fontSize=14, fontStyle=1 (bold), align=center/left/right
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

    // Log messages with empty content for debugging (helps identify root cause)
    const emptyMessages = modelMessages.filter((msg: any) =>
      !msg.content || !Array.isArray(msg.content) || msg.content.length === 0
    );
    if (emptyMessages.length > 0) {
      console.warn('[Chat API] Messages with empty content detected:',
        JSON.stringify(emptyMessages.map((m: any) => ({ role: m.role, contentLength: m.content?.length })))
      );
      console.warn('[Chat API] Original UI messages structure:',
        JSON.stringify(messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          partsCount: m.parts?.length,
          partTypes: m.parts?.map((p: any) => p.type)
        })))
      );
    }

    // Filter out messages with empty content arrays (Bedrock API rejects these)
    // This is a safety measure - ideally convertToModelMessages should handle all cases
    let enhancedMessages = modelMessages.filter((msg: any) =>
      msg.content && Array.isArray(msg.content) && msg.content.length > 0
    );

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

    // Add cache point to the last assistant message in conversation history
    // This caches the entire conversation prefix for subsequent requests
    // Strategy: system (cached) + history with last assistant (cached) + new user message
    if (enhancedMessages.length >= 2) {
      // Find the last assistant message (should be second-to-last, before current user message)
      for (let i = enhancedMessages.length - 2; i >= 0; i--) {
        if (enhancedMessages[i].role === 'assistant') {
          enhancedMessages[i] = {
            ...enhancedMessages[i],
            providerOptions: {
              bedrock: { cachePoint: { type: 'default' } },
            },
          };
          break; // Only cache the last assistant message
        }
      }
    }

    // Get AI model from environment configuration
    const { model, providerOptions, headers } = getAIModel();

    // System message with cache point for Bedrock (requires 1024+ tokens)
    const systemMessageWithCache = {
      role: 'system' as const,
      content: systemMessage,
      providerOptions: {
        bedrock: { cachePoint: { type: 'default' } },
      },
    };

    const result = streamText({
      model,
      messages: [systemMessageWithCache, ...enhancedMessages],
      ...(providerOptions && { providerOptions }),
      ...(headers && { headers }),
      onFinish: ({ usage, providerMetadata }) => {
        console.log('[Cache] Usage:', JSON.stringify({
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          cachedInputTokens: usage?.cachedInputTokens,
        }, null, 2));
        console.log('[Cache] Provider metadata:', JSON.stringify(providerMetadata, null, 2));
      },
      tools: {
        // Client-side tool that will be executed on the client
        display_diagram: {
          description: `Display a diagram on draw.io. Pass the XML content inside <root> tags.

VALIDATION RULES (XML will be rejected if violated):
1. All mxCell elements must be DIRECT children of <root> - never nested
2. Every mxCell needs a unique id
3. Every mxCell (except id="0") needs a valid parent attribute
4. Edge source/target must reference existing cell IDs
5. Escape special chars in values: &lt; &gt; &amp; &quot;
6. Always start with: <mxCell id="0"/><mxCell id="1" parent="0"/>

Example with swimlanes and edges (note: all mxCells are siblings):
<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <mxCell id="lane1" value="Frontend" style="swimlane;" vertex="1" parent="1">
    <mxGeometry x="40" y="40" width="200" height="200" as="geometry"/>
  </mxCell>
  <mxCell id="step1" value="Step 1" style="rounded=1;" vertex="1" parent="lane1">
    <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
  </mxCell>
  <mxCell id="lane2" value="Backend" style="swimlane;" vertex="1" parent="1">
    <mxGeometry x="280" y="40" width="200" height="200" as="geometry"/>
  </mxCell>
  <mxCell id="step2" value="Step 2" style="rounded=1;" vertex="1" parent="lane2">
    <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
  </mxCell>
  <mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;endArrow=classic;" edge="1" parent="1" source="step1" target="step2">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>
</root>

Notes:
- For AWS diagrams, use **AWS 2025 icons**.
- For animated connectors, add "flowAnimation=1" to edge style.
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

      const errorString = typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : JSON.stringify(error);

      // Check for image not supported error (e.g., DeepSeek models)
      if (errorString.includes('image_url') ||
          errorString.includes('unknown variant') ||
          (errorString.includes('image') && errorString.includes('not supported'))) {
        return 'This model does not support image inputs. Please remove the image and try again, or switch to a vision-capable model.';
      }

      return errorString;
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
