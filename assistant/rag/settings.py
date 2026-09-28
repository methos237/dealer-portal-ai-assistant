"""Embedding provider selection. One place, read by migrate, embedder and the app startup check."""

import os

FASTEMBED_MODEL = "BAAI/bge-small-en-v1.5"
FASTEMBED_DIM = 384
AZURE_MODEL = "text-embedding-3-small"
AZURE_DIM = 1536


def embedding_provider() -> str:
    return "azure_openai" if os.environ.get("AZURE_OPENAI_ENDPOINT") else "fastembed"


def embedding_dim() -> int:
    return int(
        os.environ.get("EMBEDDING_DIM")
        or (AZURE_DIM if embedding_provider() == "azure_openai" else FASTEMBED_DIM)
    )


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set")
    return url
