namespace SidePanel {
  const videoStatusSelector = "#video-status";
  const noVideoMessage = "Open a YouTube watch page to use AI Tutor.";
  const contextLoadErrorMessage = "Unable to read the current YouTube video.";

  function getVideoStatusElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(videoStatusSelector);
  }

  function setVideoStatus(message: string): void {
    const status = getVideoStatusElement();
    if (status === null) {
      return;
    }

    status.textContent = message;
  }

  function formatTimestamp(seconds: number): string {
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

  async function getActiveTabId(): Promise<number | null> {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

    return activeTab?.id ?? null;
  }

  async function getActiveVideoContext(): Promise<TutorMessages.VideoContext | null> {
    const tabId = await getActiveTabId();
    if (tabId === null) {
      return null;
    }

    const message: TutorMessages.GetVideoContextMessage = {
      type: "getVideoContext",
    };

    return chrome.tabs.sendMessage<
      TutorMessages.GetVideoContextMessage,
      TutorMessages.VideoContext | null
    >(tabId, message);
  }

  function getReadyMessage(context: TutorMessages.VideoContext): string {
    const timestamp = formatTimestamp(context.currentTimeSeconds);
    return `Ready for \u201c${context.title}\u201d at ${timestamp}.`;
  }

  async function loadVideoContext(): Promise<void> {
    const context = await getActiveVideoContext();
    if (context === null) {
      setVideoStatus(noVideoMessage);
      return;
    }

    setVideoStatus(getReadyMessage(context));
  }

  function handleVideoContextLoadFailure(error: unknown): void {
    setVideoStatus(contextLoadErrorMessage);
    console.error("Unable to load the current YouTube video context.", error);
  }

  void loadVideoContext().catch(handleVideoContextLoadFailure);
}
