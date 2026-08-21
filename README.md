# AI Video Tutor

This repository contains a working vertical-slice backend and Chrome extension for a grounded video tutor. The extension detects YouTube or accessible HTML5 video, indexes browser-provided captions when available, and otherwise captures tab audio in one-minute chunks only after explicit learner activation. The backend transcribes and indexes that evidence, then answers questions with timestamp citations.

## Current checkpoint

Implemented:

- FastAPI endpoints for resources, consented capture sessions, direct S3 chunk uploads, browser transcripts, tutor sessions/turns, frame evidence, and evidence deletion.
- PostgreSQL/pgvector storage with user-scoped records, full-text plus vector retrieval, expiry timestamps, and idempotent mutations.
- SQS transcription worker using AssemblyAI Universal-3.5-Pro with Universal-2 fallback.
- Grounded tutor using Gemini 2.5 Flash-Lite and `gemini-embedding-001`; unsupported claims and missing evidence produce an explicit refusal.
- Chrome side panel, Cognito PKCE authentication, browser-caption ingestion, user-started tab-audio capture, pause/seek discontinuity handling, and cited tutor responses.
- Unit and API tests for contracts, segmentation, retrieval helpers, tutor grounding, and idempotency.

Intentionally deferred from this checkpoint:

- Hierarchical ten-minute/course summaries for very long videos.
- The extension UI for model-requested, user-approved, video-only frame capture. The backend frame endpoint exists, but the extension does not invoke it yet.
- Production AWS infrastructure-as-code and scheduled deletion jobs. Database rows carry expiry timestamps and raw audio is deleted by the worker, but production S3 lifecycle and database cleanup must be configured before deployment.
- Institution-level Blackboard Learn REST/LTI integration. The current Blackboard path supports only an accessible HTML5 player or browser evidence; it does not bypass cross-origin, DRM, or course permissions.

See [backend/README.md](backend/README.md) and [extension/README.md](extension/README.md) for local setup. Design rationale remains in [HIGH-LEVEL-PLAN.md](HIGH-LEVEL-PLAN.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Verification

```sh
source venv/bin/activate
pytest
python -m compileall -q backend scripts

cd extension
npm test
```

The local database migration additionally requires PostgreSQL 16 with pgvector. `docker compose up -d postgres` provides it when Docker is running.
