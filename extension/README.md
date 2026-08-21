# AI Video Tutor Chrome extension

Chrome 116 or later is required. The extension supports YouTube watch pages and accessible HTML5 video on other HTTP(S) pages, including some Blackboard course pages.

## Run locally

```sh
npm install
npm run build
```

Start the backend with `AUTH_DISABLED=true` for local development. In Chrome, open `chrome://extensions`, enable Developer mode, select Load unpacked, and choose this `extension` directory. Open a new video tab after each content-script rebuild.

- On YouTube, select the injected AI Tutor button.
- On another page, start playback and select the extension toolbar icon.
- Select Start tutoring. If standard browser caption cues are available, they are indexed without audio capture. Otherwise Chrome requests permission to capture tab audio; recording occurs only while playback is active and stops when the learner selects Stop capture.

The local default backend is `http://localhost:8000`. Production configuration is read from Chrome sync storage keys `backendUrl`, `cognitoDomain`, and `cognitoClientId`. A production backend origin must also be added to `host_permissions` in `manifest.json` before packaging this checkpoint.

## Boundaries

- Cross-origin embedded players are reported as unsupported unless their video is directly accessible to the page.
- The extension does not collect quiz questions, assignments, grades, answer choices, or submission state.
- It does not bypass DRM, authentication, browser origin rules, or platform restrictions.
- User-approved visual frame capture is not wired into this checkpoint, even though the API can store visual evidence.
- The current YouTube path generally falls back to tab audio when captions are rendered by a custom player rather than exposed as standard `TextTrack` cues.

Run `npm test` to type-check, build, and execute the adapter tests.
