/** Trace export choice for the web server. Pure: no Next imports, unit tested. */

export type TelemetryMode = "otlp" | "azure" | "off";

/** OTLP endpoint (Jaeger locally) wins; Application Insights on Azure; nothing otherwise. */
export function telemetryMode(
  env: Record<string, string | undefined>,
): TelemetryMode {
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) return "otlp";
  if (env.APPLICATIONINSIGHTS_CONNECTION_STRING) return "azure";
  return "off";
}

/** Origins that receive W3C trace context on server-side fetches: the api and the assistant. */
export function propagateTo(env: Record<string, string | undefined>): string[] {
  return [
    env.PORTAL_API_URL ?? "http://localhost:5080",
    env.ASSISTANT_URL ?? "http://localhost:8000",
  ];
}
