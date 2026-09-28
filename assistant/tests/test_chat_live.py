"""Real-model tests. The cassette test replays a recorded turn in CI; `live` tests need a key."""

import os
from pathlib import Path

import anthropic
import pytest

from app.chat import build_request, stream_answer
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


@pytest.fixture(scope="module")
def vcr_config():
    return {"filter_headers": ["x-api-key", "authorization"], "record_mode": "once"}


@pytest.mark.vcr
def test_recorded_turn_cites_the_document() -> None:
    if not CASSETTE.exists() and not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("no cassette recorded yet and no ANTHROPIC_API_KEY to record one")
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", "recorded"))
    events = list(
        stream_answer(
            client, build_request([], "What hitch ball size does the Aria need?", HITS), HITS
        )
    )
    kinds = [e for e, _ in events]
    assert "citation" in kinds and kinds[-1] == "done"
    done = events[-1][1]
    assert done["stop_reason"] == "end_turn"
    assert "2-5/16" in "".join(b["text"] for b in done["content"])
    assert done["content"][0]["citations"] or any(b["citations"] for b in done["content"])


@pytest.mark.live
def test_second_turn_reads_the_prompt_cache() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set")
    client = anthropic.Anthropic()
    first = list(
        stream_answer(
            client, build_request([], "What hitch ball size does the Aria need?", HITS), HITS
        )
    )[-1][1]
    history = [
        {"role": "user", "content": "What hitch ball size does the Aria need?"},
        {"role": "assistant", "content": "".join(b["text"] for b in first["content"])},
    ]
    second = list(
        stream_answer(client, build_request(history, "And the tongue weight range?", HITS), HITS)
    )[-1][1]
    assert second["usage"]["cache_read_input_tokens"] > 0
