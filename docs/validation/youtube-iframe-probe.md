# YouTube iframe in Obsidian: feasibility probe

Status: **feasibility gate passed**. This is not evidence that the full YouTube clipper works.

## Setup

- Desktop Obsidian: 1.14.4 (installer 1.13.7), bundle ID `md.obsidian`.
- Reference video: `M7lc1UVf-VE`, the public example in the [official IFrame API reference](https://developers.google.com/youtube/iframe_api_reference). Caption availability is not part of this first playback probe.
- Temporary note: `_OCA YouTube Probe/iframe-api.md` inside a local test vault; no existing note is modified. Remove it after the probe.
- Initial embed: `https://www.youtube.com/embed/M7lc1UVf-VE?enablejsapi=1&autoplay=0`. Only parameters required by the documented API are set; test whether the `app://obsidian.md` host needs an explicit origin value.

## Required observations

1. The note displays one embedded player in reading view, and the player can be started by a user click without opening another browser tab.
2. The IFrame Player API reports `onReady`, then `getCurrentTime()` returns a finite nonnegative value and `getPlayerState()` can distinguish paused from playing.
3. After pausing, `seekTo(20, true)` changes the note player's time to about 20 seconds without starting playback. The player remains the same iframe.
4. When playback resumes, time advances. Scrolling the note away and back leaves the same iframe and playback session.
5. A blocked embed or API failure yields a detectable error/timeout. Inspect the iframe request's Referer to confirm app-identifying source as required by YouTube for desktop WebViews.

Collect only version, video ID, event names, booleans, numeric times, HTTP status, and redacted request origin. Do not save cookies, tokens, page content, or unrelated vault paths in this document.

## Result

CLI observations on Obsidian 1.14.4, 2026-10-17:

| Check | Observed result |
| --- | --- |
| Reading-view iframe | Obsidian rendered a visible YouTube iframe at normal 16:9 size. Its sandbox permits scripts/same-origin/forms/presentation/modals and does not grant popups. A second hidden zero-size iframe belongs to the editor HTML preview, not the reading-view player. |
| IFrame API | Loading the official API script yielded `onReady`; the visible player reported state `5` (cued) and time `0`. |
| Source identification | A filtered DevTools Protocol capture of the embed navigation showed `Referer: md.obsidian`. The debugger was detached immediately afterward. `document.referrer` inside the frame was empty, so the request header is the useful signal. No cookies or other request headers were stored. |
| Paused seek | From state `2` (paused) at ~36.37 s, `seekTo(50, true)` reached exactly 50 s and stayed in state `2`. |
| Never-started seek | From state `5` (cued), `seekTo(20, true)` started playback. `cueVideoById({videoId, startSeconds:20})` instead reached 20 s and stayed cued. The production adapter must use the latter for a never-started video, then use `seekTo` for playing/paused video. |
| Scroll continuity | While playing, scrolling the reading view moved the iframe top to about -1605 px. The same iframe stayed connected, state remained `1` (playing), and playback time advanced from ~29.18 s to ~43.80 s. Returning to the top kept that iframe. |
| Error path | Loading an invalid ID through the API produced `onError` code `150`, which can drive a visible failure state. |

User visual check: **passed**. The user played the video in this temporary note and reported that it stayed inside Obsidian without opening a browser tab. API state `1` with advancing time on the visible reading-view iframe independently confirms playback; the iframe sandbox lacks `allow-popups` and `allow-top-navigation`. The full clipper still needs end-to-end acceptance before any release.

## Integrated development build check

On Obsidian 1.14.4, a staged development plugin was loaded in an existing local vault using four runtime files (`manifest.json`, `main.js`, `styles.css`, `youtube-player.js`). A temporary Markdown note with the public reference video and three synthetic timestamp cues exercised the actual reading-view postprocessor. One iframe and one controller were mounted; the YouTube API reached ready. Clicking 00:10 and a rendered Markdown `00:20` timestamp sought the note-local iframe; the corresponding cue became active. The Markdown timestamp click was intercepted, so it did not navigate away. The companion plugin reloaded successfully from its installed folder.

The first staging attempt exposed an Obsidian module-resolution difference: a relative `require("./youtube-player")` failed with `MODULE_NOT_FOUND` from Electron's renderer loader. The runtime now resolves the file from the plugin's absolute installation directory. This behavior is covered by the reading-view integration test. Human playback, scroll continuity, Chrome transcript extraction, and varied caption/embedding cases remain pending end-to-end acceptance.
