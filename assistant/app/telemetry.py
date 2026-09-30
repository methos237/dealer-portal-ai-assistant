"""OpenTelemetry for the assistant.

Exporter by environment: OTEL_EXPORTER_OTLP_ENDPOINT -> OTLP http/protobuf (Jaeger in compose);
APPLICATIONINSIGHTS_CONNECTION_STRING -> Azure Monitor; neither -> tracing stays a no-op.
W3C trace context comes in from the web proxy and goes out to the api's /mcp on every httpx request.
"""

import os

from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
from opentelemetry.propagate import inject
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

tracer = trace.get_tracer("assistant")


def configure(app) -> TracerProvider | None:
    """Tracer provider with the exporters the environment asks for; instruments FastAPI, psycopg."""
    otlp = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    app_insights = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if not otlp and not app_insights:
        return None
    provider = TracerProvider(resource=Resource.create({"service.name": "assistant"}))
    if otlp:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    if app_insights:
        from azure.monitor.opentelemetry.exporter import AzureMonitorTraceExporter

        provider.add_span_processor(
            BatchSpanProcessor(AzureMonitorTraceExporter(connection_string=app_insights))
        )
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="health")
    PsycopgInstrumentor().instrument(skip_dep_check=True)
    return provider


async def inject_trace_context(request) -> None:
    """httpx request hook: carry the current span into the api's /mcp calls."""
    inject(request.headers)
