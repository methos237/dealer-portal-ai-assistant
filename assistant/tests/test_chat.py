import json
import os
from pathlib import Path
from types import SimpleNamespace as NS

import pytest

from app.agent import _strict, build_request, run_turn
from app.chat import sse
from rag.retrieval import Hit
from tests.fakes import (
    FakeAsyncAnthropic,
    Turn,
    citation,
    draft_result,
    error_result,
    text,
    text_start,
    usage,
)

SNAPSHOT = Path(__file__).parent / "snapshots" / "chat_request.json"

HITS = [
    Hit(
        1,
        1,
        "Aria Owners Manual (2024)",
        "owner-manual-aria.md",
        4,
        "Tongue weight is 12 percent.",
        {"section": "Hitching"},
        0.03,
    ),
    Hit(
        2,
        4,
        "SB-2026-03",
        "sb-2026-03-slide-out-seal.md",
        1,
        "Cure time is 24 hours.",
        {"section": ""},
        0.02,
    ),
]

DRAFT = {
    "kind": "claim",
    "method": "POST",
    "path": "/claims",
    "body": {"unitId": 1},
    "summary": "File a claim",
}


async def collect(client, hits=HITS):
    return [e async for e in run_turn(client, build_request([], "q", hits), [], hits)]


def test_request_builder_matches_snapshot() -> None:
    request = build_request(
        [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi"}],
        "What tongue weight does the Aria 28 need?",
        HITS,
    )
    rendered = json.dumps(request, indent=2, sort_keys=True) + "\n"
    if os.environ.get("UPDATE_SNAPSHOTS"):
        SNAPSHOT.write_text(rendered)
    assert rendered == SNAPSHOT.read_text()
    assert request["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert request["thinking"] == {"type": "adaptive"}
    docs = request["messages"][-1]["content"][:-1]
    assert all(d["type"] == "document" and d["citations"] == {"enabled": True} for d in docs)
    assert docs[0]["title"] == "Aria Owners Manual (2024) — Hitching"
    assert "Source: owner-manual-aria.md" in docs[0]["context"]


@pytest.mark.anyio
async def test_text_citation_and_done_with_usage() -> None:
    client = FakeAsyncAnthropic(
        [
            Turn(
                [
                    text_start(),
                    text("Tongue weight is "),
                    citation("Tongue weight is 12 percent.", 0, "Aria"),
                    text("12 percent."),
                ],
                usage_=usage(input_tokens=1500, output_tokens=40, cache_read_input_tokens=1400),
            )
        ]
    )
    events = await collect(client)
    assert [e for e, _ in events] == ["text", "citation", "text", "done"]
    assert events[1][1]["source"]["chunk_id"] == 1
    done = events[-1][1]
    assert done.stop_reason == "end_turn"
    assert done.usage["cache_read_input_tokens"] == 1400
    assert done.content[0]["text"] == "Tongue weight is 12 percent."
    assert len(done.content[0]["citations"]) == 1


@pytest.mark.anyio
async def test_tool_loop_emits_tool_and_confirm_then_final_text() -> None:
    use = NS(
        type="tool_use",
        id="tu1",
        name="draft_claim",
        input={"vin": "1THRA24X0RN000001", "amount": 500},
    )
    client = FakeAsyncAnthropic(
        [
            Turn(
                [text_start(), text("Checking.")],
                stop_reason="tool_use",
                tool_uses=[use],
                tool_results=[draft_result("tu1", DRAFT)],
            ),
            Turn([text_start(), text("Draft ready, please confirm.")]),
        ]
    )
    events = await collect(client)
    kinds = [e for e, _ in events]
    assert kinds == ["text", "tool", "confirm", "text", "done"]
    assert events[1][1] == {"name": "draft_claim", "input": use.input, "is_error": False}
    assert events[2][1] == DRAFT
    done = events[-1][1]
    assert done.drafts == [DRAFT] and done.tool_calls[0]["name"] == "draft_claim"
    assert done.usage["input_tokens"] == 2000  # summed over both turns


@pytest.mark.anyio
async def test_tool_error_is_reported_not_confirmed() -> None:
    use = NS(type="tool_use", id="tu1", name="approve_claim", input={"id": 1})
    client = FakeAsyncAnthropic(
        [
            Turn(
                [],
                stop_reason="tool_use",
                tool_uses=[use],
                tool_results=[error_result("tu1", "Forbidden")],
            ),
            Turn([text_start(), text("That is outside your permissions.")]),
        ]
    )
    events = await collect(client)
    kinds = [e for e, _ in events]
    assert kinds == ["tool", "text", "done"]
    assert events[0][1]["is_error"] is True


@pytest.mark.anyio
async def test_refusal_and_max_tokens_stop_without_running_tools() -> None:
    for reason in ("refusal", "max_tokens"):
        use = NS(type="tool_use", id="tu1", name="draft_claim", input={})
        client = FakeAsyncAnthropic(
            [
                Turn(
                    [text_start(), text("partial")],
                    stop_reason=reason,
                    tool_uses=[use],
                    tool_results=[draft_result("tu1", DRAFT)],
                )
            ]
        )
        events = await collect(client)
        assert [e for e, _ in events] == ["text", "done"]
        assert events[-1][1].stop_reason == reason
        assert events[-1][1].drafts == []


def test_strict_adds_additional_properties_false_recursively() -> None:
    schema = {
        "type": "object",
        "properties": {
            "lines": {
                "type": "array",
                "items": {"type": "object", "properties": {"sku": {"type": "string"}}},
            }
        },
    }
    out = _strict(schema)
    assert out["additionalProperties"] is False
    assert out["properties"]["lines"]["items"]["additionalProperties"] is False


def test_sse_framing() -> None:
    assert sse("text", {"text": "hi"}) == 'event: text\ndata: {"text": "hi"}\n\n'
