# YouTube Clipping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated YouTube watch-page clipper whose saved notes play inside Obsidian and synchronize timestamp clicks with subtitle highlighting.

**Architecture:** Keep YouTube extraction, Markdown generation, popup, and Obsidian player adapter in platform-specific files. Share only the existing vault list and Obsidian URI transport pattern; leave Bilibili's player and subtitle retrieval path intact. Prove the desktop IFrame API path before building the full clipper.

**Tech Stack:** Chrome Manifest V3, plain JavaScript content/popup scripts, TypeScript/Vitest/jsdom tests, Obsidian desktop plugin JavaScript, YouTube IFrame Player API, npm/webpack production build.

**Spec:** `docs/superpowers/specs/2026-10-17-youtube-clipping-design.md`

## Global Constraints

- Dedicated routing only for `https://www.youtube.com/watch?v=<11-character video ID>`; redirects from `youtu.be` qualify only after reaching a watch URL.
- Read only transcript rows rendered in the open YouTube transcript panel. Tell the user to click the popup's **刷新** button after opening that panel; do not reload the YouTube page or call undocumented caption endpoints.
- Preserve metadata-only saving when no transcript is visible; report possible incompleteness if the panel virtualizes rows.
- In Obsidian reading view, control one note-local YouTube iframe. Clicking a timestamp must not open a browser tab; playing must highlight the matching cue; scrolling away must not recreate the player.
- Clipboard-based `obsidian://new` save uses a unique filename and omits `append`/`overwrite`. Display the destination, wait for clipboard write before opening the URI, and never claim a confirmed write without an acknowledgement.
- Keep the Bilibili and generic web flows compatible. Do not use Computer Use. Release only after real Obsidian playback and sync acceptance; if the technical probe fails, revise the spec before continuing.

## Review Focus

1. A YouTube single-page navigation after preview: Save and Copy must reject the stale video ID (Task 4).
2. Repeated subtitle text at different times: extraction must retain both rows; overlapping selectors for the same time/text must yield one row (Task 2).
3. An open but partially virtualized transcript: popup must label the captured count as possibly incomplete (Task 4).
4. Hostile or malformed titles/descriptions: generated path and Markdown must remain safe and syntactically valid (Task 3).
5. Blocked embeds or API readiness timeout: reading view must report failure and never claim a seek succeeded (Tasks 1 and 6).

## File map

- `src/youtube/video.js`: URL/video-ID validation and visible DOM snapshot extraction; exports testable pure helpers through `globalThis.OcaYouTubeVideo`.
- `src/youtube/content.js`: content-script request/reply boundary, tied to the current watch URL.
- `src/youtube/note.js`: Markdown, timestamp, Frontmatter, filename/path generation; exports `globalThis.OcaYouTubeNote`.
- `src/youtube/obsidian-uri.js`: YouTube-specific clipboard/URI saver; does not alter Bilibili's saver.
- `src/youtube/popup.html`, `popup.css`, `popup.js`: dedicated 420 × 600 UI and saved settings.
- `src/router.js`, `src/router-switch.js`, `src/popup.html`, `src/settings.html`, `src/anything-settings.js`, `src/anything-settings.css`, `src/manifest.chrome.json`, `webpack.config.js`: route, reciprocal navigation, shared vault settings surface, MV3 injection, packaging.
- `obsidian-clipper-anything-player/youtube-player.js`: YouTube URL validation, one IFrame API controller, note-local view lifecycle.
- `obsidian-clipper-anything-player/main.js`, `styles.css`, `manifest.json`: platform dispatch, shared transcript parser and view styling/version.
- `src/youtube/*.test.ts`, `src/bilibili/companion-player.test.ts`, `README.md`, `docs/validation/youtube-iframe-probe.md`: regression and manual acceptance evidence.

### Task 1: Desktop IFrame API feasibility gate

**Files:** Create `docs/validation/youtube-iframe-probe.md`; use disposable probe files outside the repository and a temporary Obsidian vault. No production source change is retained until the gate passes.

**Interfaces:** Produces a verified contract for Task 5: accepted embed host/URL, app-identifying Referer behavior, `YT.Player` readiness, `seekTo(seconds, true)`, `getCurrentTime()`, and the error path. No other task begins before this verdict.

- [ ] **Step 1: Write the probe checklist and sample note.** Specify a public captioned watch video ID, a temporary Markdown iframe with `enablejsapi=1`, and a probe controller that records ready/error/currentTime/paused before and after seeking. Save only redacted diagnostics in `docs/validation/youtube-iframe-probe.md`.
- [ ] **Step 2: Exercise the probe in desktop Obsidian without Computer Use.** Ask the user only for the necessary manual play/click observation; collect any local diagnostic file by CLI. Expected: the note iframe plays, the documented API reaches ready, a paused seek changes current time without starting playback, and no new browser tab opens.
- [ ] **Step 3: Record the outcome.** If any required behavior fails, mark the gate failed, explain the exact obstacle, and revise the approved spec before product code. If all pass, record Obsidian version, test video, observed API events, source/referrer result, and the final embedding parameters; commit the evidence.

### Task 2: Watch URL and rendered transcript snapshot

**Files:** Create `src/youtube/video.js`, `content.js`, `video.test.ts`; modify `src/manifest.chrome.json`.

**Interfaces:** `OcaYouTubeVideo.videoIdFromUrl(url) -> string|null`; `OcaYouTubeVideo.snapshot(document, url) -> {videoId,title,channel,url,description,chapters,cues,transcriptState}`. Content script replies to `{type:"oca-youtube-snapshot", expectedVideoId}` with `{ok,payload|error}`.

- [ ] **Step 1: Write failing tests.** `videoIdFromUrl` accepts only watch URLs with an 11-character `v`; snapshot rejects an expected/current ID mismatch; fixture tests for `ytd-transcript-segment-renderer` and `transcript-segment-view-model` assert parsed seconds/text; identical `(videoId,time,text)` rows collapse while equal text at different times remains; missing/invalid time rows are ignored; unopened and partially rendered panels return distinct states.
- [ ] **Step 2: Run `npx vitest run src/youtube/video.test.ts`.** Expected: FAIL because the new module/functions are absent.
- [ ] **Step 3: Implement the pure parser and message boundary.** Read DOM text and attributes only; keep raw page text out of HTML insertion; verify the active `v` in content script at request time. Use DOM fixtures rather than live network calls in unit tests.
- [ ] **Step 4: Run `npx vitest run src/youtube/video.test.ts`.** Expected: PASS; commit parser, content script, test, and manifest injection.

### Task 3: Note model and one-way Obsidian URI save

**Files:** Create `src/youtube/note.js`, `obsidian-uri.js`, `note.test.ts`, `obsidian-uri.test.ts`.

**Interfaces:** `OcaYouTubeNote.build(snapshot, {folder,now,randomBytes}) -> {markdown,filepath}`; `OcaYouTubeUri.save(markdown, filepath, vault) -> Promise<void>`.

- [ ] **Step 1: Write failing tests.** Assert `clip_platform: youtube`, matching `youtube_id`, safe embed URL, `## 字幕` lines such as `` `01:05` 文本 ``, metadata-only note when cues empty, unique filenames for repeated clips, removal of `../` and filesystem separators from title, escaped YAML/Markdown text, and no external subtitle links. URI tests assert full Markdown reaches clipboard before `openObsidianUrl`, `&clipboard` is present, `append`/`overwrite` are absent, and clipboard failure suppresses URI launch.
- [ ] **Step 2: Run `npx vitest run src/youtube/note.test.ts src/youtube/obsidian-uri.test.ts`.** Expected: FAIL because the new modules are absent.
- [ ] **Step 3: Implement the model and saver.** Generate the random suffix with `crypto.getRandomValues` via injected `randomBytes`; reject unavailable randomness. Keep URI content short by passing full Markdown through the clipboard; return only a launch result, never a confirmed-write result.
- [ ] **Step 4: Re-run those two test files.** Expected: PASS; commit model, saver, and tests.

### Task 4: Dedicated popup, routing, and settings

**Files:** Create `src/youtube/popup.html`, `popup.css`, `popup.js`, `popup.test.ts`; modify `src/router.js`, `src/router-switch.js`, `src/popup.html`, `src/settings.html`, `src/anything-settings.js`, `src/anything-settings.css`, `webpack.config.js`.

**Interfaces:** Popup consumes Task 2 snapshot and Task 3 `{markdown,filepath}`; `validateSnapshotTab(chrome.tabs, {tabId,videoId}) -> Promise<boolean>` before Copy and Save. Storage keys: shared `vaults` list, local `anythingYoutubeVault`, sync `anythingYoutubeFolder` with default `Clippings/YouTube`.

- [ ] **Step 1: Write failing tests.** Router selects YouTube only for supported watch URL; reciprocal mode links appear on YouTube watch pages; popup refuses Copy/Save after tab ID or video ID changes; absent transcript says “在 YouTube 打开文字记录后，点击这里的刷新” and permits metadata-only save; partially rendered transcript shows count plus “可能不完整”; selected vault and folder persist independently of Bilibili.
- [ ] **Step 2: Run `npx vitest run src/youtube/popup.test.ts`.** Expected: FAIL because the dedicated popup/routing is absent.
- [ ] **Step 3: Implement the 420 × 600 UI and settings.** Reuse visual tokens and the shared vault list; keep settings limited to folder and naming/path preview. Wire Save to `OcaYouTubeUri.save` and explain that it replaces clipboard contents and requires checking Obsidian for the note. Package every new script/CSS file with webpack's copy step.
- [ ] **Step 4: Run the popup test and `npm run build:chrome`.** Expected: PASS and `dist/youtube/popup.html`, scripts, CSS, and Chrome `manifest.json` present; commit UI, route, settings, and packaging.

### Task 5: YouTube IFrame controller

**Files:** Create `obsidian-clipper-anything-player/youtube-player.js`, `src/youtube/companion-controller.test.ts`.

**Interfaces:** `createYouTubeController(iframe, videoId, {onReady,onTime,onError}) -> {seek(seconds),destroy()}`. The controller owns one `YT.Player` instance and polls `getCurrentTime`; it must not call `playVideo` during a seek. Use the parameters and origin behavior established by Task 1.

- [ ] **Step 1: Write failing tests.** Mock `YT.Player` to assert one instance per iframe, seek at 65 seconds, preserved paused state, progress callback selecting 65-second cue, timeout/embedded-player error callback, and no polling/events after `destroy()`.
- [ ] **Step 2: Run `npx vitest run src/youtube/companion-controller.test.ts`.** Expected: FAIL because the controller is absent.
- [ ] **Step 3: Implement the adapter around the documented API.** Whitelist only `www.youtube.com/embed/<11-character ID>` and require iframe ID to equal note ID; never use Bilibili's Electron video element controller for this path.
- [ ] **Step 4: Re-run the controller test.** Expected: PASS; commit controller and tests.

### Task 6: Obsidian reading-view integration

**Files:** Modify `obsidian-clipper-anything-player/main.js`, `styles.css`, `manifest.json`; create `src/youtube/companion-view.test.ts`; extend `src/bilibili/companion-player.test.ts` only where a shared parser contract changes.

**Interfaces:** Existing Bilibili postprocessor retains its behavior. YouTube dispatcher reads the note's `youtube_id`, replaces the rendered iframe with a placeholder, creates one top-of-note iframe/controller, parses `## 字幕`, and routes matching timestamp clicks to that controller.

- [ ] **Step 1: Write failing tests.** A YouTube note has exactly one iframe and one controller in reading view; `` `01:05` `` clicks seek only that note's video and prevent external navigation; a mismatched ID is ignored; playing marks the current cue; scrolling does not recreate the iframe; switching notes destroys timer/listeners; readiness failure shows a useful status. Re-run existing Bilibili companion tests unchanged.
- [ ] **Step 2: Run `npx vitest run src/youtube/companion-view.test.ts src/bilibili/companion-player.test.ts`.** Expected: new YouTube tests FAIL and existing Bilibili tests PASS.
- [ ] **Step 3: Implement platform dispatch and view lifecycle.** Use the existing `parseTranscript` timestamp contract; keep YouTube-specific API wiring in `youtube-player.js`. Update the existing VM test harness to resolve that new local `require()` without changing its Bilibili assertions. Include `youtube-player.js` in the distributed plugin folder. Bump companion version only after verified behavior.
- [ ] **Step 4: Re-run both test files.** Expected: PASS; commit integration and tests.

### Task 7: End-to-end verification and release preparation

**Files:** Modify `README.md`, `package.json`, `src/manifest.chrome.json`, `obsidian-clipper-anything-player/manifest.json`; add release packaging files only if needed to make the two ZIPs reproducible. Update `docs/validation/youtube-iframe-probe.md` with final acceptance results.

**Interfaces:** Produces installable Chrome and Obsidian plugin ZIPs, `SHA256SUMS`, and platform support documentation. Do not publish a GitHub Release until the real Obsidian acceptance is complete.

- [ ] **Step 1: Run `TZ=America/Los_Angeles npm test` and `npm run build:chrome`.** Expected: all tests PASS and Chrome `dist/manifest.json` has `manifest_version: 3`.
- [ ] **Step 2: Inspect both package roots.** Expected: Chrome ZIP opens at a directory directly containing `manifest.json`; Obsidian ZIP contains `obsidian-clipper-anything-player/{manifest.json,main.js,styles.css,youtube-player.js}`. Verify no runtime import is missing; generate SHA-256 checksums.
- [ ] **Step 3: Perform the acceptance matrix without Computer Use.** Use a temporary vault and user manual playback observation for human-captioned, auto-captioned, no-transcript, and non-embeddable watch videos. Confirm note-local seek/highlight, paused seek, scroll continuity, no new browser tab, restart behavior, and Bilibili regression. Record observed results; a failed full-parity case blocks release.
- [ ] **Step 4: Update README and version numbers only after acceptance, then rerun tests/build.** Expected: README support table and installation filenames match the exact artifacts; commit documentation and release preparation. Push/create release only after the verified package is reviewable and authorized by the user.
