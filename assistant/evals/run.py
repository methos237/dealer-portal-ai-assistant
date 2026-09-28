"""Eval runner. `uv run evals --suite retrieval` (default: every suite that needs no model).

Cases live in evals/cases.yaml. Retrieval cases are graded programmatically against the
indexed fixtures: recall@5 (an expected document appears in the top 5) and MRR. Results go
to evals/out/<timestamp>.json; the process exits 1 when a threshold is missed.
"""

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import psycopg
import yaml

from rag.embedder import get_embedder
from rag.retrieval import retrieve
from rag.settings import database_url

CASES = Path(__file__).parent / "cases.yaml"
OUT = Path(__file__).parent / "out"
THRESHOLDS = {"recall_at_5": 0.90}


def load_cases(suite: str) -> list[dict]:
    cases = yaml.safe_load(CASES.read_text())["cases"]
    return [c for c in cases if c["suite"] == suite]


def matches(hit, expected: dict) -> bool:
    if hit.path != expected["doc"]:
        return False
    section = expected.get("section")
    return not section or section.lower() in (hit.metadata.get("section") or "").lower()


def run_retrieval(conn, embedder, cases: list[dict]) -> list[dict]:
    rows = []
    for case in cases:
        started = time.perf_counter()
        hits = retrieve(conn, embedder, case["question"], dealer_id=None, k=5)
        ranks = [i + 1 for i, h in enumerate(hits) if any(matches(h, e) for e in case["expected"])]
        rows.append(
            {
                "id": case["id"],
                "suite": "retrieval",
                "question": case["question"],
                "expected": case["expected"],
                "top5": [
                    {
                        "doc": h.path,
                        "section": h.metadata.get("section"),
                        "score": round(h.score, 4),
                    }
                    for h in hits
                ],
                "grade": {
                    "recall_at_5": 1.0 if ranks else 0.0,
                    "rr": 1.0 / ranks[0] if ranks else 0.0,
                },
                "latency_s": round(time.perf_counter() - started, 3),
            }
        )
    return rows


def summarize(rows: list[dict]) -> dict[str, float]:
    n = len(rows) or 1
    return {
        "cases": len(rows),
        "recall_at_5": round(sum(r["grade"]["recall_at_5"] for r in rows) / n, 4),
        "mrr": round(sum(r["grade"]["rr"] for r in rows) / n, 4),
    }


def print_table(rows: list[dict], summary: dict) -> None:
    print(f"{'id':<28} {'hit':>3} {'rank':>4}  top-1")
    for r in rows:
        rank = next(
            (
                i + 1
                for i, t in enumerate(r["top5"])
                if any(t["doc"] == e["doc"] for e in r["expected"])
            ),
            "-",
        )
        mark = "ok" if r["grade"]["recall_at_5"] else "MISS"
        top1 = f"{r['top5'][0]['doc']} › {r['top5'][0]['section']}" if r["top5"] else "-"
        print(f"{r['id']:<28} {mark:>3} {rank!s:>4}  {top1}")
    print(
        f"\nretrieval: {summary['cases']} cases,"
        f" recall@5 {summary['recall_at_5']:.2f}, MRR {summary['mrr']:.2f}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="evals")
    parser.add_argument("--suite", choices=["retrieval"], default="retrieval")
    args = parser.parse_args(argv)

    cases = load_cases(args.suite)
    with psycopg.connect(database_url()) as conn:
        rows = run_retrieval(conn, get_embedder(), cases)
    summary = summarize(rows)
    print_table(rows, summary)

    OUT.mkdir(exist_ok=True)
    out = OUT / f"{datetime.now(UTC):%Y%m%dT%H%M%SZ}-{args.suite}.json"
    out.write_text(json.dumps({"suite": args.suite, "summary": summary, "rows": rows}, indent=2))
    print(f"wrote {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out}")

    failed = [k for k, v in THRESHOLDS.items() if summary[k] < v]
    if failed:
        print(f"THRESHOLD MISSED: {', '.join(f'{k} < {THRESHOLDS[k]}' for k in failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
