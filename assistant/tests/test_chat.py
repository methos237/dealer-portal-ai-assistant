import json
import os
from pathlib import Path

from app.chat import build_request, sse, stream_answer
from rag.retrieval import Hit
from tests.fakes import FakeAnthropic, citation, text, text_start

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
    # invariants the snapshot could silently drift on
    assert request["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert request["thinking"] == {"type": "adaptive"}
    docs = request["messages"][-1]["content"][:-1]
    assert all(d["type"] == "document" and d["citations"] == {"enabled": True} for d in docs)
    assert docs[0]["title"] == "Aria Owners Manual (2024) — Hitching"
    assert docs[1]["title"] == "SB-2026-03"


def test_stream_answer_emits_text_citation_and_done_with_usage() -> None:
    client = FakeAnthropic(
        [
            text_start(),
            text("Tongue weight is "),
            citation("Tongue weight is 12 percent.", 0, "Aria"),
            text("12 percent."),
        ],
        usage={"input_tokens": 1500, "output_tokens": 40, "cache_read_input_tokens": 1400},
    )
    events = list(stream_answer(client, build_request([], "q", HITS), HITS))

    kinds = [e for e, _ in events]
    assert kinds == ["text", "citation", "text", "done"]
    assert events[1][1]["source"]["chunk_id"] == 1
    assert events[1][1]["source"]["path"] == "owner-manual-aria.md"
    done = events[-1][1]
    assert done["stop_reason"] == "end_turn"
    assert done["usage"]["cache_read_input_tokens"] == 1400
    assert done["content"][0]["text"] == "Tongue weight is 12 percent."
    assert len(done["content"][0]["citations"]) == 1


def test_refusal_and_max_tokens_surface_in_done() -> None:
    for reason in ("refusal", "max_tokens"):
        client = FakeAnthropic([text_start(), text("partial")], stop_reason=reason)
        _, done = list(stream_answer(client, build_request([], "q", HITS), HITS))[-1]
        assert done["stop_reason"] == reason


def test_sse_framing() -> None:
    assert sse("text", {"text": "hi"}) == 'event: text\ndata: {"text": "hi"}\n\n'
