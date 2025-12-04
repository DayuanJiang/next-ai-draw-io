import { LangfuseClient } from '@langfuse/client';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  // Check if Langfuse is configured
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return Response.json({ success: true, logged: false });
  }

  const { messageId, feedback, sessionId } = await req.json();

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

    // Find the most recent chat trace for this session to attach the score to
    const tracesResponse = await langfuse.api.trace.list({
      sessionId,
      limit: 1,
    });

    const traces = tracesResponse.data || [];
    const latestTrace = traces[0];

    if (!latestTrace) {
      // No trace found for this session - create a standalone feedback trace
      const traceId = randomUUID();
      const timestamp = new Date().toISOString();

      await langfuse.api.ingestion.batch({
        batch: [
          {
            type: 'trace-create',
            id: randomUUID(),
            timestamp,
            body: {
              id: traceId,
              name: 'user-feedback',
              sessionId,
              userId,
              input: { messageId, feedback },
              metadata: { source: 'feedback-button', note: 'standalone - no chat trace found' },
              timestamp,
            },
          },
          {
            type: 'score-create',
            id: randomUUID(),
            timestamp,
            body: {
              id: randomUUID(),
              traceId,
              name: 'user-feedback',
              value: feedback === 'good' ? 1 : 0,
              comment: `User gave ${feedback} feedback`,
            },
          },
        ],
      });
    } else {
      // Attach score to the existing chat trace
      const timestamp = new Date().toISOString();

      await langfuse.api.ingestion.batch({
        batch: [
          {
            type: 'score-create',
            id: randomUUID(),
            timestamp,
            body: {
              id: randomUUID(),
              traceId: latestTrace.id,
              name: 'user-feedback',
              value: feedback === 'good' ? 1 : 0,
              comment: `User gave ${feedback} feedback`,
            },
          },
        ],
      });
    }

    return Response.json({ success: true, logged: true });
  } catch (error) {
    console.error('Langfuse feedback error:', error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
