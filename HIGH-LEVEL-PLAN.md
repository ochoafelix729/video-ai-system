# YouTube AI Tutor Extension — High-Level Plan

Turn the current Python video-downloader proof of concept into a Chrome/Chromium extension plus a small backend. On any YouTube watch page, an “AI Tutor” button opens a side panel where the user can ask questions grounded in both the spoken content and what appears on screen.
Key Changes
Build a Manifest V3 extension that detects YouTube watch pages, adds an AI Tutor button, and opens a right-side chat panel.
Send the video URL, video ID, title, and current playback timestamp with each request.
Show preparation progress when a video has not been indexed yet.
Return answers with clickable timestamps that seek the YouTube player to supporting moments.

Evolve the Python project into a deployable API and background worker.
Keep the existing YouTube-to-S3 download capability as the worker’s media-ingestion step.
Extract audio/transcript when available; otherwise transcribe the audio.
Sample meaningful frames/keyframes throughout the video and use a multimodal model to create timestamped visual notes.
Store compact, timestamped transcript segments and visual descriptions in a searchable index; delete source video files after processing unless explicitly retained.

Answer questions using retrieval rather than sending an entire video to an LLM.
Retrieve the most relevant spoken and visual segments, prioritizing the user’s current playback position when useful.
Have a multimodal-capable tutor generate a concise answer based only on that evidence.
Clearly identify uncertainty and cite supporting timestamps, especially for visual claims.

Make the personal prototype easy to deploy safely.
Package the API, worker, database/index, and object storage configuration for a single cloud deployment.
Start with an allowlisted user account or API key, but structure requests around a user identity from day one.
Add basic rate limits, per-user video-processing quotas, job size limits, and usage logging so opening a small beta later does not require a redesign.
Process only user-initiated videos and document content-rights/YouTube-platform constraints before wider release.

Public Interfaces
POST /videos: submit a YouTube URL and return an indexing job/video record.
GET /videos/{id}: return preparation/indexing status.
POST /videos/{id}/questions: accept a question plus optional current timestamp; return answer text, evidence timestamps, and readiness/error state.
Extension-to-backend authentication uses a single configured personal credential initially, designed to later swap to normal user sessions.
Test Plan
Extension detects standard YouTube watch pages, injects one button, opens/closes the tutor panel, and supplies the correct video ID and playback timestamp.
A captioned video and a video with no usable captions both become queryable.
Questions about narration, on-screen diagrams/slides, and the current moment produce timestamp-linked answers.
Processing failures, private/unavailable videos, quota exhaustion, and rate-limit responses are communicated clearly in the panel.
End-to-end deploy test: submit a video, wait for indexing, ask a question, and seek to returned evidence.
Assumptions
V1 targets Chrome/Chromium; the implementation should avoid choices that block a later Firefox port.
The tutor uses a side panel rather than a separate web app or a modal overlay.
V1 is a personal prototype, with lightweight access and abuse controls included so a limited beta is straightforward later.