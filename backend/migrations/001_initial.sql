CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS learning_resources (
    id uuid PRIMARY KEY,
    user_id text NOT NULL,
    platform text NOT NULL,
    source_id text NOT NULL,
    context jsonb NOT NULL,
    state text NOT NULL DEFAULT 'preparing',
    actionable_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    UNIQUE (user_id, platform, source_id)
);

CREATE TABLE IF NOT EXISTS capture_sessions (
    id uuid PRIMARY KEY,
    resource_id uuid NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    consented_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capture_chunks (
    id uuid PRIMARY KEY,
    capture_session_id uuid NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
    resource_id uuid NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    source_start_seconds double precision NOT NULL,
    source_end_seconds double precision NOT NULL,
    discontinuity_id uuid NOT NULL,
    content_type text NOT NULL,
    byte_length integer NOT NULL,
    s3_key text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'awaiting_upload',
    etag text,
    provider_job_id text,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    UNIQUE (capture_session_id, discontinuity_id, source_start_seconds, source_end_seconds)
);

CREATE TABLE IF NOT EXISTS evidence_segments (
    id uuid PRIMARY KEY,
    resource_id uuid NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    kind text NOT NULL,
    granularity text NOT NULL DEFAULT 'raw',
    start_seconds double precision NOT NULL,
    end_seconds double precision,
    content text NOT NULL,
    confidence double precision,
    
    embedding vector(768) NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS evidence_resource_time_idx
    ON evidence_segments (user_id, resource_id, start_seconds);
CREATE INDEX IF NOT EXISTS evidence_search_idx ON evidence_segments USING gin(search_vector);
CREATE INDEX IF NOT EXISTS evidence_embedding_idx
    ON evidence_segments USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS tutor_sessions (
    id uuid PRIMARY KEY,
    resource_id uuid NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    summary text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tutor_turns (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tutor_turns_session_idx
    ON tutor_turns (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id text NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, operation, idempotency_key)
);
