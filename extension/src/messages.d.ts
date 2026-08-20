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
}
