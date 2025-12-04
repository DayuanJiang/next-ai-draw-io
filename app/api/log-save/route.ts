import { LangfuseClient } from '@langfuse/client';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  // Check if Langfuse is configured
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return Response.json({ success: true, logged: false });
  }

  const { xml, filename, format, sessionId } = await req.json();

  // Get user IP for tracking
  const forwardedFor = req.headers.get('x-forwarded-for');
  const userId = forwardedFor?.split(',')[0]?.trim() || 'anonymous';

  try {
    // Create Langfuse client
    const langfuse = new LangfuseClient({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASEURL,
    });

    const timestamp = new Date().toISOString();

    // Find the most recent chat trace for this session to attach the save event to
    const tracesResponse = await langfuse.api.trace.list({
      sessionId,
      limit: 1,
    });

    const traces = tracesResponse.data || [];
    const latestTrace = traces[0];

    if (latestTrace) {
      // Create a span on the existing chat trace for the save event
      await langfuse.api.ingestion.batch({
        batch: [
          {
            type: 'span-create',
            id: randomUUID(),
            timestamp,
            body: {
              id: randomUUID(),
              traceId: latestTrace.id,
              name: 'diagram-save',
              input: { filename, format },
              output: { xmlPreview: xml?.substring(0, 500), contentLength: xml?.length || 0 },
              metadata: { source: 'save-button' },
              startTime: timestamp,
              endTime: timestamp,
            },
          },
        ],
      });
    } else {
      // No trace found - create a standalone trace
      const traceId = randomUUID();

      await langfuse.api.ingestion.batch({
        batch: [
          {
            type: 'trace-create',
            id: randomUUID(),
            timestamp,
            body: {
              id: traceId,
              name: 'diagram-save',
              sessionId,
              userId,
              input: { filename, format },
              output: { xmlPreview: xml?.substring(0, 500), contentLength: xml?.length || 0 },
              metadata: { source: 'save-button', note: 'standalone - no chat trace found' },
              timestamp,
            },
          },
        ],
      });
    }

    return Response.json({ success: true, logged: true });
  } catch (error) {
    console.error('Langfuse save error:', error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
