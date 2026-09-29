"""Spans the assistant emits: one per Claude call with gen_ai usage; no-op without exporters."""

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app import telemetry
from app.agent import build_request, run_turn
from tests.fakes import FakeAsyncAnthropic, Turn, text, text_start, usage

exporter = InMemorySpanExporter()


@pytest.fixture(autouse=True, scope="module")
def provider():
    p = TracerProvider()
    p.add_span_processor(SimpleSpanProcessor(exporter))
    telemetry.tracer = p.get_tracer("assistant-test")
    import app.agent as agent

    agent.tracer = telemetry.tracer
    yield p


def test_configure_is_a_no_op_without_exporters(monkeypatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("APPLICATIONINSIGHTS_CONNECTION_STRING", raising=False)
    assert telemetry.configure(object()) is None


@pytest.mark.anyio
async def test_each_claude_call_gets_a_span_with_usage_and_stop_reason() -> None:
    exporter.clear()
    client = FakeAsyncAnthropic(
        [
            Turn(
                [text_start(), text("hi")],
                usage_=usage(input_tokens=1500, output_tokens=40, cache_read_input_tokens=1400),
            )
        ]
    )
    request = build_request([], "hello", [])
    async for _ in run_turn(client, request, [], []):
        pass
    spans = [s for s in exporter.get_finished_spans() if s.name == "claude.messages"]
    assert len(spans) == 1
    a = spans[0].attributes
    assert a["gen_ai.request.model"] == request["model"]
    assert a["gen_ai.usage.input_tokens"] == 1500
    assert a["gen_ai.usage.cache_read_input_tokens"] == 1400
    assert a["gen_ai.response.finish_reasons"] == ("end_turn",)
