"use strict";
var TutorServiceWorker;
(function (TutorServiceWorker) {
    const genericContentScriptPath = "dist/generic-content.js";
    const offscreenDocumentPath = "offscreen.html";
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
    function handleRuntimeMessage(message, sender, sendResponse) {
        if (isOpenTutorPanelMessage(message)) {
            const tabId = getSenderTabId(sender);
            if (tabId !== null) {
                void openTutorPanel(tabId).catch(logTutorPanelOpenFailure);
            }
            return;
        }
        if (isMessageWithType(message, "startCapture")) {
            void startCapture(message)
                .then(() => sendResponse({ status: "started" }))
                .catch((error) => {
                const errorMessage = error instanceof Error ? error.message : "Unable to start capture.";
                sendResponse({ status: "failed", message: errorMessage });
            });
            return true;
        }
        if (isMessageWithType(message, "stopCapture")) {
            void chrome.runtime.sendMessage({ type: "stopOffscreenCapture", target: "offscreen" })
                .then(() => sendResponse({ status: "stopped" }))
                .catch((error) => {
                const errorMessage = error instanceof Error ? error.message : "Unable to stop capture.";
                sendResponse({ status: "failed", message: errorMessage });
            });
            return true;
        }
        if (isMessageWithType(message, "getCaptureTimestamp")) {
            const timestampMessage = message;
            void getCaptureTimestamp(timestampMessage.tabId)
                .then(sendResponse)
                .catch(() => sendResponse(null));
            return true;
        }
    }
    async function ensureOffscreenDocument() {
        const contexts = await new Promise((resolve) => {
            chrome.runtime.getContexts({
                contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
                documentUrls: [chrome.runtime.getURL(offscreenDocumentPath)],
            }, resolve);
        });
        if (contexts.length > 0) {
            return;
        }
        await chrome.offscreen.createDocument({
            url: offscreenDocumentPath,
            reasons: [chrome.offscreen.Reason.USER_MEDIA],
            justification: "Transcribe video audio after the learner starts tutoring.",
        });
    }
    async function startCapture(message) {
        await ensureOffscreenDocument();
        const streamId = await new Promise((resolve, reject) => {
            chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId }, (value) => {
                const runtimeError = chrome.runtime.lastError;
                if (runtimeError !== undefined) {
                    reject(new Error(runtimeError.message));
                    return;
                }
                resolve(value);
            });
        });
        await chrome.runtime.sendMessage({
            type: "startOffscreenCapture",
            target: "offscreen",
            streamId,
            tabId: message.tabId,
            backendUrl: message.backendUrl,
            accessToken: message.accessToken,
            captureSessionId: message.captureSessionId,
        });
    }
    async function getCaptureTimestamp(tabId) {
        const message = { type: "getVideoContext" };
        const response = await chrome.tabs.sendMessage(tabId, message);
        if (response.status !== "ready") {
            return null;
        }
        return {
            currentTimeSeconds: response.context.currentTimeSeconds,
            isPlaying: response.context.isPlaying,
            playbackRate: response.context.playbackRate,
        };
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
