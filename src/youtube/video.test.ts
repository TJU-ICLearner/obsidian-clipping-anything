import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const { JSDOM } = require('jsdom');
import { describe, expect, it, vi } from 'vitest';

const url = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
function loadVideo() {
  const context: any = { URL };
  context.globalThis = context;
  vm.runInNewContext(readFileSync(new URL('./video.js', import.meta.url), 'utf8'), context);
  return context.OcaYouTubeVideo;
}
function page(body = '') { return new JSDOM(`<!doctype html><title>Video title - YouTube</title><body>${body}</body>`).window.document; }

describe('YouTube visible snapshot', () => {
  it('accepts only standard watch and Shorts URLs with a valid eleven-character ID', () => {
    const video = loadVideo();
    expect(video.videoIdFromUrl(url)).toBe('M7lc1UVf-VE');
    expect(video.videoIdFromUrl('https://www.youtube.com/shorts/_i92TmBGF8k')).toBe('_i92TmBGF8k');
    for (const invalid of [
      'https://www.youtube.com/shorts/bad',
      'https://music.youtube.com/watch?v=M7lc1UVf-VE',
      'https://youtu.be/M7lc1UVf-VE',
      'https://www.youtube.com/watch?v=bad',
      'https://www.youtube.com/watch?v=M7lc1UVf-VE&v=other12345',
      'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE',
    ]) expect(video.videoIdFromUrl(invalid)).toBeNull();
  });

  it('extracts rendered desktop rows, preserves repeated text at different times, and skips invalid rows', () => {
    const video = loadVideo();
    const document = page(`<meta itemprop="name" content="Video title"><link itemprop="name" content="Channel name">
      <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED">
      <div id="segments-container">
        <ytd-transcript-segment-renderer><span class="segment-timestamp">1:05</span><span class="segment-text">Same line</span></ytd-transcript-segment-renderer>
        <ytd-transcript-segment-renderer><span class="segment-timestamp">1:05</span><span class="segment-text">Same line</span></ytd-transcript-segment-renderer>
        <ytd-transcript-segment-renderer><span class="segment-timestamp">1:06</span><span class="segment-text">Same line</span></ytd-transcript-segment-renderer>
        <ytd-transcript-segment-renderer><span class="segment-timestamp">bad</span><span class="segment-text">Bad time</span></ytd-transcript-segment-renderer>
      </div></ytd-engagement-panel-section-list-renderer>`);
    const result = video.snapshot(document, url);
    expect(JSON.stringify(result.cues)).toBe(JSON.stringify([{ start: 65, text: 'Same line' }, { start: 66, text: 'Same line' }]));
    expect(result.transcriptState).toBe('possibly-incomplete');
  });

  it('extracts alternate rendered view-model rows', () => {
    const video = loadVideo();
    const document = page(`<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><div id="segments-container">
      <transcript-segment-view-model><span class="ytwTranscriptSegmentViewModelTimestamp">01:02:03</span><span class="yt-core-attributed-string">Alternate</span></transcript-segment-view-model>
    </div></ytd-engagement-panel-section-list-renderer>`);
    expect(JSON.stringify(video.snapshot(document, url).cues)).toBe(JSON.stringify([{ start: 3723, text: 'Alternate' }]));
  });

  it('distinguishes unopened from an open but empty transcript and rejects a stale ID', () => {
    const video = loadVideo();
    expect(video.snapshot(page(), url).transcriptState).toBe('unopened');
    expect(video.snapshot(page(), 'https://www.youtube.com/shorts/_i92TmBGF8k').url).toBe('https://www.youtube.com/shorts/_i92TmBGF8k');
    expect(video.snapshot(page('<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><div id="segments-container"></div></ytd-engagement-panel-section-list-renderer>'), url).transcriptState).toBe('open-empty');
    expect(() => video.snapshot(page(), url, 'abcdefghijk')).toThrow(/视频/);
  });

  it('content listener checks active URL against requested ID at response time', () => {
    const video = loadVideo();
    let listener: any;
    const chrome = { runtime: { onMessage: { addListener(fn: any) { listener = fn; } } } };
    const context: any = { chrome, location: { href: url }, document: page(), OcaYouTubeVideo: video };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./content.js', import.meta.url), 'utf8'), context);
    let reply: any;
    listener({ type: 'oca-youtube-snapshot', expectedVideoId: 'abcdefghijk' }, {}, (value: any) => reply = value);
    expect(reply.ok).toBe(false);
    context.location.href = 'https://www.youtube.com/watch?v=abcdefghijk';
    listener({ type: 'oca-youtube-snapshot', expectedVideoId: 'abcdefghijk' }, {}, (value: any) => reply = value);
    expect(reply.ok).toBe(true);
    expect(reply.payload.videoId).toBe('abcdefghijk');
  });
});
