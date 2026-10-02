/**
 * OpenTelemetry for the Next.js server: request spans, server-side fetch spans, and W3C trace context
 * forwarded to the api and the assistant so one trace covers browser request, retrieval, Claude call,
 * /mcp tool call and Postgres query. Spans go to OTEL_EXPORTER_OTLP_ENDPOINT (Jaeger in compose, the
 * collector on Azure); unset means no exporter.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const env = process.env;
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const { registerOTel } = await import("@vercel/otel");
  registerOTel({
    serviceName: "web",
    traceExporter: "auto",
    instrumentationConfig: {
      fetch: {
        ignoreUrls: [/\/health$/],
        propagateContextUrls: [
          env.PORTAL_API_URL ?? "http://localhost:5080",
          env.ASSISTANT_URL ?? "http://localhost:8000",
        ],
      },
    },
  });
}
