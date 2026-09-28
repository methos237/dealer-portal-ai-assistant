-- Retrieval store. ${EMBEDDING_DIM} and ${EMBEDDING_PROVIDER} are substituted by rag.migrate from the
-- embedding settings, so an index built with one provider is never queried with another.
CREATE TABLE rag.meta (
    key   text PRIMARY KEY,
    value text NOT NULL
);
INSERT INTO rag.meta (key, value) VALUES
    ('embedding_provider', '${EMBEDDING_PROVIDER}'),
    ('embedding_dim', '${EMBEDDING_DIM}');

-- One row per ingested file. portal_document_id mirrors portal.documents.id when the file is listed there.
CREATE TABLE rag.documents (
    id                 serial PRIMARY KEY,
    path               text NOT NULL UNIQUE,
    title              text NOT NULL,
    kind               text NOT NULL,          -- OwnerManual | ServiceBulletin
    model              text,                   -- RV model line the document applies to, NULL = all
    dealer_id          int,                    -- NULL = visible to every dealer
    portal_document_id int,
    content_hash       text NOT NULL,
    indexed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rag.chunks (
    id        bigserial PRIMARY KEY,
    doc_id    int NOT NULL REFERENCES rag.documents(id) ON DELETE CASCADE,
    ord       int NOT NULL,
    text      text NOT NULL,
    tsv       tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
    embedding vector(${EMBEDDING_DIM}) NOT NULL,
    metadata  jsonb NOT NULL DEFAULT '{}',     -- title, section path, page
    UNIQUE (doc_id, ord)
);
CREATE INDEX chunks_tsv_gin ON rag.chunks USING gin (tsv);
CREATE INDEX chunks_embedding_hnsw ON rag.chunks USING hnsw (embedding vector_cosine_ops);
