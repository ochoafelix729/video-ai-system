# Backend

## Local setup

Use Python 3.12 or newer, then install dependencies and copy the environment template:

```sh
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
docker compose up -d postgres
python -m scripts.apply_migrations
```

For local-only development, set `AUTH_DISABLED=true`. Never use that setting in a shared or production environment. With authentication enabled, configure the Cognito region, user pool, and app client. Configure AWS credentials, the private S3 bucket, SQS queue, AssemblyAI key, Gemini key, and the Chrome extension origin before exercising ingestion.

Run the API and worker in separate terminals:

```sh
source venv/bin/activate
uvicorn backend.app:app --reload
python -m backend.worker
```

The API schema is available at `http://localhost:8000/docs`.

## Runtime flow

1. The API registers a user-scoped learning resource.
2. Browser captions are embedded directly, or the extension requests a presigned S3 upload for each one-minute audio chunk.
3. SQS delivers uploaded chunks to the worker. It transcribes, sentence-segments, embeds, and stores timestamped evidence, then deletes the raw S3 object in a `finally` cleanup path.
4. Tutor turns perform hybrid semantic/full-text retrieval with a playback-time boost. Gemini receives only retrieved evidence and recent conversation; returned citation IDs are validated against that evidence.
5. `DELETE /learning-resources/{id}/evidence` removes that user's indexed evidence and referenced S3 objects.

## Production requirements not included yet

- Private, encrypted S3 with CORS limited to the extension origin and a raw-audio lifecycle no longer than 24 hours.
- SQS dead-letter queue, ECS service/task definitions, RDS PostgreSQL with pgvector, Cognito, KMS, alarms, and secret injection.
- A scheduled database purge for expired `evidence_segments`, resources, and stale idempotency records.
- Hierarchical summaries and raw-evidence drill-down for long courses.

Do not deploy this checkpoint until those retention and infrastructure controls are supplied.
