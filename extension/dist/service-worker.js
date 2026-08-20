"use strict";
var TutorServiceWorker;
(function (TutorServiceWorker) {
    const genericContentScriptPath = "dist/generic-content.js";
    function isMessageWithType(message, expectedType) {
        if (typeof message !== "object" || message === null) {
            return false;
        }
        return message.type === expectedType;
    }
    function isOpenTutorPanelMessage(message) {
        return isMessageWithType(message, "openTutorPanel");
    }
    function getSenderTabId(sender) {
        return sender.tab?.id ?? null;
    }
    async function openTutorPanel(tabId) {
        await chrome.sidePanel.open({ tabId });
        await chrome.sidePanel.setOptions({
            tabId,
            path: "sidepanel.html",
            enabled: true,
        });
    }
    function logTutorPanelOpenFailure(error) {
        console.error("Unable to open the AI Tutor side panel.", error);
    }
    function handleRuntimeMessage(message, sender) {
        if (!isOpenTutorPanelMessage(message)) {
            return;
        }
        const tabId = getSenderTabId(sender);
        if (tabId === null) {
            return;
        }
        void openTutorPanel(tabId).catch(logTutorPanelOpenFailure);
    }
    function isYouTubeUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            return hostname === "youtube.com" || hostname === "www.youtube.com";
        }
        catch {
            return false;
        }
    }
    function isInjectablePage(url) {
        try {
            const protocol = new URL(url).protocol;
            return protocol === "http:" || protocol === "https:";
        }
        catch {
            return false;
        }
    }
    async function injectGenericContentScript(tabId) {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: [genericContentScriptPath],
        });
    }
    function logGenericContentScriptFailure(error) {
        console.error("Unable to activate AI Video Tutor on this page.", error);
    }
    async function handleActionClicked(tab) {
        const tabId = tab.id;
        if (tabId === undefined) {
            return;
        }
        const tabUrl = tab.url ?? "";
        const panelPromise = openTutorPanel(tabId);
        if (isInjectablePage(tabUrl) && !isYouTubeUrl(tabUrl)) {
            try {
                await injectGenericContentScript(tabId);
            }
            catch (error) {
                logGenericContentScriptFailure(error);
            }
        }
        await panelPromise;
    }
    function handleActionClickFailure(error) {
        console.error("Unable to activate the AI Video Tutor extension.", error);
    }
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    chrome.action.onClicked.addListener((tab) => {
        void handleActionClicked(tab).catch(handleActionClickFailure);
    });
})(TutorServiceWorker || (TutorServiceWorker = {}));
