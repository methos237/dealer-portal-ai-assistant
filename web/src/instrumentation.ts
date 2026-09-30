/**
 * OpenTelemetry for the Next.js server: request spans, server-side fetch spans, and W3C trace context
 * forwarded to the api and the assistant so one trace covers browser request, retrieval, Claude call,
 * /mcp tool call and Postgres query. Export target: OTEL_EXPORTER_OTLP_ENDPOINT (Jaeger in compose),
 * else APPLICATIONINSIGHTS_CONNECTION_STRING (Azure), else nothing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const env = process.env;
  if (
    !env.OTEL_EXPORTER_OTLP_ENDPOINT &&
    !env.APPLICATIONINSIGHTS_CONNECTION_STRING
  )
    return;
  const { registerOTel } = await import("@vercel/otel");
  const common = {
    serviceName: "web",
    instrumentationConfig: {
      fetch: {
        ignoreUrls: [/\/health$/],
        propagateContextUrls: [
          env.PORTAL_API_URL ?? "http://localhost:5080",
          env.ASSISTANT_URL ?? "http://localhost:8000",
        ],
      },
    },
  };
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    registerOTel({ ...common, traceExporter: "auto" });
    return;
  }
  const [{ AzureMonitorTraceExporter }, { BatchSpanProcessor }] =
    await Promise.all([
      import("@azure/monitor-opentelemetry-exporter"),
      import("@opentelemetry/sdk-trace-base"),
    ]);
  registerOTel({
    ...common,
    spanProcessors: [
      new BatchSpanProcessor(
        new AzureMonitorTraceExporter({
          connectionString: env.APPLICATIONINSIGHTS_CONNECTION_STRING,
        }),
      ),
    ],
  });
}
