"use strict";
var TutorOffscreen;
(function (TutorOffscreen) {
    const chunkDurationMilliseconds = 60_000;
    const playbackPollMilliseconds = 1_000;
    const seekToleranceSeconds = 3;
    let activeCapture = null;
    function createAudioRecorder(media) {
        const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
        const supportedType = preferredTypes.find((value) => MediaRecorder.isTypeSupported(value));
        return supportedType === undefined
            ? new MediaRecorder(media)
            : new MediaRecorder(media, { mimeType: supportedType });
    }
    function clearRecorderStopTimer(capture) {
        if (capture.stopTimer !== null) {
            clearTimeout(capture.stopTimer);
            capture.stopTimer = null;
        }
    }
    function stopRecorder(capture) {
        clearRecorderStopTimer(capture);
        if (capture.recorder?.state === "recording") {
            capture.recorder.stop();
        }
    }
    async function queryPlayback(tabId) {
        const message = {
            type: "getCaptureTimestamp",
            tabId,
        };
        return chrome.runtime.sendMessage(message);
    }
    async function uploadChunk(capture, blob, sourceStartSeconds, sourceEndSeconds, discontinuityId) {
        if (blob.size === 0 || sourceEndSeconds <= sourceStartSeconds) {
            return;
        }
        const headers = {
            Authorization: `Bearer ${capture.accessToken}`,
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
        };
        const baseUrl = capture.backendUrl.replace(/\/$/, "");
        const createResponse = await fetch(`${baseUrl}/capture-sessions/${capture.captureSessionId}/chunks`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                source_start_seconds: sourceStartSeconds,
                source_end_seconds: sourceEndSeconds,
                discontinuity_id: discontinuityId,
                content_type: blob.type || "audio/webm",
                byte_length: blob.size,
            }),
        });
        if (!createResponse.ok) {
            throw new Error(`Unable to create audio chunk (${createResponse.status}).`);
        }
        const upload = await createResponse.json();
        const uploadResponse = await fetch(upload.upload_url, {
            method: "PUT",
            headers: upload.upload_headers,
            body: blob,
        });
        if (!uploadResponse.ok) {
            throw new Error(`Unable to upload audio chunk (${uploadResponse.status}).`);
        }
        const completeResponse = await fetch(`${baseUrl}/capture-chunks/${upload.id}/complete`, {
            method: "POST",
            headers: {
                ...headers,
                "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify({ etag: uploadResponse.headers.get("etag") }),
        });
        if (!completeResponse.ok) {
            throw new Error(`Unable to queue audio chunk (${completeResponse.status}).`);
        }
    }
    async function startRecorder(capture) {
        if (capture.stopped || capture.recorder !== null) {
            return;
        }
        const playback = await queryPlayback(capture.tabId);
        if (playback === null || !playback.isPlaying) {
            return;
        }
        const recorder = createAudioRecorder(capture.media);
        capture.recorder = recorder;
        capture.chunkStartSeconds = playback.currentTimeSeconds;
        recorderStartWallTime = Date.now();
        const discontinuityId = capture.discontinuityId;
        const sourceStartSeconds = playback.currentTimeSeconds;
        recorder.addEventListener("dataavailable", (event) => {
            void queryPlayback(capture.tabId).then((latest) => {
                const sourceEndSeconds = latest?.currentTimeSeconds ?? sourceStartSeconds;
                return uploadChunk(capture, event.data, sourceStartSeconds, sourceEndSeconds, discontinuityId);
            }).catch((error) => console.error("Unable to upload captured video audio.", error));
        }, { once: true });
        recorder.addEventListener("stop", () => {
            clearRecorderStopTimer(capture);
            capture.recorder = null;
            capture.chunkStartSeconds = null;
            if (!capture.stopped) {
                void startRecorder(capture);
            }
        }, { once: true });
        recorder.start();
        capture.stopTimer = window.setTimeout(() => recorder.stop(), chunkDurationMilliseconds);
    }
    async function pollPlayback(capture) {
        const playback = await queryPlayback(capture.tabId);
        const recorder = capture.recorder;
        if (playback === null || !playback.isPlaying) {
            stopRecorder(capture);
            return;
        }
        if (recorder === null) {
            capture.discontinuityId = crypto.randomUUID();
            await startRecorder(capture);
            return;
        }
        if (capture.chunkStartSeconds !== null) {
            const elapsed = (Date.now() - recorderStartWallTime) / 1000;
            const expected = capture.chunkStartSeconds + elapsed * playback.playbackRate;
            if (Math.abs(playback.currentTimeSeconds - expected) > seekToleranceSeconds) {
                capture.discontinuityId = crypto.randomUUID();
                stopRecorder(capture);
            }
        }
    }
    let recorderStartWallTime = Date.now();
    async function beginCapture(configuration) {
        await stopCapture();
        const media = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: "tab",
                    chromeMediaSourceId: configuration.streamId,
                },
            },
            video: false,
        });
        const audioContext = new AudioContext();
        audioContext.createMediaStreamSource(media).connect(audioContext.destination);
        const capture = {
            ...configuration,
            media,
            audioContext,
            recorder: null,
            chunkStartSeconds: null,
            discontinuityId: crypto.randomUUID(),
            stopTimer: null,
            pollTimer: null,
            stopped: false,
        };
        activeCapture = capture;
        recorderStartWallTime = Date.now();
        await startRecorder(capture);
        capture.pollTimer = window.setInterval(() => {
            void pollPlayback(capture).catch((error) => {
                console.error("Unable to track captured playback.", error);
            });
        }, playbackPollMilliseconds);
    }
    async function stopCapture() {
        const capture = activeCapture;
        if (capture === null) {
            return;
        }
        capture.stopped = true;
        clearRecorderStopTimer(capture);
        if (capture.pollTimer !== null) {
            clearInterval(capture.pollTimer);
        }
        stopRecorder(capture);
        for (const track of capture.media.getTracks()) {
            track.stop();
        }
        await capture.audioContext.close();
        activeCapture = null;
    }
    chrome.runtime.onMessage.addListener((message) => {
        if (typeof message !== "object" || message === null) {
            return;
        }
        const value = message;
        if (value.target !== "offscreen") {
            return;
        }
        if (value.type === "startOffscreenCapture") {
            void beginCapture(message);
        }
        if (value.type === "stopOffscreenCapture") {
            void stopCapture();
        }
    });
})(TutorOffscreen || (TutorOffscreen = {}));
