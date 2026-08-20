# Platform Feasibility and Support Gates

Last reviewed: 2026-08-20

## Purpose

This document separates technical possibility from product support. A platform is supported only when the extension can obtain useful evidence through a permitted mechanism, behave reliably on representative pages, and communicate any missing capabilities accurately.

Technical extraction by `yt-dlp`, a browser session, or an undocumented endpoint does not by itself establish permission to process or retain content. Product and legal review is required before a public integration ships.

## Support States

| State | Meaning |
| --- | --- |
| `supported` | Representative pages pass the required capability, reliability, and policy checks. |
| `limited` | The integration is permitted and useful, but known player, transcript, or visual-evidence limitations remain. |
| `experimental` | Technical feasibility is promising, but reliability, access, or policy work is incomplete. |
| `blocked` | A material technical or policy constraint prevents the planned product behavior. |

Support applies to a tested player or page profile, not automatically to every page on the same domain.

## Current Matrix

| Target | Current state | Media and transcript path | Main obstacles | Roadmap decision |
| --- | --- | --- | --- | --- |
| YouTube | `experimental` prototype | Existing page adapter; browser-visible playback context; captions where permitted | Production downloading and separated-media processing raise platform-policy concerns; captions are not universally available | Preserve the UI prototype, replace downloader-first assumptions, and certify the browser evidence path |
| Generic HTML5 video | `experimental` | Standard `HTMLMediaElement` playback properties and `textTracks` when exposed | Nested/cross-origin frames, inaccessible cues, blob/MSE sources, DRM, canvas tainting, and site-specific policy | First LMS milestone; provide explicit capability degradation |
| Blackboard Learn | `experimental` as a container | Generic HTML5 where possible; otherwise classify the embedded provider | Tenant-specific domains and policies; Kaltura, Panopto, Vimeo, YouTube, Collaborate, and native files behave differently | Do not claim blanket Blackboard support; certify provider/page profiles after the generic milestone |
| Khan Academy | `experimental` | Current `yt-dlp` extractor resolves listed videos to YouTube; a browser adapter can reuse platform-neutral behavior | Dependency on Khan Academy and YouTube page/API changes; YouTube ingestion policy still applies | Add after the LMS-focused generic foundation |
| Udemy | `experimental`, not scheduled | Current `yt-dlp` includes lecture/course extraction and caption handling | Login/session cookies, enrollment, CAPTCHA, DRM, changing APIs, content rights, and platform terms | Run a policy review and authenticated spike before scheduling; do not request or store learner passwords |
| Coursera | `blocked` | No current `yt-dlp` extractor in this repository's installed version | Current terms restrict scraping and text/data mining without prior written consent; authenticated content and assessments add risk | Do not implement extraction without written permission or an approved integration |

## Browser Capability Notes

- Content scripts can read and change the page DOM, but their JavaScript runs in an isolated world. A site-specific adapter may need a narrowly scoped main-world bridge for player state that is not represented in the DOM.
- Standard HTML media exposes `currentTime`, duration, seeking, and a live `textTracks` list. A site can still hide captions outside those standard tracks or place the player in a frame the extension cannot access.
- Drawing cross-origin video to a canvas is restricted unless the media is served with compatible CORS settings. Visual grounding cannot assume arbitrary frame extraction.
- Chrome tab capture supplies an audio/video stream only after the user invokes the extension and requires an additional permission. It captures the tab, not a clean historical copy of the lecture, so it is an explicit capability—not a universal fallback.
- DRM detection is a stop condition for media extraction. The integration may still offer transcript-only tutoring if transcript use is permitted.

## Required Platform Spike

Run this checklist before adding a site to extension host permissions or announcing support.

### Inputs

- Use at least two representative videos the tester is authorized to access.
- Include one ordinary lecture and one structurally different page, such as a nested iframe, alternate player, or SPA navigation.
- Use test accounts and content intended for integration testing. Never collect user passwords, exported cookies, or production credentials in the repository.

### Technical Checks

1. Detect the correct active video when the page contains zero, one, or several media elements.
2. Produce a stable source identity without depending only on a temporary stream URL.
3. Read title, current time, duration, play/pause state, and seekability.
4. Seek to a requested timestamp and verify the intended player moved.
5. Discover timestamped transcript cues through a documented or browser-visible mechanism.
6. Handle initial page load, same-document navigation, player replacement, and video changes without duplicate UI.
7. Record iframe origins and determine the narrowest host permissions and `all_frames` behavior needed.
8. Test visual evidence separately: CORS-safe frame access, user-invoked tab capture, or unavailable.
9. Detect login, subscription, unavailable-content, live-video, and DRM states without bypassing them.
10. Verify that no backend credential, session cookie, access token, or protected media URL is logged or persisted.

### Policy and Privacy Checks

1. Review current platform terms, developer policies, API terms, and content licenses.
2. Identify whether transcript extraction, AI processing, visual capture, and a 30-day encrypted evidence cache are each permitted.
3. Record required user consent, attribution, deletion, retention, and regional constraints.
4. Confirm that the extension does not modify playback restrictions, suppress advertisements, bypass access controls, or inspect graded assessments.
5. Assign `blocked` when the planned processing requires permission that has not been obtained.

### Exit Criteria

A profile can become `supported` or `limited` only when:

- Both representative pages pass their declared playback and transcript capabilities.
- Unsupported capabilities degrade predictably and visibly.
- SPA and iframe behavior is stable across repeated navigation.
- Permission requests are narrowly scoped and user-initiated where required.
- The processing and retention policy has been approved.
- Automated adapter tests and a manual end-to-end test are documented.

## Sources

Sources are dated because platform behavior and policies can change.

- [YouTube conversational AI while watching videos](https://support.google.com/youtube/answer/14110396)
- [YouTube Ask search](https://support.google.com/youtube/answer/16943763)
- [YouTube developer policy guide](https://developers.google.com/youtube/terms/developer-policies-guide)
- [YouTube caption download authorization](https://developers.google.com/youtube/v3/docs/captions/download)
- [yt-dlp supported extractors](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)
- [Coursera Terms of Use](https://www.coursera.org/about/terms)
- [Coursera API platform overview](https://dev.coursera.com/get-started)
- [Blackboard Learn REST API first steps](https://docs.blackboard.com/docs/blackboard/rest-apis/getting-started/first-steps)
- [Blackboard LTI and REST comparison](https://docs.blackboard.com/docs/blackboard/rest-apis/getting-started/lti-or-rest)
- [Udemy Business API use cases](https://business-support.udemy.com/hc/en-us/sections/4419908023959-Account-Settings)
- [Chrome tab capture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Chrome extension content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [HTML media text tracks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/textTracks)
- [Cross-origin video and canvas restrictions](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video)

This matrix is product guidance, not legal advice. Re-review the relevant terms before each integration ships.
