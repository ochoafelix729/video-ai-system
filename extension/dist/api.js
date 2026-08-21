"use strict";
var TutorApi;
(function (TutorApi) {
    function createIdempotencyKey() {
        return crypto.randomUUID();
    }
    async function request(backendUrl, accessToken, path, init) {
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
        return await response.json();
    }
    function serializeContext(context) {
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
    async function registerResource(backendUrl, accessToken, context) {
        return request(backendUrl, accessToken, "/learning-resources", {
            method: "POST",
            body: JSON.stringify({ context: serializeContext(context) }),
        });
    }
    TutorApi.registerResource = registerResource;
    async function startCaptureSession(backendUrl, accessToken, resourceId) {
        return request(backendUrl, accessToken, `/learning-resources/${resourceId}/capture-sessions`, {
            method: "POST",
            body: JSON.stringify({ consented_at: new Date().toISOString() }),
        });
    }
    TutorApi.startCaptureSession = startCaptureSession;
    async function stopCaptureSession(backendUrl, accessToken, captureSessionId) {
        const response = await fetch(`${backendUrl.replace(/\/$/, "")}/capture-sessions/${captureSessionId}/stop`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Idempotency-Key": createIdempotencyKey(),
            },
        });
        if (!response.ok) {
            throw new Error(`Unable to stop the backend capture session (${response.status}).`);
        }
    }
    TutorApi.stopCaptureSession = stopCaptureSession;
    async function createTutorSession(backendUrl, accessToken, resourceId) {
        return request(backendUrl, accessToken, "/tutor-sessions", {
            method: "POST",
            body: JSON.stringify({ resource_id: resourceId }),
        });
    }
    TutorApi.createTutorSession = createTutorSession;
    async function uploadTranscriptCues(backendUrl, accessToken, resourceId, cues) {
        const response = await request(backendUrl, accessToken, `/learning-resources/${resourceId}/transcript-evidence`, {
            method: "POST",
            body: JSON.stringify({
                cues: cues.map((cue) => ({
                    start_seconds: cue.startSeconds,
                    end_seconds: cue.endSeconds,
                    text: cue.text,
                })),
            }),
        });
        return response.segments_created;
    }
    TutorApi.uploadTranscriptCues = uploadTranscriptCues;
    async function createTurn(backendUrl, accessToken, sessionId, learnerInput, currentTimeSeconds) {
        return request(backendUrl, accessToken, `/tutor-sessions/${sessionId}/turns`, {
            method: "POST",
            body: JSON.stringify({
                intent: "question",
                learner_input: learnerInput,
                current_time_seconds: currentTimeSeconds,
            }),
        });
    }
    TutorApi.createTurn = createTurn;
})(TutorApi || (TutorApi = {}));
