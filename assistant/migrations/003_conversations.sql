-- Chat history. Assistant content keeps the API text blocks (with citations) for the UI;
-- replay to the model uses text only.
CREATE TABLE rag.conversations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_oid   uuid NOT NULL,
    dealer_id  int,
    title      text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_user_idx ON rag.conversations (user_oid, created_at DESC);

CREATE TABLE rag.messages (
    id              bigserial PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES rag.conversations(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         jsonb NOT NULL,          -- list of content blocks
    sources         jsonb,                   -- assistant turns: retrieved chunks the citations point at
    usage           jsonb,                   -- assistant turns: input/output/cache token counts
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON rag.messages (conversation_id, id);
