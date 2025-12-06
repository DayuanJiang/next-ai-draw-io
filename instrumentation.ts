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
        // Filter out Next.js HTTP request spans so AI SDK spans become root traces
        shouldExportSpan: ({ otelSpan }) => {
            const spanName = otelSpan.name
            // Skip Next.js HTTP infrastructure spans
            if (
                spanName.startsWith("POST /") ||
                spanName.startsWith("GET /") ||
                spanName.includes("BaseServer") ||
                spanName.includes("handleRequest")
            ) {
                return false
            }
            return true
        },
    })

    const tracerProvider = new NodeTracerProvider({
        spanProcessors: [langfuseSpanProcessor],
    })

    // Register globally so AI SDK's telemetry also uses this processor
    tracerProvider.register()
}
