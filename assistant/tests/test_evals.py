from types import SimpleNamespace as NS

from evals.run import Spend, load_cases, matches, summarize


def test_cases_file_has_every_suite() -> None:
    assert len(load_cases("retrieval")) >= 25 and len(load_cases("answer")) >= 5
    assert len(load_cases("tool")) >= 8 and len(load_cases("injection")) >= 5
    assert all(c["expected"] for c in load_cases("retrieval"))
    assert all(c.get("expected_tool") or c.get("no_tool") for c in load_cases("tool"))


def test_section_match_is_case_insensitive_substring() -> None:
    hit = NS(path="owner-manual-aria.md", metadata={"section": "Warranty > What is excluded"})
    assert matches(hit, {"doc": "owner-manual-aria.md", "section": "what is excluded"})
    assert matches(hit, {"doc": "owner-manual-aria.md"})
    assert not matches(hit, {"doc": "owner-manual-aria.md", "section": "Awning"})
    assert not matches(hit, {"doc": "owner-manual-summit.md"})


def test_summary_averages_recall_and_reciprocal_rank() -> None:
    rows = [{"grade": {"recall_at_5": 1.0, "rr": 1.0}}, {"grade": {"recall_at_5": 0.0, "rr": 0.0}}]
    assert summarize("retrieval", rows) == {"cases": 2, "recall_at_5": 0.5, "mrr": 0.5}
    answers = [{"grade": {"faithfulness": 5.0}}, {"grade": {"faithfulness": 3.0}}]
    assert summarize("answer", answers) == {
        "cases": 2,
        "faithfulness_mean": 4.0,
        "faithfulness_min": 3.0,
    }


def test_spend_prices_cache_reads_and_writes() -> None:
    spend = Spend()
    spend.add(
        "claude-opus-5",
        {
            "input_tokens": 1_000_000,
            "output_tokens": 0,
            "cache_read_input_tokens": 1_000_000,
            "cache_creation_input_tokens": 0,
        },
    )
    spend.add("claude-sonnet-5", {"input_tokens": 0, "output_tokens": 100_000})
    assert round(spend.usd(), 2) == round(5.0 + 0.5 + 1.0, 2)
