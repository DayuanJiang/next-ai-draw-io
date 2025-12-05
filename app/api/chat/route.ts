import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { getAIModel } from '@/lib/ai-providers';
import { findCachedResponse } from '@/lib/cached-responses';
import { getSystemPrompt } from '@/lib/system-prompts';
import { z } from "zod";

export const maxDuration = 300;

// File upload limits (must match client-side)
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_FILES = 5;

// Helper function to validate file parts in messages
function validateFileParts(messages: any[]): { valid: boolean; error?: string } {
  const lastMessage = messages[messages.length - 1];
  const fileParts = lastMessage?.parts?.filter((p: any) => p.type === 'file') || [];

  if (fileParts.length > MAX_FILES) {
    return { valid: false, error: `Too many files. Maximum ${MAX_FILES} allowed.` };
  }

  for (const filePart of fileParts) {
    // Data URLs format: data:image/png;base64,<data>
    // Base64 increases size by ~33%, so we check the decoded size
    if (filePart.url && filePart.url.startsWith('data:')) {
      const base64Data = filePart.url.split(',')[1];
      if (base64Data) {
        const sizeInBytes = Math.ceil((base64Data.length * 3) / 4);
        if (sizeInBytes > MAX_FILE_SIZE) {
          return { valid: false, error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.` };
        }
      }
    }
  }

  return { valid: true };
}

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

// Inner handler function
async function handleChatRequest(req: Request): Promise<Response> {
  const { messages, xml } = await req.json();

  // === FILE VALIDATION START ===
  const fileValidation = validateFileParts(messages);
  if (!fileValidation.valid) {
    return Response.json({ error: fileValidation.error }, { status: 400 });
  }
  // === FILE VALIDATION END ===

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

  // Get AI model from environment configuration
  const { model, providerOptions, headers, modelId } = getAIModel();

  // Get the appropriate system prompt based on model (extended for Opus/Haiku 4.5)
  const systemMessage = getSystemPrompt(modelId);

  const lastMessage = messages[messages.length - 1];

  // Extract text from the last message parts
  const lastMessageText = lastMessage.parts?.find((part: any) => part.type === 'text')?.text || '';

  // Extract file parts (images) from the last message
  const fileParts = lastMessage.parts?.filter((part: any) => part.type === 'file') || [];

  // User input only - XML is now in a separate cached system message
  const formattedUserInput = `User input:
"""md
${lastMessageText}
"""`;

  // Convert UIMessages to ModelMessages and add system message
  const modelMessages = convertToModelMessages(messages);

  // Filter out messages with empty content arrays (Bedrock API rejects these)
  // This is a safety measure - ideally convertToModelMessages should handle all cases
  let enhancedMessages = modelMessages.filter((msg: any) =>
    msg.content && Array.isArray(msg.content) && msg.content.length > 0
  );

  // Update the last message with user input only (XML moved to separate cached system message)
  if (enhancedMessages.length >= 1) {
    const lastModelMessage = enhancedMessages[enhancedMessages.length - 1];
    if (lastModelMessage.role === 'user') {
      // Build content array with user input text and file parts
      const contentParts: any[] = [
        { type: 'text', text: formattedUserInput }
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

  // System messages with multiple cache breakpoints for optimal caching:
  // - Breakpoint 1: Static instructions (~1500 tokens) - rarely changes
  // - Breakpoint 2: Current XML context - changes per diagram, but constant within a conversation turn
  // This allows: if only user message changes, both system caches are reused
  //              if XML changes, instruction cache is still reused
  const systemMessages = [
    // Cache breakpoint 1: Instructions (rarely change)
    {
      role: 'system' as const,
      content: systemMessage,
      providerOptions: {
        bedrock: { cachePoint: { type: 'default' } },
      },
    },
    // Cache breakpoint 2: Current diagram XML context
    {
      role: 'system' as const,
      content: `Current diagram XML:\n"""xml\n${xml || ''}\n"""\nWhen using edit_diagram, COPY search patterns exactly from this XML - attribute order matters!`,
      providerOptions: {
        bedrock: { cachePoint: { type: 'default' } },
      },
    },
  ];

  const allMessages = [...systemMessages, ...enhancedMessages];

  const result = streamText({
    model,
    messages: allMessages,
    ...(providerOptions && { providerOptions }),
    ...(headers && { headers }),
    onFinish: ({ usage, providerMetadata, finishReason, text, toolCalls }) => {
      // Detect potential mid-stream failures (e.g., Bedrock 503 ServiceUnavailableException)
      // When this happens, usage is empty and providerMetadata is undefined
      const hasUsage = usage && Object.keys(usage).length > 0;
      if (!hasUsage) {
        console.error('[Stream Error] Empty usage detected - possible Bedrock 503 or mid-stream failure');
        console.error('[Stream Error] finishReason:', finishReason);
        console.error('[Stream Error] text received:', text?.substring(0, 200) || '(none)');
        console.error('[Stream Error] toolCalls:', toolCalls?.length || 0);
        // Log the user's last message for debugging
        const lastUserMsg = enhancedMessages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
          const content = lastUserMsg.content;
          const preview = Array.isArray(content)
            ? (content.find((c) => c.type === 'text') as { type: 'text'; text: string } | undefined)?.text?.substring(0, 100)
            : String(content).substring(0, 100);
          console.error('[Stream Error] Last user message preview:', preview);
        }
      } else {
        console.log('[Cache] Full providerMetadata:', JSON.stringify(providerMetadata, null, 2));
        console.log('[Cache] Usage:', JSON.stringify(usage, null, 2));
      }
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
CRITICAL: Copy-paste the EXACT search pattern from the "Current diagram XML" in system context. Do NOT reorder attributes or reformat - the attribute order in draw.io XML varies and you MUST match it exactly.
IMPORTANT: Keep edits concise:
- COPY the exact mxCell line from the current XML (attribute order matters!)
- Only include the lines that are changing, plus 1-2 surrounding lines for context if needed
- Break large changes into multiple smaller edits
- Each search must contain complete lines (never truncate mid-line)
- First match only - be specific enough to target the right element`,
        inputSchema: z.object({
          edits: z.array(z.object({
            search: z.string().describe("EXACT lines copied from current XML (preserve attribute order!)"),
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

    // Check for Bedrock service errors (503, throttling, etc.)
    if (errorString.includes('ServiceUnavailable') ||
      errorString.includes('503') ||
      errorString.includes('temporarily unavailable')) {
      console.error('[Bedrock Error] ServiceUnavailableException:', errorString);
      return 'The AI service is temporarily unavailable. Please try again in a few seconds.';
    }

    // Check for throttling errors
    if (errorString.includes('ThrottlingException') ||
      errorString.includes('rate limit') ||
      errorString.includes('too many requests') ||
      errorString.includes('429')) {
      console.error('[Bedrock Error] ThrottlingException:', errorString);
      return 'Too many requests. Please wait a moment and try again.';
    }

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
}

export async function POST(req: Request) {
  try {
    return await handleChatRequest(req);
  } catch (error) {
    console.error('Error in chat route:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
