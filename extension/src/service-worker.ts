namespace TutorServiceWorker {
  const genericContentScriptPath = "dist/generic-content.js";

  function isMessageWithType(message: unknown, expectedType: string): boolean {
    if (typeof message !== "object" || message === null) {
      return false;
    }

    return (message as { type?: unknown }).type === expectedType;
  }

  function isOpenTutorPanelMessage(message: unknown): message is TutorMessages.OpenTutorPanelMessage {
    return isMessageWithType(message, "openTutorPanel");
  }

  function getSenderTabId(sender: chrome.runtime.MessageSender): number | null {
    return sender.tab?.id ?? null;
  }

  async function openTutorPanel(tabId: number): Promise<void> {
    await chrome.sidePanel.open({ tabId });
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel.html",
      enabled: true,
    });
  }

  function logTutorPanelOpenFailure(error: unknown): void {
    console.error("Unable to open the AI Tutor side panel.", error);
  }

  function handleRuntimeMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
  ): void {
    if (!isOpenTutorPanelMessage(message)) {
      return;
    }

    const tabId = getSenderTabId(sender);
    if (tabId === null) {
      return;
    }

    void openTutorPanel(tabId).catch(logTutorPanelOpenFailure);
  }

  function isYouTubeUrl(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return hostname === "youtube.com" || hostname === "www.youtube.com";
    } catch {
      return false;
    }
  }

  function isInjectablePage(url: string): boolean {
    try {
      const protocol = new URL(url).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }

  async function injectGenericContentScript(tabId: number): Promise<void> {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [genericContentScriptPath],
    });
  }

  function logGenericContentScriptFailure(error: unknown): void {
    console.error("Unable to activate AI Video Tutor on this page.", error);
  }

  async function handleActionClicked(tab: chrome.tabs.Tab): Promise<void> {
    const tabId = tab.id;
    if (tabId === undefined) {
      return;
    }

    const tabUrl = tab.url ?? "";
    const panelPromise = openTutorPanel(tabId);
    if (isInjectablePage(tabUrl) && !isYouTubeUrl(tabUrl)) {
      try {
        await injectGenericContentScript(tabId);
      } catch (error: unknown) {
        logGenericContentScriptFailure(error);
      }
    }

    await panelPromise;
  }

  function handleActionClickFailure(error: unknown): void {
    console.error("Unable to activate the AI Video Tutor extension.", error);
  }

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  chrome.action.onClicked.addListener((tab) => {
    void handleActionClicked(tab).catch(handleActionClickFailure);
  });
}
