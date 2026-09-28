"""Embedding providers.

Selected by env: Azure OpenAI when AZURE_OPENAI_ENDPOINT is set, else fastembed.
"""

import os
from typing import Protocol

from rag import settings


class Embedder(Protocol):
    provider: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class FastEmbedEmbedder:
    """BAAI/bge-small-en-v1.5 via ONNX. Free, offline after the first model download."""

    provider = "fastembed"
    dim = settings.FASTEMBED_DIM

    def __init__(self) -> None:
        from fastembed import TextEmbedding

        self._model = TextEmbedding(model_name=settings.FASTEMBED_MODEL)

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self._model.embed(texts, batch_size=32)]

    def embed_query(self, text: str) -> list[float]:
        # bge models expect a retrieval instruction prefix on the query side only.
        return next(self._model.query_embed(text)).tolist()


class AzureOpenAIEmbedder:
    """text-embedding-3-small on Azure OpenAI. Batched; the SDK retries 429/5xx."""

    provider = "azure_openai"
    dim = settings.AZURE_DIM
    batch_size = 64

    def __init__(self, client=None, deployment: str | None = None) -> None:
        if client is None:
            from openai import AzureOpenAI

            client = AzureOpenAI(
                azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
                api_key=os.environ["AZURE_OPENAI_API_KEY"],
                api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21"),
                max_retries=4,
            )
        self._client = client
        self._deployment = deployment or os.environ.get(
            "AZURE_OPENAI_EMBEDDING_DEPLOYMENT", settings.AZURE_MODEL
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), self.batch_size):
            res = self._client.embeddings.create(
                model=self._deployment, input=texts[i : i + self.batch_size]
            )
            out.extend(d.embedding for d in sorted(res.data, key=lambda d: d.index))
        return out

    def embed_query(self, text: str) -> list[float]:
        return self.embed([text])[0]


def get_embedder() -> Embedder:
    return (
        AzureOpenAIEmbedder()
        if settings.embedding_provider() == "azure_openai"
        else FastEmbedEmbedder()
    )
