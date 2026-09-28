FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy HOME=/cache HF_HOME=/cache/hf FASTEMBED_CACHE_PATH=/cache/fastembed
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev && mkdir -p /cache/fastembed /cache/hf && chown -R nobody /cache
ENV PATH="/app/.venv/bin:$PATH"
USER nobody
EXPOSE 8000
# Migrations and fixture ingestion are idempotent (content hash), so they can run on every start.
CMD ["sh", "-c", "python -m rag.migrate && python -m rag.ingest fixtures/docs && fastapi run app/main.py --host 0.0.0.0 --port 8000"]
