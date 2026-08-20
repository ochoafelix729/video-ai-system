"use strict";
var GenericContentScript;
(function (GenericContentScript) {
    const minimumEmbeddedPlayerWidth = 240;
    const minimumEmbeddedPlayerHeight = 135;
    const installationState = globalThis;
    function isMessageWithType(message, expectedType) {
        if (typeof message !== "object" || message === null) {
            return false;
        }
        return message.type === expectedType;
    }
    function isGetVideoContextMessage(message) {
        return isMessageWithType(message, "getVideoContext");
    }
    function getElementArea(element) {
        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) {
            return 0;
        }
        const ownerWindow = element.ownerDocument?.defaultView;
        const style = ownerWindow?.getComputedStyle(element);
        if (style?.display === "none" || style?.visibility === "hidden") {
            return 0;
        }
        return bounds.width * bounds.height;
    }
    function getProviderHost(frame) {
        const source = frame.getAttribute("src");
        if (source === null || source.trim() === "") {
            return null;
        }
        try {
            return new URL(source, window.location.href).hostname || null;
        }
        catch {
            return null;
        }
    }
    function scanDocument(currentDocument, result, visitedDocuments) {
        if (visitedDocuments.has(currentDocument)) {
            return;
        }
        visitedDocuments.add(currentDocument);
        for (const video of Array.from(currentDocument.querySelectorAll("video"))) {
            const area = getElementArea(video);
            if (area === 0) {
                continue;
            }
            result.candidates.push({
                video,
                index: result.candidates.length,
                area,
                isPlaying: !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
            });
        }
        for (const frame of Array.from(currentDocument.querySelectorAll("iframe"))) {
            const area = getElementArea(frame);
            if (area === 0) {
                continue;
            }
            let childDocument = null;
            try {
                childDocument = frame.contentDocument;
            }
            catch {
                childDocument = null;
            }
            if (childDocument !== null) {
                scanDocument(childDocument, result, visitedDocuments);
                continue;
            }
            const bounds = frame.getBoundingClientRect();
            if (bounds.width < minimumEmbeddedPlayerWidth
                || bounds.height < minimumEmbeddedPlayerHeight) {
                continue;
            }
            const providerHost = getProviderHost(frame);
            if (providerHost !== null) {
                result.providerHosts.add(providerHost);
            }
        }
    }
    function scanPage() {
        const result = {
            candidates: [],
            providerHosts: new Set(),
        };
        scanDocument(document, result, new Set());
        return result;
    }
    function selectVideoCandidate(candidates) {
        if (candidates.length === 0) {
            return null;
        }
        return [...candidates].sort((left, right) => {
            if (left.isPlaying !== right.isPlaying) {
                return left.isPlaying ? -1 : 1;
            }
            return right.area - left.area;
        })[0];
    }
    function getSanitizedPageUrl() {
        const pageUrl = new URL(window.location.href);
        pageUrl.search = "";
        pageUrl.hash = "";
        return pageUrl.toString();
    }
    function getVideoTitle(video) {
        const accessibleLabel = video.getAttribute("aria-label")?.trim();
        if (accessibleLabel) {
            return accessibleLabel;
        }
        const elementTitle = video.getAttribute("title")?.trim();
        if (elementTitle) {
            return elementTitle;
        }
        return document.title.trim() || "Educational video";
    }
    function createVideoContext(candidate) {
        const { video } = candidate;
        const pageUrl = getSanitizedPageUrl();
        const durationSeconds = Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : undefined;
        return {
            source: {
                platform: "generic_html5",
                sourceId: `${pageUrl}#video-${candidate.index}`,
                pageUrl,
            },
            title: getVideoTitle(video),
            currentTimeSeconds: video.currentTime,
            durationSeconds,
            capabilities: {
                seek: video.seekable.length > 0 ? "available" : "unavailable",
                transcript: "unavailable",
                visualEvidence: "unavailable",
                ingestion: "unavailable",
            },
        };
    }
    function getVideoContextResponse() {
        const scanResult = scanPage();
        const candidate = selectVideoCandidate(scanResult.candidates);
        if (candidate !== null) {
            return {
                status: "ready",
                context: createVideoContext(candidate),
            };
        }
        const providerHosts = [...scanResult.providerHosts].sort();
        if (providerHosts.length > 0) {
            return {
                status: "embedded_player",
                providerHosts,
            };
        }
        return { status: "no_video" };
    }
    function handleRuntimeMessage(message, _sender, sendResponse) {
        if (!isGetVideoContextMessage(message)) {
            return;
        }
        sendResponse(getVideoContextResponse());
    }
    function install() {
        if (installationState.aiVideoTutorGenericInstalled === true) {
            return;
        }
        installationState.aiVideoTutorGenericInstalled = true;
        chrome.runtime.onMessage.addListener(handleRuntimeMessage);
        const readyMessage = {
            type: "videoContextReady",
        };
        void chrome.runtime.sendMessage(readyMessage).catch(() => {
            // The side panel may not have finished loading yet; its initial query is the fallback.
        });
    }
    install();
})(GenericContentScript || (GenericContentScript = {}));
