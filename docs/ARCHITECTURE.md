# Platform-Neutral AI Video Tutor Architecture

## Goals

- Keep site-specific DOM and player logic out of the tutor, API, and evidence model.
- Represent what each active video can actually support instead of inferring capabilities from its domain.
- Ground every explanation, Socratic prompt, and knowledge check in timestamped evidence.
- Preserve learner notes and progress while bounding retention of lecture-derived evidence.
- Add platforms only after the feasibility and policy gates in [Platform Feasibility](PLATFORM-FEASIBILITY.md) pass.

## High-Level Flow

1. The content script discovers candidate players and selects an adapter.
2. The adapter returns a normalized `VideoContext` and capability set.
3. After the learner starts tutoring, the extension gathers only the evidence allowed by that adapter's policy profile.
4. The API registers the learning resource and returns readiness or a degraded/blocked state.
5. The worker normalizes permitted transcript and visual evidence into timestamped index segments.
6. A tutor turn retrieves relevant segments using the learner's prompt and current playback time.
7. The tutor produces a grounded response, citation list, and optional learning-loop action.
8. Notes and progress are saved separately; permitted lecture evidence expires after 30 days.

## Extension Boundaries

### Platform Adapter

Each adapter owns only the behavior needed to interact with one page/player profile:

- Decide whether the adapter matches the current page or frame.
- Identify candidate media and choose the active educational video.
- Read stable source identity, title, playback state, and optional course/module context.
- Declare capabilities instead of throwing when an optional feature is unavailable.
- Seek the correct player to a timestamp.
- Expose transcript cues or visual evidence only through a reviewed mechanism.
- Observe navigation/player replacement and invalidate stale context.

The initial adapter set is:

- Existing YouTube behavior behind the common contract.
- Generic HTML5 media using standard browser APIs.
- Provider-specific adapters added later only when feasibility results justify them.

### Normalized Context

The future TypeScript contract should express this shape without leaking site-specific selectors or APIs:

```ts
interface VideoContext {
  source: {
    platform: string;
    sourceId: string;
    pageUrl: string;
  };
  title: string;
  currentTimeSeconds: number;
  durationSeconds?: number;
  courseContext?: {
    courseId?: string;
    courseTitle?: string;
    moduleId?: string;
    moduleTitle?: string;
  };
  capabilities: VideoCapabilities;
}

interface VideoCapabilities {
  seek: "available" | "unavailable";
  transcript: "browser" | "authorized_api" | "unavailable";
  visualEvidence: "cors_frame" | "user_tab_capture" | "authorized_media" | "unavailable";
  ingestion: "browser_evidence" | "authorized_media" | "unavailable";
}
```

The final implementation may use stricter unions for registered platforms, but unknown or generic sources must remain representable.

### Frames and Permissions

- Start with isolated-world content scripts and standard DOM/media APIs.
- Use a main-world bridge only when a reviewed adapter requires page-owned player state; validate all bridge messages as untrusted input.
- Support nested players with narrowly scoped frame matches and host permissions. Do not request `<all_urls>` as the default strategy.
- Require a clear learner action before tab capture or evidence upload begins.
- Display the selected video and active evidence capabilities before processing.

## Evidence Model

```ts
interface EvidenceItem {
  kind: "transcript" | "visual";
  startSeconds: number;
  endSeconds?: number;
  text?: string;
  assetReference?: string;
  provenance: {
    platform: string;
    sourceId: string;
    method: string;
  };
}
```

- Transcript items contain compact, timestamped cues or merged segments.
- Visual items contain an authorized frame reference plus a timestamp and model-generated description.
- Every indexed item retains provenance independently of answer prose.
- Retrieval may favor evidence near the current playback time but must still return the most relevant support.
- Responses identify transcript-only grounding and avoid unsupported visual claims.
- Evidence is never shared between users, even when the source identity matches.

## Tutor Session Model

A tutor session is associated with one learner and one learning resource. Each turn has one intent:

- `question`: answer a learner's direct question with evidence.
- `explain`: reteach or restate a concept at a requested depth.
- `socratic`: ask a guided question, evaluate the response, and choose the next prompt.
- `knowledge_check`: generate or evaluate a short, ungraded check based on retrieved evidence.

The tutor may propose notes or progress updates, but the learner can edit or delete them. Progress records concepts practiced and self-contained check outcomes; it must not claim formal mastery, grades, or course completion.

The extension remains video-only. It does not collect nearby quiz questions, assignment text, answer choices, grade data, or submission state.

## API Direction

The current YouTube-only conceptual API evolves into these platform-neutral resources:

- `POST /learning-resources`: accept normalized context and an evidence manifest; return a resource ID, preparation state, and effective capabilities.
- `GET /learning-resources/{id}`: return `preparing`, `ready`, `limited`, `permission_required`, `policy_blocked`, `unsupported`, or `failed` with an actionable reason.
- `POST /tutor-sessions`: create or resume a user-scoped session for a resource.
- `POST /tutor-sessions/{id}/turns`: accept the intent, learner input, and optional current timestamp; return tutor content, evidence citations, and proposed session updates.
- `DELETE /learning-resources/{id}/evidence`: immediately purge the user's cached lecture evidence.

Request and response schemas must be defined once and validated by both the extension boundary and backend. Backend credentials and platform session tokens never enter content-script configuration.

## Storage and Retention

Maintain three separate lifecycles:

| Data | Default retention | Requirements |
| --- | --- | --- |
| Raw source media | None | Temporary use only in an authorized ingestion workflow; delete after evidence extraction |
| Transcript/frame evidence and index segments | 30 days | Per-user isolation, encryption in transit and at rest, automatic expiry, immediate user deletion, no cross-user reuse |
| Learner notes, questions, and progress | Until user deletion | User-scoped, editable/deletable, stored separately from lecture evidence |

An adapter's policy profile may shorten evidence retention, require transient processing, or disable processing. It may never silently broaden retention beyond these defaults.

## Failure and Degraded States

- Multiple players: ask the learner to select when the active video cannot be determined reliably.
- Missing transcript: use permitted visual/audio evidence only if declared; otherwise explain that grounded tutoring is unavailable.
- Missing visual access: continue transcript-only and label the limitation.
- Cross-origin frame: request only the required host access or mark the player unsupported.
- DRM or access control: do not bypass it; use separately permitted transcript evidence or stop.
- Navigation or player replacement: invalidate stale context and citations before accepting another turn.
- Evidence conflict or low confidence: state uncertainty and cite the competing moments.
- Expired evidence: re-prepare through the current permitted mechanism after learner confirmation.

## Verification Strategy

- Contract tests for context, capability, evidence, session, and status schemas.
- Shared adapter tests for detection, stable identity, playback state, seeking, navigation, and unsupported behavior.
- Adapter-specific fixtures for DOM/player differences without live credentials.
- Retrieval tests for current-moment bias, transcript/visual provenance, and uncertainty.
- Tutor tests for evidence-grounded explanations, Socratic progression, knowledge-check feedback, and refusal to infer unavailable visuals.
- Privacy tests for user isolation, 30-day expiry, immediate purge, and raw-media cleanup.
- Manual representative-page tests required by the platform feasibility gate before support status changes.
