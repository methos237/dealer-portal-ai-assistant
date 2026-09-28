import hashlib
import math
import os
import re

import psycopg
import pytest
from testcontainers.community.postgres import PostgresContainer

from rag.migrate import migrate

FAKE_DIM = 16


class FakeEmbedder:
    """Deterministic bag-of-words hashing into a small vector, so similar text lands nearby."""

    provider = "fake"
    dim = FAKE_DIM

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)

    @staticmethod
    def _vec(text: str) -> list[float]:
        v = [0.0] * FAKE_DIM
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            h = hashlib.md5(word.encode()).digest()
            v[h[0] % FAKE_DIM] += 1.0 if h[1] % 2 else -1.0
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]


@pytest.fixture(scope="session")
def dsn():
    """One pgvector Postgres for the test session, migrated with the fake embedder's dimension."""
    os.environ["EMBEDDING_DIM"] = str(FAKE_DIM)
    os.environ.pop("AZURE_OPENAI_ENDPOINT", None)
    with PostgresContainer("pgvector/pgvector:pg17", driver=None) as pg:
        url = pg.get_connection_url()
        with psycopg.connect(url) as conn:
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        migrate(url)
        yield url


@pytest.fixture
def conn(dsn):
    with psycopg.connect(dsn) as c:
        yield c
        c.rollback()
