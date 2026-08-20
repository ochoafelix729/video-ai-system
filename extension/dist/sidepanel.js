"use strict";
var SidePanel;
(function (SidePanel) {
    const videoStatusSelector = "#video-status";
    const noVideoMessage = "No supported video was found on this page.";
    const activationMessage = "Click the AI Video Tutor toolbar icon on a video page to start.";
    function getVideoStatusElement() {
        return document.querySelector(videoStatusSelector);
    }
    function setVideoStatus(message) {
        const status = getVideoStatusElement();
        if (status === null) {
            return;
        }
        status.textContent = message;
    }
    function formatTimestamp(seconds) {
        const totalSeconds = Math.max(0, Math.floor(seconds));
        const hours = Math.floor(totalSeconds / 3_600);
        const minutes = Math.floor((totalSeconds % 3_600) / 60);
        const remainingSeconds = totalSeconds % 60;
        const paddedMinutes = minutes.toString().padStart(2, "0");
        const paddedSeconds = remainingSeconds.toString().padStart(2, "0");
        if (hours > 0) {
            return `${hours}:${paddedMinutes}:${paddedSeconds}`;
        }
        return `${minutes}:${paddedSeconds}`;
    }
    async function getActiveTabId() {
        const [activeTab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
        });
        return activeTab?.id ?? null;
    }
    async function getActiveVideoContext() {
        const tabId = await getActiveTabId();
        if (tabId === null) {
            return null;
        }
        const message = {
            type: "getVideoContext",
        };
        return chrome.tabs.sendMessage(tabId, message);
    }
    function getReadyMessage(context) {
        const timestamp = formatTimestamp(context.currentTimeSeconds);
        return `Ready for \u201c${context.title}\u201d at ${timestamp}.`;
    }
    function getEmbeddedPlayerMessage(providerHosts) {
        if (providerHosts.length === 0) {
            return "This page uses an embedded video player that needs a provider-specific adapter.";
        }
        return `Embedded video detected (${providerHosts.join(", ")}). A provider-specific adapter is required.`;
    }
    async function loadVideoContext() {
        const response = await getActiveVideoContext();
        if (response === null || response.status === "no_video") {
            setVideoStatus(noVideoMessage);
            return;
        }
        if (response.status === "embedded_player") {
            setVideoStatus(getEmbeddedPlayerMessage(response.providerHosts));
            return;
        }
        setVideoStatus(getReadyMessage(response.context));
    }
    function handleVideoContextLoadFailure(error) {
        setVideoStatus(activationMessage);
        console.error("Unable to load the current video context.", error);
    }
    function handleRuntimeMessage(message) {
        if (typeof message !== "object" || message === null) {
            return;
        }
        if (message.type !== "videoContextReady") {
            return;
        }
        void loadVideoContext().catch(handleVideoContextLoadFailure);
    }
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    void loadVideoContext().catch(handleVideoContextLoadFailure);
})(SidePanel || (SidePanel = {}));
