"""OpenTelemetry for the assistant.

OTEL_EXPORTER_OTLP_ENDPOINT -> OTLP http/protobuf (Jaeger in compose, the collector on Azure);
unset -> tracing stays a no-op.
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
    """OTLP-exporting tracer provider when an endpoint is set; instruments FastAPI and psycopg."""
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return None
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

    provider = TracerProvider(resource=Resource.create({"service.name": "assistant"}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="health")
    PsycopgInstrumentor().instrument(skip_dep_check=True)
    return provider


async def inject_trace_context(request) -> None:
    """httpx request hook: carry the current span into the api's /mcp calls."""
    inject(request.headers)
