"""POST /chat: retrieval + portal tools, cited, streamed over SSE."""

import functools
import json
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any

import anthropic
import anyio
import psycopg
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent import MODEL, build_request, mcp_tools, run_turn, source_dict
from app.auth import User, current_user, portal_api_url
from app.pii import get_logger
from app.pricing import USAGE_TO_PRICE, cost_usd
from app.telemetry import tracer
from rag import settings
from rag.embedder import Embedder, get_embedder
from rag.retrieval import retrieve

router = APIRouter()
log = get_logger("assistant.chat")

MAX_TOKENS_PER_CONVERSATION = int(os.environ.get("MAX_TOKENS_PER_CONVERSATION", "200000"))


class ChatRequest(BaseModel):
    conversation_id: uuid.UUID | None = None
    message: str


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def conversation_tokens(conn: psycopg.Connection, conversation_id: uuid.UUID) -> int:
    row = conn.execute(
        "SELECT coalesce(sum((usage->>'input_tokens')::int + (usage->>'output_tokens')::int), 0)"
        " FROM rag.messages WHERE conversation_id = %s AND usage IS NOT NULL",
        (conversation_id,),
    ).fetchone()
    return int(row[0])


def history_for(conn: psycopg.Connection, conversation_id: uuid.UUID) -> list[dict]:
    """Append-only: prior turns replay as plain text; drafts and tool calls stay in the record."""
    rows = conn.execute(
        "SELECT role, content FROM rag.messages WHERE conversation_id = %s ORDER BY id",
        (conversation_id,),
    ).fetchall()
    return [
        {
            "role": role,
            "content": "".join(b["text"] for b in content if b["type"] == "text") or "(no text)",
        }
        for role, content in rows
    ]


def get_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic()


def get_conn() -> Iterator[psycopg.Connection]:
    with psycopg.connect(settings.database_url()) as conn:
        yield conn


embedder = functools.cache(get_embedder)


def tool_sources(user: User) -> list[str]:
    """MCP servers this user gets tools from: the portal api always; mcp-m365 for Thor.Admin only
    (it reads the whole SharePoint site with an app-only Graph token, and re-checks the role)."""
    urls = [f"{portal_api_url()}/mcp"]
    m365 = os.environ.get("M365_MCP_URL")
    if m365 and user.is_thor_admin:
        urls.append(m365)
    return urls


@asynccontextmanager
async def tools_for(user: User):
    """Async context manager yielding this user's tools from every source. Overridden in tests."""
    async with AsyncExitStack() as stack:
        tools: list = []
        for url in tool_sources(user):
            tools += await stack.enter_async_context(mcp_tools(url, user.token))
        yield tools


def owned(conn: psycopg.Connection, conversation_id: uuid.UUID, user: User) -> None:
    owner = conn.execute(
        "SELECT user_oid FROM rag.conversations WHERE id = %s", (conversation_id,)
    ).fetchone()
    if not owner or str(owner[0]) != user.oid:
        raise HTTPException(404, "Conversation not found")


@router.post("/chat")
async def chat(
    body: ChatRequest,
    user: User = Depends(current_user),
    conn: psycopg.Connection = Depends(get_conn),
    client: anthropic.AsyncAnthropic = Depends(get_client),
    emb: Embedder = Depends(embedder),
) -> StreamingResponse:
    if body.conversation_id:
        owned(conn, body.conversation_id, user)
        conversation_id = body.conversation_id
        if conversation_tokens(conn, conversation_id) > MAX_TOKENS_PER_CONVERSATION:
            raise HTTPException(
                429, "This conversation has reached its token budget; start a new one."
            )
    else:
        conversation_id = conn.execute(
            "INSERT INTO rag.conversations (user_oid, dealer_id, title)"
            " VALUES (%s, %s, %s) RETURNING id",
            (user.oid, user.dealer_id, body.message[:80]),
        ).fetchone()[0]
        conn.commit()

    history = history_for(conn, conversation_id)
    with tracer.start_as_current_span("retrieval") as span:
        hits = await anyio.to_thread.run_sync(
            lambda: retrieve(conn, emb, body.message, dealer_id=user.dealer_id)
        )
        span.set_attribute("retrieval.hits", len(hits))
    request = build_request(history, body.message, hits)
    log.info(
        "chat conversation=%s dealer=%s question=%s", conversation_id, user.dealer_id, body.message
    )

    async def events() -> AsyncIterator[str]:
        yield sse(
            "conversation", {"id": str(conversation_id), "sources": [source_dict(h) for h in hits]}
        )
        try:
            async with tools_for(user) as tools:
                async for event, data in run_turn(client, request, tools, hits):
                    if event != "done":
                        yield sse(event, data)
                        continue
                    with conn.transaction():
                        conn.execute(
                            "INSERT INTO rag.messages (conversation_id, role, content)"
                            " VALUES (%s, 'user', %s)",
                            (conversation_id, json.dumps([{"type": "text", "text": body.message}])),
                        )
                        conn.execute(
                            "INSERT INTO rag.messages"
                            " (conversation_id, role, content, sources, usage)"
                            " VALUES (%s, 'assistant', %s, %s, %s)",
                            (
                                conversation_id,
                                json.dumps(data.content),
                                json.dumps(
                                    {
                                        "chunks": [source_dict(h) for h in hits],
                                        "tool_calls": data.tool_calls,
                                        "drafts": data.drafts,
                                    }
                                ),
                                json.dumps({**data.usage, "model": MODEL}),
                            ),
                        )
                    yield sse("done", {"stop_reason": data.stop_reason, "usage": data.usage})
        except anthropic.APIStatusError as e:
            yield sse("error", {"status": e.status_code, "message": e.message})
        except anthropic.APIConnectionError:
            yield sse("error", {"status": 503, "message": "Could not reach the model API."})
        except Exception as e:  # tool transport failures (api down, token rejected by /mcp)
            log.exception("chat turn failed")
            yield sse("error", {"status": 502, "message": f"Assistant error: {type(e).__name__}"})

    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"cache-control": "no-cache"}
    )


@router.get("/conversations")
def list_conversations(
    user: User = Depends(current_user), conn: psycopg.Connection = Depends(get_conn)
) -> list[dict]:
    rows = conn.execute(
        "SELECT id, title, created_at FROM rag.conversations WHERE user_oid = %s"
        " ORDER BY created_at DESC LIMIT 50",
        (user.oid,),
    ).fetchall()
    return [{"id": str(i), "title": t, "created_at": c.isoformat()} for i, t, c in rows]


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(current_user),
    conn: psycopg.Connection = Depends(get_conn),
) -> dict:
    owned(conn, conversation_id, user)
    rows = conn.execute(
        "SELECT role, content, sources, usage, created_at FROM rag.messages"
        " WHERE conversation_id = %s ORDER BY id",
        (conversation_id,),
    ).fetchall()
    return {
        "id": str(conversation_id),
        "messages": [
            {"role": r, "content": c, "sources": s, "usage": u, "created_at": t.isoformat()}
            for r, c, s, u, t in rows
        ],
    }


@router.get("/conversations/{conversation_id}/cost")
def conversation_cost(
    conversation_id: uuid.UUID,
    user: User = Depends(current_user),
    conn: psycopg.Connection = Depends(get_conn),
) -> dict:
    """Token totals and USD cost of every assistant turn, from the pinned price table."""
    owned(conn, conversation_id, user)
    usages = [
        u
        for (u,) in conn.execute(
            "SELECT usage FROM rag.messages WHERE conversation_id = %s AND usage IS NOT NULL",
            (conversation_id,),
        ).fetchall()
    ]
    totals = {k: sum(u.get(k) or 0 for u in usages) for k in USAGE_TO_PRICE}
    costs = [cost_usd(u) for u in usages]
    return {
        "id": str(conversation_id),
        "turns": len(usages),
        "model": usages[-1].get("model", MODEL) if usages else MODEL,
        "usage": totals,
        "cost_usd": {
            k: round(sum(c[k] for c in costs), 6) for k in [*USAGE_TO_PRICE.values(), "total"]
        },
    }


@router.get("/chunks/{chunk_id}")
def get_chunk(
    chunk_id: int, user: User = Depends(current_user), conn: psycopg.Connection = Depends(get_conn)
) -> dict:
    """The source text behind a citation chip."""
    row = conn.execute(
        "SELECT c.text, c.metadata, d.title, d.path"
        " FROM rag.chunks c JOIN rag.documents d ON d.id = c.doc_id"
        " WHERE c.id = %s AND (%s::int IS NULL OR d.dealer_id IS NULL OR d.dealer_id = %s)",
        (chunk_id, user.dealer_id, user.dealer_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Chunk not found")
    return {
        "chunk_id": chunk_id,
        "text": row[0],
        "metadata": row[1],
        "title": row[2],
        "path": row[3],
    }
