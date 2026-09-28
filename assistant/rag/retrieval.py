"""Hybrid retrieval: BM25-style full text plus cosine similarity, fused by reciprocal rank."""

from dataclasses import dataclass

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector

from rag.embedder import Embedder

CANDIDATES = 20  # per ranker
TOP_K = 6
RRF_K = 60

# dealer_id None = Thor.Admin, sees every document; a dealer sees public docs plus its own.
_VISIBLE = "(%(dealer_id)s::int IS NULL OR d.dealer_id IS NULL OR d.dealer_id = %(dealer_id)s)"

_LEXICAL = f"""
SELECT c.id, c.doc_id, d.title, d.path, c.ord, c.text, c.metadata
FROM rag.chunks c JOIN rag.documents d ON d.id = c.doc_id
WHERE c.tsv @@ websearch_to_tsquery('english', %(q)s) AND {_VISIBLE}
ORDER BY ts_rank_cd(c.tsv, websearch_to_tsquery('english', %(q)s)) DESC
LIMIT {CANDIDATES}
"""

_SEMANTIC = f"""
SELECT c.id, c.doc_id, d.title, d.path, c.ord, c.text, c.metadata
FROM rag.chunks c JOIN rag.documents d ON d.id = c.doc_id
WHERE {_VISIBLE}
ORDER BY c.embedding <=> %(v)s
LIMIT {CANDIDATES}
"""


@dataclass
class Hit:
    chunk_id: int
    doc_id: int
    title: str
    path: str
    ord: int
    text: str
    metadata: dict
    score: float


def retrieve(
    conn: psycopg.Connection,
    embedder: Embedder,
    query: str,
    dealer_id: int | None = None,
    k: int = TOP_K,
) -> list[Hit]:
    register_vector(conn)
    params = {"q": query, "dealer_id": dealer_id}
    lexical = conn.execute(_LEXICAL, params).fetchall()
    semantic = conn.execute(
        _SEMANTIC, {**params, "v": Vector(embedder.embed_query(query))}
    ).fetchall()

    fused: dict[int, Hit] = {}
    for ranking in (lexical, semantic):
        for rank, row in enumerate(ranking, start=1):
            hit = fused.get(row[0])
            if hit is None:
                hit = fused[row[0]] = Hit(*row, score=0.0)
            hit.score += 1.0 / (RRF_K + rank)
    return sorted(fused.values(), key=lambda h: h.score, reverse=True)[:k]
