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

## User acceptance and Shorts follow-up

The user manually confirmed the staged note player played inside Obsidian, cue clicks sought and highlighted the correct times, scrolling away and back preserved the playback session, and no browser tab was opened. The user also loaded the development Chrome extension, opened a watch video's visible transcript, refreshed the popup, and confirmed transcript capture and Obsidian saving worked.

The user then supplied `https://www.youtube.com/shorts/_i92TmBGF8k` for later testing. YouTube's public oEmbed response identified it as a video titled “什么是SOC？（CPU，GPU，DPU，DSP，MCU，SOC，NPU，系统讲解之SOC）”. Dedicated routing now accepts this exact Shorts URL class, preserves the Shorts source URL in the note, and embeds the same 11-character video ID. The transcript policy remains unchanged: only visible rows are captured; if no transcript panel is shown, the note contains video information and an explicit no-transcript message. A direct visual Obsidian playback check of this Shorts ID was not completed while the application was in the background; the previously confirmed watch-video playback and the shared embed-ID controller are the available evidence.

## Release candidate gate, 2026-10-17

Chrome extension 1.1.0 and companion plugin 1.3.0 are packaged as local installable candidates. The initial 26-file test suite passed 256/256, the Chrome build completed, both ZIP roots and runtime files were inspected, ZIP integrity passed, and `SHA256SUMS` verified both archives. A staged companion loaded in the actual Obsidian vault.

Final review exposed three candidate defects. Tests reproduced each: a YouTube home/search → video SPA route lacked a collector, a Shorts page could mix a new ID with old metadata, and a long multilingual title could exceed a filesystem component limit. All three fixes passed focused tests and the full 26-file suite (259/259). The Chrome candidate was rebuilt and both ZIPs rechecked. SHA-256: Chrome `6afbc020b680f98501fcca22498fe9950a13f7e6d4842ec451752a5a435b30e7`; companion `bf4886480a04018a9607834e4b9ddb979f2ee56f28e5e50078b5ef7ff31d4bcc`. The final four companion files were copied into the local SOC Learning plugin folder and matched byte for byte; Obsidian should be restarted to load version 1.3.0.

The full manual release matrix is still open: separate human-captioned, auto-captioned, no-transcript, and non-embeddable watch examples; paused seek and restart behavior for the final packaged version; a fresh Bilibili regression; and direct playback of the supplied Shorts ID. Only the ordinary watch-video end-to-end path described above has user confirmation. Do not publish a GitHub Release or describe these candidates as stable until this matrix passes.

## Partial transcript report and 1.1.1 candidate

After the user reported an incomplete clip of the supplied video, we identified a possible collector gap: the first collector read only the rows present in the DOM at one instant. The YouTube transcript can render further rows while its panel or the page scrolls. The 1.1.1 collector traverses the available scrollbar from top to bottom, accumulates rows keyed by time and text, restores the prior scroll position, and labels the result as traversed only after reaching a stable bottom. If traversal cannot finish, it retains the incomplete warning. It still reads only DOM-rendered transcript rows and does not call a hidden caption endpoint.

Automated regression fixtures cover a virtualized transcript with its own scrollbar, one using the page scrollbar, and a tall wrapper that is not actually scrollable. The async content-script reply stays open until collection ends. The 26-file test suite passed 262/262; Chrome build and both ZIP integrity/checksum checks passed. Chrome 1.1.1 ZIP SHA-256: `7d7bc7ed8dbb5bb7a6e62f7308e7f7bcb4b107d5240c3dda57ba882f07c81e57`.

The specific saved note the user provided, `Clippings/什么是SOC？（CPU，GPU，DPU，DSP，MCU，SOC，NPU，系统讲解之SOC）2.md`, contains a generic Web Clipper frontmatter (`source`, `description`, `tags`) and a truncated video *description*. It has no `clip_platform: youtube`, `youtube_id`, `## 字幕`, or timestamped cues. Therefore it does **not** demonstrate a partial result from the 1.1.1 YouTube transcript collector; the earlier root-cause claim for this note was incorrect. Inspection of Chrome's unpacked-extension registration showed that Clipping Anything still pointed to `/Users/mxt/Documents/ChatGPT/Obsidian-Clipper-Anything/dist`, whose manifest was version 1.0.6. Reloading that extension would continue to load 1.0.6. The registered directory's `dist` was backed up intact and replaced with the byte-matched 1.1.1 `dist` build; its manifest now reports 1.1.1. At that point, Chrome needed to reload this installed extension and create a new clip through the popup's “YouTube 视频” mode before actual capture could be judged. This candidate remains unpublished pending the manual acceptance matrix.

## Same video re-clipped through 1.1.1

The user supplied a new dedicated YouTube note at `Clippings/YouTube/什么是SOC？（CPU，GPU，DPU，DSP，MCU，SOC，NPU，系统讲解之SOC） _i92TmBGF8k 2026-10-17T06-09-52-140Z-823e5593db8f4e53.md`. It has `clip_platform: youtube` and the correct video ID, but the source remains `/shorts/_i92TmBGF8k`; `## 字幕` contains the explicit no-transcript message and there are zero cues. This establishes that the 1.1.1 dedicated route and note writer ran, but no visible transcript was collected on the Shorts page. A read-only fetch of that video's public ordinary watch page returned a playable, 52-second `ytInitialPlayerResponse` with no `captions` property or caption tracks. This strongly suggests that the public page has no platform caption track for this example; it does not prove the same for every account or locale. Under the approved visible-transcript-only policy, the current note is expected to be metadata-only. A spoken-word transcript would require a separately designed ASR fallback. This finding led to the separately approved popup correction below.

## 1.1.2 Shorts no-transcript guidance

When a Shorts page has zero visible cues, the YouTube popup now states that this clip will save only video information. It shows a button that navigates the same active tab to the video's ordinary `watch` URL so the user can check whether “显示文字记录” exists there. The button is hidden when cues are present. Navigation validates the active tab and video ID before changing the URL. The fallback still reads only visible transcript rows; it does not generate speech-to-text.

Tests for the missing guidance and button failed before implementation and passed afterward. The focused popup suite passed 7/7. The full suite passed 264/264 with `TZ=America/Los_Angeles`; a bare `npm test` in Asia/Shanghai still fails the pre-existing `src/utils/template-integration.test.ts` YouTube fixture because its expected `created` offset is `-08:00`. Chrome production build completed, and both ZIPs passed integrity checks. Chrome 1.1.2 SHA-256: `958ec7b3738f51558edd0153ddf4cd33a9c39be597b8883861d9aaa7ad659ca7`; unchanged companion 1.3.0 SHA-256: `bf4886480a04018a9607834e4b9ddb979f2ee56f28e5e50078b5ef7ff31d4bcc`. The Chrome-registered `dist` was backed up at version 1.1.1 and replaced with an exact 102-file match of 1.1.2. After reloading Chrome, the user pasted the live Shorts popup text, confirming the 1.1.2 no-transcript warning and “到普通播放页查看文字记录” button are both visible for the supplied ID. The user initially reported that clicking caused no change, then retried and confirmed the button opened the ordinary watch page. The newly saved watch-page note has source `https://www.youtube.com/watch?v=_i92TmBGF8k`, channel metadata, and zero cues. A fresh public watch-page response still has zero caption tracks. Button navigation is therefore confirmed; transcript absence for this video remains expected under the visible-transcript-only policy. The broader release matrix remains open.

## 1.1.3 Untimed description fallback

The user correctly identified speech-like text in the saved video's description. A fresh public player response for `_i92TmBGF8k` contains a 356-character `videoDetails.shortDescription` with continuous Chinese prose and no caption tracks; the rendered description also appends YouTube UI text such as subscriber counts and video details. The collector now prefers a player-response description only when its `videoDetails.videoId` matches the active video, then falls back to rendered text. The note writer removes obvious UI text and tags, excludes a heading and separate promotional lines, and splits qualifying prose into untimed sentence lines under `## 字幕`. It labels those lines “由视频简介整理，未经音频校对，无时间轴。” The popup shows the same untimed preview and states that seeking and highlighting are unavailable. A description made only of links or promotion remains a description and does not become subtitles.

The companion player version is 1.3.1: it keeps the in-note video for untimed clips but creates no subtitle buttons, timestamp click handlers, or progress highlight observer when the note has zero timed cues. Timed YouTube and Bilibili behavior is unchanged. Focused tests passed 30/30; the full suite passed 271/271 with `TZ=America/Los_Angeles`, and the Chrome production build succeeded. The bare Asia/Shanghai test invocation still has the pre-existing timezone fixture failure described above. Both candidate ZIPs passed integrity and SHA-256 verification: Chrome 1.1.3 `2334a6e322a7707841997b654682e05c68e56eadd49635da99308ac2d67056b3`, player 1.3.1 `3df4810690f585672c6186fda0fcfce72307e83c15aa7a0eb0cfc327a59f3ba4`. A fresh public watch-page response for the supplied SOC video was passed through the actual collector and note writer: 0 timed cues, 356 source-description characters, clean untimed sentence lines, no UI debris or time markers. The registered Chrome extension directory and the SOC Learning vault plugin directory were updated to byte-matched 1.1.3/1.3.1 files, with copies of 1.1.2/1.3.0 retained in the ignored local staging folder. Chrome reload, Obsidian restart, and live recapture/reading-view checks remain to be performed before calling this a stable release.
