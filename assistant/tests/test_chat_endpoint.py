"""POST /chat end to end with a fake model client and a fake embedder; real Postgres."""

import json
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import chat
from app.auth import User, current_user
from app.main import app
from rag.ingest import ingest_dir
from tests.conftest import FakeEmbedder
from tests.fakes import FakeAsyncAnthropic, Turn, citation, text, text_start, usage
from tests.test_ingest_retrieval import write_docs

OID = str(uuid.uuid4())


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for frame in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in frame.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


@pytest.fixture
def client(conn, tmp_path: Path):
    write_docs(tmp_path)
    ingest_dir(conn, FakeEmbedder(), tmp_path)
    conn.commit()
    fake = FakeAsyncAnthropic(
        [
            Turn(
                [
                    text_start(),
                    text("Retract above "),
                    citation("wind exceeds 20 mph", 0, "Awning Guide"),
                    text("20 mph."),
                ],
                usage_=usage(input_tokens=900, output_tokens=30, cache_read_input_tokens=850),
            )
        ]
    )

    @asynccontextmanager
    async def no_tools(user: User):
        yield []

    app.dependency_overrides[current_user] = lambda: User(
        oid=OID, roles=["Dealer.User"], dealer_id=1, token="t"
    )
    app.dependency_overrides[chat.get_conn] = lambda: conn
    app.dependency_overrides[chat.get_client] = lambda: fake
    app.dependency_overrides[chat.embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[chat.get_tools_provider] = lambda: no_tools
    yield TestClient(app), fake
    app.dependency_overrides.clear()
    conn.execute("DELETE FROM rag.conversations WHERE user_oid = %s", (OID,))
    conn.commit()


def test_chat_streams_events_and_persists_both_turns(client) -> None:
    http, fake = client
    res = http.post("/chat", json={"message": "When must the awning be retracted?"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(res.text)

    kinds = [e for e, _ in events]
    assert kinds == ["conversation", "text", "citation", "text", "done"]
    conversation_id = events[0][1]["id"]
    assert events[0][1]["sources"][0]["path"] == "awning.md"
    assert events[2][1]["source"]["path"] == "awning.md"
    assert events[-1][1]["usage"]["cache_read_input_tokens"] == 850

    # documents went to the model as citation-enabled document blocks
    sent = fake.requests[0]["messages"][-1]["content"]
    assert sent[0]["type"] == "document" and sent[0]["citations"] == {"enabled": True}
    assert sent[-1] == {"type": "text", "text": "When must the awning be retracted?"}

    # second turn replays history as plain text
    res2 = http.post(
        "/chat", json={"conversation_id": conversation_id, "message": "And the fabric?"}
    )
    assert res2.status_code == 200
    history = fake.requests[1]["messages"][:-1]
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[1]["content"] == "Retract above 20 mph."

    detail = http.get(f"/conversations/{conversation_id}").json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant", "user", "assistant"]
    assert (
        detail["messages"][1]["content"][0]["citations"][0]["cited_text"] == "wind exceeds 20 mph"
    )
    assert http.get("/conversations").json()[0]["id"] == conversation_id


def test_conversation_of_another_user_is_404(client) -> None:
    http, _ = client
    other = http.post("/chat", json={"message": "hello"})
    conversation_id = parse_sse(other.text)[0][1]["id"]
    app.dependency_overrides[current_user] = lambda: User(
        oid=str(uuid.uuid4()), roles=["Dealer.User"], dealer_id=2, token="t"
    )
    assert http.get(f"/conversations/{conversation_id}").status_code == 404
    assert (
        http.post("/chat", json={"conversation_id": conversation_id, "message": "x"}).status_code
        == 404
    )


def test_chunk_endpoint_respects_dealer_scope(client, conn) -> None:
    http, _ = client
    chunk_id = conn.execute(
        "SELECT c.id FROM rag.chunks c JOIN rag.documents d ON d.id=c.doc_id"
        " WHERE d.path='awning.md'"
    ).fetchone()[0]
    assert http.get(f"/chunks/{chunk_id}").json()["path"] == "awning.md"
    conn.execute("UPDATE rag.documents SET dealer_id = 2 WHERE path = 'awning.md'")
    assert http.get(f"/chunks/{chunk_id}").status_code == 404
    conn.execute("UPDATE rag.documents SET dealer_id = NULL WHERE path = 'awning.md'")
