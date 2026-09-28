"""Real-model tests. The cassette test replays a recorded turn in CI; `live` tests need a key."""

import os
from pathlib import Path

import anthropic
import anyio
import pytest

from app.agent import build_request, run_turn
from rag.retrieval import Hit

CASSETTE = (
    Path(__file__).parent
    / "cassettes"
    / "test_chat_live"
    / "test_recorded_turn_cites_the_document.yaml"
)

HITS = [
    Hit(
        1,
        1,
        "Aria Owners Manual (2024)",
        "owner-manual-aria.md",
        4,
        "Aria Owners Manual (2024) — Hitching and towing\n\nTongue weight must be between 10 and 15"
        " percent of the loaded trailer weight. Use a 2-5/16 inch hitch ball rated for at least"
        " 10,000 pounds.",
        {"section": "Hitching and towing"},
        0.03,
    )
]

QUESTION = "What hitch ball size does the Aria need?"


async def collect(client, request):
    return [e async for e in run_turn(client, request, [], HITS)]


@pytest.fixture(scope="module")
def vcr_config():
    return {"filter_headers": ["x-api-key", "authorization"], "record_mode": "once"}


@pytest.mark.vcr
def test_recorded_turn_cites_the_document() -> None:
    if not CASSETTE.exists() and not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("no cassette recorded yet and no ANTHROPIC_API_KEY to record one")
    client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", "recorded"))
    events = anyio.run(collect, client, build_request([], QUESTION, HITS))
    kinds = [e for e, _ in events]
    assert "citation" in kinds and kinds[-1] == "done"
    done = events[-1][1]
    assert done.stop_reason == "end_turn"
    assert "2-5/16" in "".join(b["text"] for b in done.content)
    assert any(b["citations"] for b in done.content)


@pytest.mark.live
def test_second_turn_reads_the_prompt_cache() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set")
    client = anthropic.AsyncAnthropic()
    first = anyio.run(collect, client, build_request([], QUESTION, HITS))[-1][1]
    history = [
        {"role": "user", "content": QUESTION},
        {"role": "assistant", "content": "".join(b["text"] for b in first.content)},
    ]
    second = anyio.run(
        collect, client, build_request(history, "And the tongue weight range?", HITS)
    )[-1][1]
    assert second.usage["cache_read_input_tokens"] > 0
