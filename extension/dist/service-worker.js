"use strict";
var TutorServiceWorker;
(function (TutorServiceWorker) {
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
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
})(TutorServiceWorker || (TutorServiceWorker = {}));
