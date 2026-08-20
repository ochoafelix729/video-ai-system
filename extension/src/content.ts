namespace ContentScript {
  const tutorButtonId = "youtube-ai-tutor-button";
  const tutorButtonContainerId = "youtube-ai-tutor-button-container";
  const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;
  const buttonTargetSelector =
    "ytd-watch-flexy #below ytd-watch-metadata #actions #top-level-buttons-computed";

  let buttonCheckAnimationFrameId: number | undefined;

  function getVideoId(url: URL): string | null {
    if (url.pathname !== "/watch") {
      return null;
    }

    const videoId = url.searchParams.get("v");
    if (videoId === null || !youtubeVideoIdPattern.test(videoId)) {
      return null;
    }

    return videoId;
  }

  function getCurrentVideoId(): string | null {
    return getVideoId(new URL(window.location.href));
  }

  function getVideoContext(): TutorMessages.VideoContext | null {
    const videoId = getCurrentVideoId();
    const player = document.querySelector<HTMLVideoElement>("video.html5-main-video");

    if (videoId === null || player === null) {
      return null;
    }

    return {
      videoId,
      videoUrl: window.location.href,
      title: document.title.replace(" - YouTube", ""),
      currentTimeSeconds: player.currentTime,
    };
  }

  function isMessageWithType(message: unknown, expectedType: string): boolean {
    if (typeof message !== "object" || message === null) {
      return false;
    }

    return (message as { type?: unknown }).type === expectedType;
  }

  function isGetVideoContextMessage(message: unknown): message is TutorMessages.GetVideoContextMessage {
    return isMessageWithType(message, "getVideoContext");
  }

  function openTutorPanel(): void {
    const message: TutorMessages.OpenTutorPanelMessage = {
      type: "openTutorPanel",
    };

    void chrome.runtime.sendMessage(message);
  }

  function createTutorButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.id = tutorButtonId;
    button.type = "button";
    button.textContent = "AI Tutor";
    button.setAttribute("aria-label", "Open AI Tutor");
    button.addEventListener("click", openTutorPanel);
    return button;
  }

  function removeTutorButton(): void {
    document.getElementById(tutorButtonContainerId)?.remove();
  }

  function scheduleTutorButtonCheck(): void {
    if (buttonCheckAnimationFrameId !== undefined) {
      return;
    }

    buttonCheckAnimationFrameId = window.requestAnimationFrame(() => {
      buttonCheckAnimationFrameId = undefined;
      ensureTutorButton();
    });
  }

  function placeTutorButton(target: HTMLElement): void {
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

  function ensureTutorButton(): void {
    if (getCurrentVideoId() === null) {
      removeTutorButton();
      return;
    }

    const target = document.querySelector<HTMLElement>(buttonTargetSelector);
    if (target === null) {
      return;
    }

    placeTutorButton(target);
  }

  function handleRuntimeMessage(
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: TutorMessages.VideoContext | null) => void,
  ): void {
    if (!isGetVideoContextMessage(message)) {
      return;
    }

    sendResponse(getVideoContext());
  }

  function observeYouTubePageChanges(): void {
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
}
