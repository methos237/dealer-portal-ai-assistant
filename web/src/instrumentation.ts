/**
 * OpenTelemetry for the Next.js server: request spans, server-side fetch spans, and W3C trace context
 * forwarded to the api and the assistant so one trace covers browser request, retrieval, Claude call,
 * /mcp tool call and Postgres query. Export target: OTEL_EXPORTER_OTLP_ENDPOINT (Jaeger in compose),
 * else APPLICATIONINSIGHTS_CONNECTION_STRING (Azure), else nothing (see lib/telemetry.ts).
 */
import { propagateTo, telemetryMode } from "@/lib/telemetry";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const mode = telemetryMode(process.env);
  if (mode === "off") return;
  const { registerOTel } = await import("@vercel/otel");
  const common = {
    serviceName: "web",
    instrumentationConfig: {
      fetch: {
        ignoreUrls: [/\/health$/],
        propagateContextUrls: propagateTo(process.env),
      },
    },
  };
  if (mode === "otlp") {
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
          connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
        }),
      ),
    ],
  });
}
