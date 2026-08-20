declare namespace TutorMessages {
  interface OpenTutorPanelMessage {
    type: "openTutorPanel";
  }

  interface GetVideoContextMessage {
    type: "getVideoContext";
  }

  interface VideoContext {
    videoId: string;
    videoUrl: string;
    title: string;
    currentTimeSeconds: number;
  }
}
