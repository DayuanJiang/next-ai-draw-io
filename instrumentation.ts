export function register() {
    // Skip on edge/worker runtime (Cloudflare Workers, Vercel Edge)
    // OpenTelemetry Node SDK requires Node.js-specific APIs
    if (
        typeof process === "undefined" ||
        !process.versions?.node ||
        // @ts-expect-error - EdgeRuntime is a global in edge environments
        typeof EdgeRuntime !== "undefined"
    ) {
        return
    }

    // Skip telemetry if Langfuse env vars are not configured
    if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
        console.warn(
            "[Langfuse] Environment variables not configured - telemetry disabled",
        )
        return
    }

    // Dynamic imports to avoid bundling Node.js-specific modules in edge builds
    const { LangfuseSpanProcessor } = require("@langfuse/otel")
    const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node")

    const langfuseSpanProcessor = new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASEURL,
        // Filter out Next.js HTTP request spans so AI SDK spans become root traces
        shouldExportSpan: ({ otelSpan }: { otelSpan: { name: string } }) => {
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
