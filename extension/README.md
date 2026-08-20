# YouTube AI Tutor Extension

This is the first, UI-only milestone of the Chrome/Chromium extension. It injects one **AI Tutor** button on standard YouTube watch pages. Selecting it opens a Chrome side panel and reads the current video title and playback timestamp. No video data is sent anywhere yet.

Chrome 116 or later is required because the extension opens the side panel from its injected button.

## Run locally

From this directory:

```sh
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose this `extension` directory. Open a `youtube.com/watch?v=...` page, then select **AI Tutor** below the video.

After modifying TypeScript, rerun `npm run build` and use Chrome's reload button for the extension. Then open a YouTube watch page in a completely new tab to load the updated content script. Reloading the extension does not replace a content script that is already running in an existing YouTube document.
