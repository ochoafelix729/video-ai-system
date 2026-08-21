namespace TutorApi {
  export interface ResourceResponse {
    id: string;
    state: string;
  }

  export interface SessionResponse {
    id: string;
  }

  export interface Citation {
    evidence_id: string;
    start_seconds: number;
    end_seconds?: number;
    label: string;
  }

  export interface TurnResponse {
    id: string;
    content: string;
    citations: Citation[];
    tutoring_action: string;
    uncertainty_reason?: string;
  }

  function createIdempotencyKey(): string {
    return crypto.randomUUID();
  }

  async function request<T>(
    backendUrl: string,
    accessToken: string,
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await fetch(`${backendUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": createIdempotencyKey(),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Tutor API request failed (${response.status}): ${message}`);
    }
    return await response.json() as T;
  }

  function serializeContext(context: TutorMessages.VideoContext): object {
    return {
      source: {
        platform: context.source.platform,
        source_id: context.source.sourceId,
        page_url: context.source.pageUrl,
      },
      title: context.title,
      current_time_seconds: context.currentTimeSeconds,
      duration_seconds: context.durationSeconds,
      capabilities: {
        seek: context.capabilities.seek,
        transcript: context.capabilities.transcript,
        visual_evidence: context.capabilities.visualEvidence,
        ingestion: context.capabilities.ingestion,
      },
    };
  }

  export async function registerResource(
    backendUrl: string,
    accessToken: string,
    context: TutorMessages.VideoContext,
  ): Promise<ResourceResponse> {
    return request(backendUrl, accessToken, "/learning-resources", {
      method: "POST",
      body: JSON.stringify({ context: serializeContext(context) }),
    });
  }

  export async function startCaptureSession(
    backendUrl: string,
    accessToken: string,
    resourceId: string,
  ): Promise<SessionResponse> {
    return request(backendUrl, accessToken, `/learning-resources/${resourceId}/capture-sessions`, {
      method: "POST",
      body: JSON.stringify({ consented_at: new Date().toISOString() }),
    });
  }

  export async function stopCaptureSession(
    backendUrl: string,
    accessToken: string,
    captureSessionId: string,
  ): Promise<void> {
    const response = await fetch(
      `${backendUrl.replace(/\/$/, "")}/capture-sessions/${captureSessionId}/stop`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Idempotency-Key": createIdempotencyKey(),
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Unable to stop the backend capture session (${response.status}).`);
    }
  }

  export async function createTutorSession(
    backendUrl: string,
    accessToken: string,
    resourceId: string,
  ): Promise<SessionResponse> {
    return request(backendUrl, accessToken, "/tutor-sessions", {
      method: "POST",
      body: JSON.stringify({ resource_id: resourceId }),
    });
  }

  export async function uploadTranscriptCues(
    backendUrl: string,
    accessToken: string,
    resourceId: string,
    cues: TutorMessages.TranscriptCue[],
  ): Promise<number> {
    const response = await request<{ segments_created: number }>(
      backendUrl,
      accessToken,
      `/learning-resources/${resourceId}/transcript-evidence`,
      {
        method: "POST",
        body: JSON.stringify({
          cues: cues.map((cue) => ({
            start_seconds: cue.startSeconds,
            end_seconds: cue.endSeconds,
            text: cue.text,
          })),
        }),
      },
    );
    return response.segments_created;
  }

  export async function createTurn(
    backendUrl: string,
    accessToken: string,
    sessionId: string,
    learnerInput: string,
    currentTimeSeconds: number,
  ): Promise<TurnResponse> {
    return request(backendUrl, accessToken, `/tutor-sessions/${sessionId}/turns`, {
      method: "POST",
      body: JSON.stringify({
        intent: "question",
        learner_input: learnerInput,
        current_time_seconds: currentTimeSeconds,
      }),
    });
  }
}
