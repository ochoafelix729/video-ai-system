namespace TutorServiceWorker {
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

  function handleRuntimeMessage(message: unknown, sender: chrome.runtime.MessageSender): void {
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
}
