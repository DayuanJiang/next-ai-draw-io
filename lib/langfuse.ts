import { observe, updateActiveTrace } from '@langfuse/tracing';
import { LangfuseClient } from '@langfuse/client';
import * as api from '@opentelemetry/api';

// Singleton LangfuseClient instance for direct API calls
let langfuseClient: LangfuseClient | null = null;

export function getLangfuseClient(): LangfuseClient | null {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return null;
  }

  if (!langfuseClient) {
    langfuseClient = new LangfuseClient({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASEURL,
    });
  }

  return langfuseClient;
}

// Check if Langfuse is configured
export function isLangfuseEnabled(): boolean {
  return !!process.env.LANGFUSE_PUBLIC_KEY;
}

// Update trace with input data at the start of request
export function setTraceInput(params: {
  input: string;
  sessionId?: string;
  userId?: string;
}) {
  if (!isLangfuseEnabled()) return;

  updateActiveTrace({
    name: 'chat',
    input: params.input,
    sessionId: params.sessionId,
    userId: params.userId,
  });
}

// Update trace with output and end the span
export function setTraceOutput(output: string) {
  if (!isLangfuseEnabled()) return;

  updateActiveTrace({ output });
  const activeSpan = api.trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.end();
  }
}

// Get telemetry config for streamText
export function getTelemetryConfig(params: {
  sessionId?: string;
  userId?: string;
}) {
  if (!isLangfuseEnabled()) return undefined;

  return {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    metadata: {
      sessionId: params.sessionId,
      userId: params.userId,
    },
  };
}

// Wrap a handler with Langfuse observe
export function wrapWithObserve<T>(
  handler: (req: Request) => Promise<T>
): (req: Request) => Promise<T> {
  if (!isLangfuseEnabled()) {
    return handler;
  }

  return observe(handler, { name: 'chat', endOnExit: false });
}
