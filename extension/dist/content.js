"use strict";
var ContentScript;
(function (ContentScript) {
    const tutorButtonId = "youtube-ai-tutor-button";
    const tutorButtonContainerId = "youtube-ai-tutor-button-container";
    const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;
    const buttonTargetSelector = "ytd-watch-flexy #below ytd-watch-metadata #actions #top-level-buttons-computed";
    let buttonCheckAnimationFrameId;
    function getVideoId(url) {
        if (url.pathname !== "/watch") {
            return null;
        }
        const videoId = url.searchParams.get("v");
        if (videoId === null || !youtubeVideoIdPattern.test(videoId)) {
            return null;
        }
        return videoId;
    }
    function getCurrentVideoId() {
        return getVideoId(new URL(window.location.href));
    }
    function getVideoContext() {
        const videoId = getCurrentVideoId();
        const player = document.querySelector("video.html5-main-video");
        if (videoId === null || player === null) {
            return null;
        }
        const durationSeconds = Number.isFinite(player.duration) && player.duration > 0
            ? player.duration
            : undefined;
        return {
            source: {
                platform: "youtube",
                sourceId: videoId,
                pageUrl: window.location.href,
            },
            title: document.title.replace(" - YouTube", ""),
            currentTimeSeconds: player.currentTime,
            durationSeconds,
            isPlaying: !player.paused && !player.ended,
            playbackRate: player.playbackRate,
            capabilities: {
                seek: player.seekable.length > 0 ? "available" : "unavailable",
                transcript: "unavailable",
                visualEvidence: "user_tab_capture",
                ingestion: "browser_evidence",
            },
        };
    }
    function getVideoContextResponse() {
        const context = getVideoContext();
        if (context === null) {
            return { status: "no_video" };
        }
        return {
            status: "ready",
            context,
        };
    }
    function isMessageWithType(message, expectedType) {
        if (typeof message !== "object" || message === null) {
            return false;
        }
        return message.type === expectedType;
    }
    function isGetVideoContextMessage(message) {
        return isMessageWithType(message, "getVideoContext");
    }
    function getTranscriptCues() {
        const player = document.querySelector("video.html5-main-video");
        if (player === null) {
            return [];
        }
        const cues = [];
        for (const track of Array.from(player.textTracks)) {
            if (track.cues === null) {
                continue;
            }
            for (const cue of Array.from(track.cues)) {
                const text = "text" in cue && typeof cue.text === "string" ? cue.text.trim() : "";
                if (text) {
                    cues.push({ startSeconds: cue.startTime, endSeconds: cue.endTime, text });
                }
            }
        }
        return cues;
    }
    function openTutorPanel() {
        const message = {
            type: "openTutorPanel",
        };
        void chrome.runtime.sendMessage(message);
    }
    function createTutorButton() {
        const button = document.createElement("button");
        button.id = tutorButtonId;
        button.type = "button";
        button.textContent = "AI Tutor";
        button.setAttribute("aria-label", "Open AI Tutor");
        button.addEventListener("click", openTutorPanel);
        return button;
    }
    function removeTutorButton() {
        document.getElementById(tutorButtonContainerId)?.remove();
    }
    function scheduleTutorButtonCheck() {
        if (buttonCheckAnimationFrameId !== undefined) {
            return;
        }
        buttonCheckAnimationFrameId = window.requestAnimationFrame(() => {
            buttonCheckAnimationFrameId = undefined;
            ensureTutorButton();
        });
    }
    function placeTutorButton(target) {
        const existingContainer = document.getElementById(tutorButtonContainerId);
        if (existingContainer !== null) {
            const existingButton = document.getElementById(tutorButtonId);
            if (existingButton?.parentElement !== existingContainer) {
                existingButton?.remove();
                existingContainer.append(createTutorButton());
            }
            if (existingContainer.parentElement !== target) {
                target.append(existingContainer);
            }
            return;
        }
        document.getElementById(tutorButtonId)?.remove();
        const newContainer = document.createElement("div");
        newContainer.id = tutorButtonContainerId;
        newContainer.append(createTutorButton());
        target.append(newContainer);
    }
    function ensureTutorButton() {
        if (getCurrentVideoId() === null) {
            removeTutorButton();
            return;
        }
        const target = document.querySelector(buttonTargetSelector);
        if (target === null) {
            return;
        }
        placeTutorButton(target);
    }
    function handleRuntimeMessage(message, _sender, sendResponse) {
        if (isGetVideoContextMessage(message)) {
            sendResponse(getVideoContextResponse());
            return;
        }
        if (isMessageWithType(message, "getTranscriptCues")) {
            const response = { cues: getTranscriptCues() };
            sendResponse(response);
        }
    }
    function observeYouTubePageChanges() {
        const pageObserver = new MutationObserver(scheduleTutorButtonCheck);
        pageObserver.observe(document, {
            childList: true,
            subtree: true,
        });
    }
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    document.addEventListener("yt-navigate-finish", scheduleTutorButtonCheck);
    observeYouTubePageChanges();
    ensureTutorButton();
})(ContentScript || (ContentScript = {}));
