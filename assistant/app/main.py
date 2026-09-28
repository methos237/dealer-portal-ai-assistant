import os
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI

from app.chat import router as chat_router
from rag import settings


def check_embedding_provider(conn: psycopg.Connection) -> None:
    """Fail fast when the index was built with a different embedder than the one configured."""
    meta = dict(conn.execute("SELECT key, value FROM rag.meta").fetchall())
    want = (settings.embedding_provider(), str(settings.embedding_dim()))
    have = (meta.get("embedding_provider"), meta.get("embedding_dim"))
    if have != want:
        raise RuntimeError(
            f"rag index built with {have[0]}/{have[1]} dims but the app is configured for"
            f" {want[0]}/{want[1]}. Re-run rag.migrate on a fresh schema or fix the env."
        )


def check_model_credentials() -> None:
    """Spend guard, part one: refuse to start without a way to reach a model."""
    if not any(
        os.environ.get(k)
        for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL")
    ):
        raise RuntimeError(
            "Set ANTHROPIC_API_KEY (or ANTHROPIC_BASE_URL for the local-llm profile)."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_model_credentials()
    with psycopg.connect(settings.database_url()) as conn:
        check_embedding_provider(conn)
    yield


app = FastAPI(title="Dealer Portal Assistant", lifespan=lifespan)
app.include_router(chat_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
