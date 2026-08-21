declare namespace TutorMessages {
  type Platform = "youtube" | "generic_html5";

  type Availability = "available" | "unavailable";

  interface VideoCapabilities {
    seek: Availability;
    transcript: "browser" | "authorized_api" | "unavailable";
    visualEvidence: "cors_frame" | "user_tab_capture" | "authorized_media" | "unavailable";
    ingestion: "browser_evidence" | "authorized_media" | "unavailable";
  }

  interface OpenTutorPanelMessage {
    type: "openTutorPanel";
  }

  interface GetVideoContextMessage {
    type: "getVideoContext";
  }

  interface GetTranscriptCuesMessage {
    type: "getTranscriptCues";
  }

  interface TranscriptCue {
    startSeconds: number;
    endSeconds: number;
    text: string;
  }

  interface TranscriptCuesResponse {
    cues: TranscriptCue[];
  }

  interface VideoContextReadyMessage {
    type: "videoContextReady";
  }

  interface VideoContext {
    source: {
      platform: Platform;
      sourceId: string;
      pageUrl: string;
    };
    title: string;
    currentTimeSeconds: number;
    durationSeconds?: number;
    isPlaying: boolean;
    playbackRate: number;
    capabilities: VideoCapabilities;
  }

  type VideoContextResponse =
    | {
        status: "ready";
        context: VideoContext;
      }
    | {
        status: "no_video";
      }
    | {
        status: "embedded_player";
      providerHosts: string[];
      };

  interface StartCaptureMessage {
    type: "startCapture";
    tabId: number;
    backendUrl: string;
    accessToken: string;
    captureSessionId: string;
  }

  interface StopCaptureMessage {
    type: "stopCapture";
  }

  interface GetCaptureTimestampMessage {
    type: "getCaptureTimestamp";
    tabId: number;
  }

  interface CaptureTimestampResponse {
    currentTimeSeconds: number;
    isPlaying: boolean;
    playbackRate: number;
  }

  type CaptureControlResponse =
    | { status: "started" | "stopped" }
    | { status: "failed"; message: string };
}
