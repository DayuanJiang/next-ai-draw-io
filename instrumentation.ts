import { LangfuseSpanProcessor } from "@langfuse/otel"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"

export async function register() {
    // Overlay admin settings file onto process.env before anything reads config
    if (process.env.NEXT_RUNTIME === "nodejs") {
        try {
            const { applyToEnv } = await import("@/lib/admin/settings")
            applyToEnv()
        } catch (err) {
            console.error("[admin-settings] Failed to apply settings:", err)
        }
    }

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
