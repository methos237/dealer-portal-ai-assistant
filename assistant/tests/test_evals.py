from types import SimpleNamespace as NS

from evals.run import load_cases, matches, summarize


def test_cases_file_has_retrieval_and_answer_suites() -> None:
    retrieval, answer = load_cases("retrieval"), load_cases("answer")
    assert len(retrieval) >= 25 and len(answer) >= 5
    assert all(c["expected"] for c in retrieval)


def test_section_match_is_case_insensitive_substring() -> None:
    hit = NS(path="owner-manual-aria.md", metadata={"section": "Warranty > What is excluded"})
    assert matches(hit, {"doc": "owner-manual-aria.md", "section": "what is excluded"})
    assert matches(hit, {"doc": "owner-manual-aria.md"})
    assert not matches(hit, {"doc": "owner-manual-aria.md", "section": "Awning"})
    assert not matches(hit, {"doc": "owner-manual-summit.md"})


def test_summary_averages_recall_and_reciprocal_rank() -> None:
    rows = [{"grade": {"recall_at_5": 1.0, "rr": 1.0}}, {"grade": {"recall_at_5": 0.0, "rr": 0.0}}]
    assert summarize(rows) == {"cases": 2, "recall_at_5": 0.5, "mrr": 0.5}
