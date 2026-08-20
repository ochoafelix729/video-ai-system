"use strict";
var SidePanel;
(function (SidePanel) {
    const videoStatusSelector = "#video-status";
    const noVideoMessage = "Open a YouTube watch page to use AI Tutor.";
    const contextLoadErrorMessage = "Unable to read the current YouTube video.";
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
    async function loadVideoContext() {
        const context = await getActiveVideoContext();
        if (context === null) {
            setVideoStatus(noVideoMessage);
            return;
        }
        setVideoStatus(getReadyMessage(context));
    }
    function handleVideoContextLoadFailure(error) {
        setVideoStatus(contextLoadErrorMessage);
        console.error("Unable to load the current YouTube video context.", error);
    }
    void loadVideoContext().catch(handleVideoContextLoadFailure);
})(SidePanel || (SidePanel = {}));
