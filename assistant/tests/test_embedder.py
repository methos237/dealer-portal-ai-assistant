from types import SimpleNamespace

import pytest

from rag.embedder import AzureOpenAIEmbedder, FastEmbedEmbedder


@pytest.mark.slow
def test_fastembed_produces_384_dim_unit_vectors() -> None:
    emb = FastEmbedEmbedder()
    docs = emb.embed(["slide-out seal leaking", "battery isolator relay"])
    q = emb.embed_query("water leak at the slide seal")
    assert len(docs) == 2 and len(docs[0]) == emb.dim == 384 and len(q) == 384
    dot = lambda a, b: sum(x * y for x, y in zip(a, b, strict=True))  # noqa: E731
    assert dot(q, docs[0]) > dot(q, docs[1])


class FakeAzureClient:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.embeddings = SimpleNamespace(create=self._create)

    def _create(self, model: str, input: list[str]):
        self.calls.append(input)
        # return out of order to prove the embedder sorts by index
        data = [SimpleNamespace(index=i, embedding=[float(i)] * 1536) for i in range(len(input))]
        return SimpleNamespace(data=list(reversed(data)))


def test_azure_embedder_batches_and_orders_results() -> None:
    client = FakeAzureClient()
    emb = AzureOpenAIEmbedder(client=client, deployment="text-embedding-3-small")
    vectors = emb.embed([f"chunk {i}" for i in range(130)])
    assert [len(c) for c in client.calls] == [64, 64, 2]
    assert len(vectors) == 130 and len(vectors[0]) == 1536
    assert vectors[0][0] == 0.0 and vectors[63][0] == 63.0 and vectors[64][0] == 0.0


@pytest.mark.live
def test_azure_embedder_live() -> None:
    pytest.importorskip("openai")
    import os

    if not os.environ.get("AZURE_OPENAI_ENDPOINT"):
        pytest.skip("AZURE_OPENAI_ENDPOINT not set")
    assert len(AzureOpenAIEmbedder().embed_query("hello")) == 1536
