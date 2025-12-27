import { LangfuseSpanProcessor } from "@langfuse/otel"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"

export function register() {
    // Skip telemetry if Langfuse env vars are not configured
    if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
        console.warn(
            "[Langfuse] Environment variables not configured - telemetry disabled",
        )
        return
    }

    const langfuseSpanProcessor = new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASEURL,
        // Whitelist approach: only export AI-related spans
        shouldExportSpan: ({ otelSpan }) => {
            const spanName = otelSpan.name
            // Only export AI SDK spans (ai.*) and our explicit "chat" wrapper
            if (spanName === "chat" || spanName.startsWith("ai.")) {
                return true
            }
            return false
        },
    })

    const tracerProvider = new NodeTracerProvider({
        spanProcessors: [langfuseSpanProcessor],
    })

    // Register globally so AI SDK's telemetry also uses this processor
    tracerProvider.register()
    console.log("[Langfuse] Instrumentation initialized successfully")
}
