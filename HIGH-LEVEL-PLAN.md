# AI Video Tutor — High-Level Plan

## Product Direction

Turn the current YouTube-specific prototype into a Chrome/Chromium learning companion for educational videos across the web. The product should stand out from YouTube's conversational Ask feature by teaching, checking understanding, and adapting to the learner—not only answering questions.

The first expansion target is educational pages with an accessible HTML5 video player, especially videos presented through learning-management systems (LMSs). Named platforms are supported only after their technical and policy constraints have passed the feasibility process in [Platform Feasibility](docs/PLATFORM-FEASIBILITY.md).

## Core Experience

Build a grounded **teach-check-adapt** loop:

1. Explain the current concept using timestamped spoken and visual evidence.
2. Ask Socratic follow-ups that help the learner reason toward an answer.
3. Generate a short, ungraded knowledge check from the lecture evidence.
4. Give targeted feedback, reteach weak points, and update session progress.
5. Save learner-created notes, questions, and progress for later study.

The tutor remains video-focused. It must not inspect or answer quizzes, exams, graded assignments, or other assessment pages.

## Platform Strategy

Support is capability-based rather than an all-or-nothing claim about a website. For each video, the extension reports whether it can:

- Identify the media and read playback position.
- Seek to cited evidence.
- Access timestamped captions or a transcript through a permitted mechanism.
- Obtain visual evidence through a permitted, user-initiated mechanism.
- Use authorized media ingestion when browser evidence is insufficient.

When a capability is unavailable, the tutor degrades explicitly—for example, from transcript-and-visual grounding to transcript-only—or explains why tutoring cannot start.

The planned platform order is:

1. Preserve the current YouTube prototype while introducing platform-neutral contracts.
2. Prove generic HTML5 video support on representative educational/LMS pages.
3. Deliver the teach-check-adapt tutor on YouTube and generic HTML5 video.
4. Add compatibility profiles for common Blackboard-hosted or embedded player families.
5. Add Khan Academy, which is technically promising and frequently uses YouTube-backed media.
6. Investigate Udemy only after authentication, CAPTCHA, DRM, rights, and policy checks pass.
7. Keep Coursera blocked unless written permission or an approved integration permits the required processing.

Blackboard is an LMS container, not one uniform video service. A Blackboard page may embed Kaltura, Panopto, Vimeo, YouTube, Blackboard Collaborate, or other media, so compatibility is certified per player family and capability set.

## System Shape

### Extension

- Detect candidate media and delegate page-specific behavior to a platform adapter.
- Normalize platform identity, page and course context, playback state, and capabilities into one `VideoContext`.
- Open the side panel only after a learner initiates tutoring.
- Show preparation, degraded-capability, permission, policy, and unsupported states clearly.
- Seek the active player when the learner selects a timestamp citation.
- Request only the narrowest host and capture permissions needed for the active integration.

### API and Worker

- Accept platform-neutral learning resources and evidence manifests rather than YouTube URLs alone.
- Validate extension messages and API payloads at their boundaries.
- Build a searchable index of permitted, timestamped transcript and visual evidence.
- Retrieve relevant evidence for each tutor turn, favoring the current playback position when useful.
- Generate explanations, Socratic prompts, checks, and feedback only from retrieved evidence; label uncertainty when evidence is incomplete.
- Keep notes, session progress, and cached lecture evidence separate so each has an independent lifecycle.

### Privacy and Ingestion

- Process only videos for which the learner has access and only through methods allowed by the platform and content rights.
- Do not make `yt-dlp` the production ingestion default. It remains a feasibility tool and may be used only where downloading and processing are authorized.
- Encrypt permitted transcript/frame evidence in transit and at rest, isolate it per user, expire it after 30 days, and provide immediate user deletion.
- Do not reuse cached lecture evidence across users.
- Do not retain source media by default. If an authorized workflow temporarily creates source media, delete it after evidence extraction.
- Allow a platform policy to require transient processing or disable the integration instead of caching.

See [Architecture](docs/ARCHITECTURE.md) for the proposed adapter, evidence, session, and API boundaries.

## Conceptual Public Interfaces

- `VideoContext`: normalized source identity, page URL, title, current timestamp, optional duration/course context, and declared capabilities.
- `VideoCapabilities`: seek, transcript, visual-evidence, and authorized-ingestion availability.
- `EvidenceItem`: timestamped transcript or visual evidence with provenance and source metadata.
- `POST /learning-resources`: register a normalized resource/evidence manifest and return preparation status.
- `GET /learning-resources/{id}`: return readiness, capability, policy, or processing state.
- `POST /tutor-sessions`: start or resume a learner session for a resource.
- `POST /tutor-sessions/{id}/turns`: accept a question, explanation request, Socratic response, or knowledge-check response plus the current timestamp.

These are architecture targets, not implemented contracts. Exact wire schemas will be finalized when the platform-neutral foundation is implemented.

## Delivery Milestones

### 0. Feasibility and Policy Gates

- Run the documented spike against representative pages before adding a platform permission or adapter.
- Record transcript, seek, iframe, visual-evidence, authentication, DRM, and policy results.
- Assign an evidence-backed support state: `supported`, `limited`, `experimental`, or `blocked`.

### 1. Platform-Neutral Foundation

- Extract existing YouTube assumptions behind an adapter without regressing current behavior.
- Add the generic HTML5 adapter and capability reporting.
- Generalize extension messages and backend-facing resource identity.

### 2. Differentiated Tutor MVP

- Add grounded explanations and timestamp citations.
- Add Socratic follow-ups, short knowledge checks, targeted feedback, notes, and session progress.
- Support explicit transcript-only and unsupported states.

### 3. LMS Compatibility Profiles

- Test representative LMS pages and nested players.
- Add provider-specific adapters only when standard HTML5 access is insufficient and the approach is permitted.
- Publish compatibility at the player/capability level instead of claiming blanket LMS support.

### 4. Broader Educational Platforms

- Add Khan Academy after the generic foundation is stable.
- Reassess Udemy and Coursera using the same technical and policy gates.
- Expand to additional sites only when demand and feasibility justify the maintenance cost.

## Acceptance Criteria

- The current YouTube button and side-panel flow continue to work during future generalization.
- On a supported HTML5 educational video, the extension identifies the video, reads playback state, opens one tutor panel, and seeks to cited timestamps.
- The UI accurately distinguishes full grounding, transcript-only grounding, preparation, permission-required, policy-blocked, and unsupported states.
- Explanations, Socratic prompts, and knowledge checks cite lecture evidence and communicate uncertainty.
- Learner notes and progress persist independently of the 30-day evidence cache.
- Cached evidence is encrypted, user-isolated, automatically expired, and immediately deletable.
- Platform support is not announced until representative-page tests and a policy review pass.

## Assumptions

- **AI Video Tutor** is a working name; final branding is undecided.
- Initial users are individual learners using a Chrome/Chromium extension without an institution-installed LTI or REST integration.
- Chrome/Chromium remains the first browser, while platform-neutral contracts should avoid blocking a later Firefox port.
- The side panel remains the primary tutor interface.
- Feasibility and policy findings guide product decisions but are not legal advice.
