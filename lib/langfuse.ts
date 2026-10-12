import { LangfuseClient } from "@langfuse/client"
import { observe, updateActiveTrace } from "@langfuse/tracing"
import * as api from "@opentelemetry/api"
import type { TelemetrySettings } from "ai"
import { randomUUID } from "crypto"

// Singleton LangfuseClient instance for direct API calls
let langfuseClient: LangfuseClient | null = null

type IngestionBatch = Parameters<
    LangfuseClient["api"]["ingestion"]["batch"]
>[0]["batch"]

// Attach a score to the session's most recent chat trace. When the session
// has no trace yet, a fallbackTrace creates a standalone trace to carry the
// score; without one the score is skipped. Returns whether a score was written.
export async function scoreLatestTrace(
    langfuse: LangfuseClient,
    opts: {
        sessionId: string
        name: string
        value: number
        comment: string
        fallbackTrace?: {
            name: string
            userId: string
            input: unknown
            metadata: Record<string, unknown>
        }
    },
): Promise<boolean> {
    const { sessionId, name, value, comment, fallbackTrace } = opts
    const traces = await langfuse.api.trace.list({ sessionId, limit: 1 })
    let traceId = traces.data?.[0]?.id
    const timestamp = new Date().toISOString()
    const batch: IngestionBatch = []

    if (!traceId) {
        if (!fallbackTrace) return false
        traceId = randomUUID()
        batch.push({
            type: "trace-create",
            id: randomUUID(),
            timestamp,
            body: { id: traceId, sessionId, ...fallbackTrace, timestamp },
        })
    }
    batch.push({
        type: "score-create",
        id: randomUUID(),
        timestamp,
        body: { id: randomUUID(), traceId, name, value, comment },
    })
    await langfuse.api.ingestion.batch({ batch })
    return true
}

export function getLangfuseClient(): LangfuseClient | null {
    if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
        return null
    }

    if (!langfuseClient) {
        langfuseClient = new LangfuseClient({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            secretKey: process.env.LANGFUSE_SECRET_KEY,
            baseUrl: process.env.LANGFUSE_BASEURL,
        })
    }

    return langfuseClient
}

// Check if Langfuse is configured (both keys required)
function isLangfuseEnabled(): boolean {
    return !!(
        process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
    )
}

// Update trace with input data at the start of request
export function setTraceInput(params: {
    input: string
    sessionId?: string
    userId?: string
}) {
    if (!isLangfuseEnabled()) return

    updateActiveTrace({
        name: "chat",
        input: params.input,
        sessionId: params.sessionId,
        userId: params.userId,
    })
}

// Update trace with output and end the span
// Note: AI SDK 6 telemetry automatically reports token usage on its spans,
// so we only need to set the output text and close our wrapper span
export function setTraceOutput(output: string) {
    if (!isLangfuseEnabled()) return

    updateActiveTrace({ output })
    endTrace()
}

// End the observe() wrapper span (AI SDK creates its own child spans with usage).
// It uses endOnExit: false, so every request path has to end it, or the trace
// is never exported: stream finish, stream error/abort, and early returns.
export function endTrace() {
    if (!isLangfuseEnabled()) return

    const activeSpan = api.trace.getActiveSpan()
    if (activeSpan) {
        activeSpan.end()
    }
}

// Telemetry settings for streamText and generateText
export function getTelemetryConfig(params: {
    sessionId?: string
    userId?: string
    /** Names the trace of a model call outside the chat's observe() span */
    functionId?: string
}): TelemetrySettings | undefined {
    if (!isLangfuseEnabled()) return undefined

    return {
        isEnabled: true,
        functionId: params.functionId,
        recordInputs: true,
        recordOutputs: true,
        metadata: {
            ...(params.sessionId && { sessionId: params.sessionId }),
            ...(params.userId && { userId: params.userId }),
        },
    }
}

// Wrap a handler with Langfuse observe
export function wrapWithObserve<T>(
    handler: (req: Request) => Promise<T>,
): (req: Request) => Promise<T> {
    if (!isLangfuseEnabled()) {
        return handler
    }

    return observe(handler, { name: "chat", endOnExit: false })
}
