import pytest

from app.main import check_embedding_provider


def test_startup_check_passes_when_meta_matches(conn) -> None:
    check_embedding_provider(conn)


def test_startup_check_fails_on_provider_mismatch(conn, monkeypatch) -> None:
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.delenv("EMBEDDING_DIM", raising=False)
    with pytest.raises(RuntimeError, match="fake|fastembed"):
        check_embedding_provider(conn)
