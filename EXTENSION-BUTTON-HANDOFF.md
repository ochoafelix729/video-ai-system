# AI Tutor Button Debug Handoff

## Current bug

The **AI Tutor** button does not appear on the first YouTube watch page after the unpacked extension is loaded or reloaded. Reloading the YouTube page makes it appear. The user reports that later YouTube video navigation works after the page has been refreshed once.

## Expected behavior

After building and reloading the unpacked extension, open a new standard URL such as `https://www.youtube.com/watch?v=...`. The button should appear below the video without refreshing that YouTube tab.

## Current implementation

- Extension root: `extension/`
- MV3 manifest: `extension/manifest.json`
- Content script: `extension/src/content.ts`
- Content script runs at `document_start` on `youtube.com` and `www.youtube.com`.
- It observes `document.documentElement` with a `MutationObserver` and, on `yt-navigate-finish`, looks for `#top-level-buttons-computed`.
- It injects one button with ID `youtube-ai-tutor-button`.
- The button sends `openTutorPanel` to `extension/src/service-worker.ts`.

## Attempts already removed

Do not restore these without a specific reason:

- Bounded `setTimeout` retries while waiting for the action row.
- `chrome.scripting` startup injection into already-open YouTube tabs.
- The `scripting` manifest permission.

Those approaches did not resolve the first-page behavior and were removed to keep the repository clean.

## Verification already completed

From `extension/`:

```sh
npm run typecheck
npm run build
```

Both succeed. `manifest.json` also parses as valid JSON.

## Important testing detail

`npm run build` only updates `extension/dist/`. Chrome must reload the unpacked extension in `chrome://extensions` before testing. Existing YouTube documents may retain the previous content-script state; test a newly opened YouTube watch page after the extension reload.

## Suggested investigation

Use Chrome DevTools on the YouTube tab and inspect:

1. Whether `dist/content.js` is injected on the first page load.
2. Console errors from the content script.
3. Whether `yt-navigate-finish` fires on first load.
4. Whether `#top-level-buttons-computed` exists, and whether it is the correct action-row target for the current YouTube DOM.
5. Whether YouTube replaces or hides the container after the button is appended.

The prior agent could not run an interactive browser test because no in-app browser session was available.
