# AI Video Tutor Extension

This is the UI-only foundation of the **AI Video Tutor** product. It currently supports two activation paths:

- On standard YouTube watch pages, an injected **AI Tutor** button opens the side panel.
- On other HTTP(S) pages, selecting the **AI Video Tutor** toolbar icon temporarily activates experimental generic HTML5 video detection and opens the side panel.

The generic detector reads the selected visible video's title, playback timestamp, duration, and seek availability. It searches the main page and accessible same-origin frames, prefers a playing video, and otherwise selects the largest visible video. When the video is inside an inaccessible cross-origin frame, the panel reports the embedded provider hostname so a dedicated adapter can be investigated.

Caption extraction, visual analysis, question answering, and backend integration are not implemented yet. No video data is sent anywhere. See the repository's [high-level plan](../HIGH-LEVEL-PLAN.md), [architecture](../docs/ARCHITECTURE.md), and [platform feasibility matrix](../docs/PLATFORM-FEASIBILITY.md) for the planned system.

Chrome 116 or later is required because the extension uses Chrome's side panel.

## Run locally

From this directory:

```sh
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose this `extension` directory.

For YouTube, open a `youtube.com/watch?v=...` page and select **AI Tutor** below the video.

For an experimental Blackboard or other educational-page check:

1. Select **Start playback** so Blackboard loads the playback document.
2. Select the **AI Video Tutor** toolbar icon.
3. Check the side-panel status:
   - `Ready` means an accessible HTML5 video was detected.
   - `No supported video` means no visible HTML5 video was found.
   - `Embedded video detected` means the player is cross-origin and needs a provider-specific adapter.
4. When reporting an embedded-player result, share only the provider hostname. Do not share course content, cookies, credentials, or protected URLs.

After modifying TypeScript, rerun `npm run build` and use Chrome's reload button for the extension. Open a YouTube watch page in a completely new tab to load its updated static content script. Generic detection is injected afresh when the toolbar icon is selected.
