namespace SidePanel {
  const videoStatusSelector = "#video-status";
  const noVideoMessage = "No supported video was found on this page.";
  const activationMessage = "Click the AI Video Tutor toolbar icon on a video page to start.";
  let activeContext: TutorMessages.VideoContext | null = null;
  let activeTabId: number | null = null;
  let runtimeConfig: TutorConfig.RuntimeConfig | null = null;
  let accessToken: string | null = null;
  let resourceId: string | null = null;
  let tutorSessionId: string | null = null;
  let captureSessionId: string | null = null;
  let captureActive = false;

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

  function getCaptureButton(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>("#capture-button");
  }

  function getQuestionForm(): HTMLFormElement | null {
    return document.querySelector<HTMLFormElement>("#question-form");
  }

  function setQuestionEnabled(enabled: boolean): void {
    const form = getQuestionForm();
    const textarea = form?.querySelector<HTMLTextAreaElement>("#question");
    const button = form?.querySelector<HTMLButtonElement>("button[type='submit']");
    if (textarea) {
      textarea.disabled = !enabled;
    }
    if (button) {
      button.disabled = !enabled;
    }
  }

  function addMessage(kind: "user" | "tutor", content: string, citations: string[] = []): void {
    const conversation = document.querySelector<HTMLElement>("#conversation");
    if (conversation === null) {
      return;
    }
    const wrapper = document.createElement("article");
    wrapper.className = `message ${kind}`;
    wrapper.textContent = content;
    if (citations.length > 0) {
      const citationLine = document.createElement("p");
      citationLine.className = "citations";
      citationLine.textContent = `Video evidence: ${citations.join(", ")}`;
      wrapper.append(citationLine);
    }
    conversation.append(wrapper);
  }

  async function getActiveVideoContext(): Promise<TutorMessages.VideoContextResponse | null> {
    const tabId = await getActiveTabId();
    if (tabId === null) {
      return null;
    }

    const message: TutorMessages.GetVideoContextMessage = {
      type: "getVideoContext",
    };

    return chrome.tabs.sendMessage<
      TutorMessages.GetVideoContextMessage,
      TutorMessages.VideoContextResponse
    >(tabId, message);
  }

  function getReadyMessage(context: TutorMessages.VideoContext): string {
    const timestamp = formatTimestamp(context.currentTimeSeconds);
    return `Ready for \u201c${context.title}\u201d at ${timestamp}.`;
  }

  function getEmbeddedPlayerMessage(providerHosts: string[]): string {
    if (providerHosts.length === 0) {
      return "This page uses an embedded video player that needs a provider-specific adapter.";
    }

    return `Embedded video detected (${providerHosts.join(", ")}). A provider-specific adapter is required.`;
  }

  async function loadVideoContext(): Promise<void> {
    const response = await getActiveVideoContext();
    if (response === null || response.status === "no_video") {
      setVideoStatus(noVideoMessage);
      return;
    }

    if (response.status === "embedded_player") {
      setVideoStatus(getEmbeddedPlayerMessage(response.providerHosts));
      return;
    }
    activeContext = response.context;
    activeTabId = await getActiveTabId();
    setVideoStatus(getReadyMessage(response.context));
    const captureButton = getCaptureButton();
    if (captureButton !== null) {
      captureButton.disabled = false;
    }
  }

  async function ensureBackendState(): Promise<{
    config: TutorConfig.RuntimeConfig;
    token: string;
    resource: string;
  }> {
    if (activeContext === null) {
      throw new Error("No active video is available.");
    }
    runtimeConfig ??= await TutorConfig.load();
    accessToken ??= await TutorAuth.getAccessToken(runtimeConfig);
    if (resourceId === null) {
      const resource = await TutorApi.registerResource(runtimeConfig.backendUrl, accessToken, activeContext);
      resourceId = resource.id;
    }
    return { config: runtimeConfig, token: accessToken, resource: resourceId };
  }

  async function toggleCapture(): Promise<void> {
    const button = getCaptureButton();
    if (button === null || activeTabId === null) {
      return;
    }
    button.disabled = true;
    if (captureActive) {
      const response = await chrome.runtime.sendMessage<
        TutorMessages.StopCaptureMessage,
        TutorMessages.CaptureControlResponse
      >({ type: "stopCapture" });
      if (response.status === "failed") {
        throw new Error(response.message);
      }
      if (runtimeConfig !== null && accessToken !== null && captureSessionId !== null) {
        await TutorApi.stopCaptureSession(
          runtimeConfig.backendUrl,
          accessToken,
          captureSessionId,
        );
      }
      captureSessionId = null;
      captureActive = false;
      button.textContent = "Resume tutoring";
      button.disabled = false;
      setVideoStatus("Capture stopped. Previously indexed evidence remains available.");
      return;
    }

    const backend = await ensureBackendState();
    const transcriptMessage: TutorMessages.GetTranscriptCuesMessage = {
      type: "getTranscriptCues",
    };
    const transcript = await chrome.tabs.sendMessage<
      TutorMessages.GetTranscriptCuesMessage,
      TutorMessages.TranscriptCuesResponse
    >(activeTabId, transcriptMessage);
    if (transcript.cues.length > 0) {
      const created = await TutorApi.uploadTranscriptCues(
        backend.config.backendUrl,
        backend.token,
        backend.resource,
        transcript.cues,
      );
      button.textContent = "Captions indexed";
      button.disabled = true;
      setQuestionEnabled(true);
      setVideoStatus(`${created} timestamped caption segments are ready for tutoring.`);
      return;
    }
    const captureSession = await TutorApi.startCaptureSession(
      backend.config.backendUrl,
      backend.token,
      backend.resource,
    );
    captureSessionId = captureSession.id;
    const message: TutorMessages.StartCaptureMessage = {
      type: "startCapture",
      tabId: activeTabId,
      backendUrl: backend.config.backendUrl,
      accessToken: backend.token,
      captureSessionId: captureSession.id,
    };
    const response = await chrome.runtime.sendMessage<
      TutorMessages.StartCaptureMessage,
      TutorMessages.CaptureControlResponse
    >(message);
    if (response.status === "failed") {
      throw new Error(response.message);
    }
    captureActive = true;
    button.textContent = "Stop capture";
    button.disabled = false;
    setQuestionEnabled(true);
    setVideoStatus("Tutoring is active. Audio is processed in one-minute chunks while the video plays.");
  }

  async function submitQuestion(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const textarea = form.querySelector<HTMLTextAreaElement>("#question");
    const learnerInput = textarea?.value.trim() ?? "";
    if (!learnerInput || activeContext === null) {
      return;
    }
    setQuestionEnabled(false);
    addMessage("user", learnerInput);
    if (textarea) {
      textarea.value = "";
    }
    const backend = await ensureBackendState();
    if (tutorSessionId === null) {
      const session = await TutorApi.createTutorSession(
        backend.config.backendUrl,
        backend.token,
        backend.resource,
      );
      tutorSessionId = session.id;
    }
    const latestContext = await getActiveVideoContext();
    const currentTimeSeconds = latestContext?.status === "ready"
      ? latestContext.context.currentTimeSeconds
      : activeContext.currentTimeSeconds;
    const turn = await TutorApi.createTurn(
      backend.config.backendUrl,
      backend.token,
      tutorSessionId,
      learnerInput,
      currentTimeSeconds,
    );
    addMessage("tutor", turn.content, turn.citations.map((citation) => citation.label));
    setQuestionEnabled(true);
  }

  function handleActionFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : "The tutor request failed.";
    setVideoStatus(message);
    const captureButton = getCaptureButton();
    if (captureButton) {
      captureButton.disabled = false;
    }
    setQuestionEnabled(captureActive);
    console.error("AI Tutor action failed.", error);
  }

  function installControls(): void {
    getCaptureButton()?.addEventListener("click", () => {
      void toggleCapture().catch(handleActionFailure);
    });
    getQuestionForm()?.addEventListener("submit", (event) => {
      void submitQuestion(event as SubmitEvent).catch(handleActionFailure);
    });
  }

  function handleVideoContextLoadFailure(error: unknown): void {
    setVideoStatus(activationMessage);
    console.error("Unable to load the current video context.", error);
  }

  function handleRuntimeMessage(message: unknown): void {
    if (typeof message !== "object" || message === null) {
      return;
    }

    if ((message as { type?: unknown }).type !== "videoContextReady") {
      return;
    }

    void loadVideoContext().catch(handleVideoContextLoadFailure);
  }

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  installControls();
  void loadVideoContext().catch(handleVideoContextLoadFailure);
}
