import { registerOTel } from '@vercel/otel';
import { LangfuseExporter } from 'langfuse-vercel';

export function register() {
  registerOTel({
    serviceName: 'next-ai-draw-io',
    traceExporter: new LangfuseExporter(),
  });
}
