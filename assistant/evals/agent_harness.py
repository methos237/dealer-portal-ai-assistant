"""Run one assistant turn for the evals: real model, real retrieval, stubbed portal tools.

Tools come from evals/fixtures/tools.json (a contract snapshot of the api's tools/list kept in
sync by an api test) and return canned results from tool_results.json, so the eval needs no
portal token and no running api. The model's tool choice is what is under test.
"""

import json
from pathlib import Path

import anthropic
import anyio
import psycopg
from anthropic import beta_async_tool

from app.agent import TurnResult, _strict, build_request, run_turn
from rag.embedder import Embedder
from rag.retrieval import Hit, retrieve

FIXTURES = Path(__file__).parent / "fixtures"


def stub_tools(exclude: set[str] = frozenset()) -> list:
    defs = json.loads((FIXTURES / "tools.json").read_text())
    results = json.loads((FIXTURES / "tool_results.json").read_text())
    tools = []
    for d in defs:
        if d["name"] in exclude:
            continue
        canned = json.dumps(results[d["name"]])

        def make(payload: str):
            async def call(**kwargs) -> str:  # the AsyncAnthropic runner awaits tool calls
                return payload

            return call

        tools.append(
            beta_async_tool(
                make(canned),
                name=d["name"],
                description=d["description"],
                input_schema=_strict(d["inputSchema"]),
                strict=True,
            )
        )
    return tools


def run_case(
    client: anthropic.AsyncAnthropic,
    conn: psycopg.Connection,
    embedder: Embedder,
    question: str,
    tools: list,
    history: list[dict] | None = None,
) -> tuple[TurnResult, list[Hit]]:
    hits = retrieve(conn, embedder, question, dealer_id=None)
    request = build_request(history or [], question, hits)

    async def go() -> TurnResult:
        result = None
        async for event, data in run_turn(client, request, tools, hits):
            if event == "done":
                result = data
        assert result is not None
        return result

    return anyio.run(go), hits
