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

  it('collects virtualized transcript rows from top to bottom and restores the reader position', async () => {
    const video = loadVideo();
    const document = page(`<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><div id="segments-container"></div></ytd-engagement-panel-section-list-renderer>`);
    const panel = document.querySelector('ytd-engagement-panel-section-list-renderer') as HTMLElement;
    const container = panel.querySelector('#segments-container') as HTMLElement;
    const lines = ['First', 'Second', 'Third'];
    let position = 100;
    const render = () => {
      const index = Math.min(2, Math.round(position / 100));
      container.innerHTML = `<ytd-transcript-segment-renderer><span class="segment-timestamp">0:0${index}</span><span class="segment-text">${lines[index]}</span></ytd-transcript-segment-renderer>`;
    };
    Object.defineProperties(panel, {
      clientHeight: { get: () => 100 }, scrollHeight: { get: () => 300 },
      scrollTop: { get: () => position, set: (value: number) => { position = Math.max(0, Math.min(200, value)); render(); } },
    });
    render();
    expect(video.snapshot(document, url).cues.length).toBe(1);
    const result = await video.collect(document, url, 'M7lc1UVf-VE', { waitForRender: async () => {}, maxSteps: 10 });
    expect(JSON.stringify(result.cues)).toBe(JSON.stringify([
      { start: 0, text: 'First' }, { start: 1, text: 'Second' }, { start: 2, text: 'Third' },
    ]));
    expect(result.transcriptState).toBe('complete');
    expect(panel.scrollTop).toBe(100);
  });

  it('collects rows when the transcript uses the page scrollbar', async () => {
    const video = loadVideo();
    const document = page(`<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><div id="segments-container"></div></ytd-engagement-panel-section-list-renderer>`);
    const container = document.querySelector('#segments-container') as HTMLElement;
    const pageScroller = document.documentElement;
    let position = 100;
    const render = () => {
      const index = Math.min(2, Math.round(position / 100));
      container.innerHTML = `<ytd-transcript-segment-renderer><span class="segment-timestamp">0:0${index}</span><span class="segment-text">Line ${index}</span></ytd-transcript-segment-renderer>`;
    };
    Object.defineProperties(pageScroller, {
      clientHeight: { get: () => 100 }, scrollHeight: { get: () => 300 },
      scrollTop: { get: () => position, set: (value: number) => { position = Math.max(0, Math.min(200, value)); render(); } },
    });
    render();
    const result = await video.collect(document, url, 'M7lc1UVf-VE', { waitForRender: async () => {}, maxSteps: 10 });
    expect(result.cues.map((cue: any) => cue.text).join(',')).toBe('Line 0,Line 1,Line 2');
    expect(pageScroller.scrollTop).toBe(100);
  });

  it('skips a tall but non-scrollable wrapper to use the actual transcript scroller', async () => {
    const video = loadVideo();
    const document = page(`<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><div id="segments-container"></div></ytd-engagement-panel-section-list-renderer>`);
    const panel = document.querySelector('ytd-engagement-panel-section-list-renderer') as HTMLElement;
    const container = panel.querySelector('#segments-container') as HTMLElement;
    Object.defineProperties(container, {
      clientHeight: { get: () => 100 }, scrollHeight: { get: () => 300 },
      scrollTop: { get: () => 0, set: () => {} },
    });
    let position = 100;
    const render = () => {
      const index = Math.min(2, Math.round(position / 100));
      container.innerHTML = `<ytd-transcript-segment-renderer><span class="segment-timestamp">0:0${index}</span><span class="segment-text">Line ${index}</span></ytd-transcript-segment-renderer>`;
    };
    Object.defineProperties(panel, {
      clientHeight: { get: () => 100 }, scrollHeight: { get: () => 300 },
      scrollTop: { get: () => position, set: (value: number) => { position = Math.max(0, Math.min(200, value)); render(); } },
    });
    render();
    const result = await video.collect(document, url, 'M7lc1UVf-VE', { waitForRender: async () => {}, maxSteps: 10 });
    expect(result.cues.map((cue: any) => cue.text).join(',')).toBe('Line 0,Line 1,Line 2');
    expect(panel.scrollTop).toBe(100);
  });

  it('returns an explicitly incomplete result before a long transcript traversal monopolizes the message channel', async () => {
    const video = loadVideo();
    const document = page(`<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><div id="segments-container">
      <ytd-transcript-segment-renderer><span class="segment-timestamp">0:01</span><span class="segment-text">First line</span></ytd-transcript-segment-renderer>
    </div></ytd-engagement-panel-section-list-renderer>`);
    const panel = document.querySelector('ytd-engagement-panel-section-list-renderer') as HTMLElement;
    let position = 0;
    Object.defineProperties(panel, {
      clientHeight: { get: () => 100 }, scrollHeight: { get: () => 100000 },
      scrollTop: { get: () => position, set: (value: number) => { position = value; } },
    });
    let elapsed = 0;
    let waits = 0;
    const result = await video.collect(document, url, 'M7lc1UVf-VE', {
      waitForRender: async () => { elapsed += 400; waits++; }, now: () => elapsed, maxDurationMs: 25000,
    });
    expect(waits).toBeLessThan(80);
    expect(result.transcriptState).toBe('possibly-incomplete');
    expect(result.cues[0].text).toBe('First line');
    expect(panel.scrollTop).toBe(0);
  });

  it('distinguishes unopened from an open but empty transcript and rejects a stale ID', () => {
    const video = loadVideo();
    expect(video.snapshot(page(), url).transcriptState).toBe('unopened');
    expect(video.snapshot(page(), 'https://www.youtube.com/shorts/_i92TmBGF8k').url).toBe('https://www.youtube.com/shorts/_i92TmBGF8k');
    expect(video.snapshot(page('<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><div id="segments-container"></div></ytd-engagement-panel-section-list-renderer>'), url).transcriptState).toBe('open-empty');
    expect(() => video.snapshot(page(), url, 'abcdefghijk')).toThrow(/视频/);
  });
  it('reports an expanded transcript whose segment container no longer matches the selector', () => {
    const video = loadVideo();
    const document = page('<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><div class="new-transcript-layout"><span class="new-timestamp">0:01</span></div></ytd-engagement-panel-section-list-renderer>');
    const result = video.snapshot(document, url);
    expect(result.transcriptState).toBe('open-unrecognized');
    expect(JSON.stringify(result.transcriptDiagnostics)).toBe(JSON.stringify({ panel: 1, expanded: 1, container: 0, rows: 0, timestamps: 1 }));
  });
  it('binds Shorts metadata to the active reel and rejects a transitioning reel', () => {
    const video = loadVideo();
    const shortUrl = 'https://www.youtube.com/shorts/_i92TmBGF8k';
    const document = page(`<meta property="og:title" content="Previous watch title">
      <ytd-watch-metadata><h1>Previous watch title</h1></ytd-watch-metadata>
      <ytd-video-owner-renderer><a>Previous channel</a></ytd-video-owner-renderer>
      <div id="description-inline-expander">Previous description</div>
      <ytd-reel-video-renderer video-id="M7lc1UVf-VE"><h2>Inactive reel</h2></ytd-reel-video-renderer>
      <ytd-reel-video-renderer is-active video-id="_i92TmBGF8k">
        <yt-shorts-video-title-view-model><h2>Current Short</h2></yt-shorts-video-title-view-model>
        <div id="channel-name">Current channel</div><div id="description-inline-expander">Current description</div>
      </ytd-reel-video-renderer>`);
    const result = video.snapshot(document, shortUrl);
    expect(result.title).toBe('Current Short');
    expect(result.channel).toBe('Current channel');
    expect(result.description).toBe('Current description');
    document.querySelector('[is-active]')?.setAttribute('video-id', 'abcdefghijk');
    expect(() => video.snapshot(document, shortUrl)).toThrow(/切换|匹配/);
  });

  it('prefers the full current-video description over rendered controls and rejects stale player data', () => {
    const video = loadVideo();
    const document = page(`<script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: 'M7lc1UVf-VE', shortDescription: '第一句。第二句。第三句。' } })};</script>
      <div id="description-inline-expander">第一句。第二句。第三句。 …更多 2.03万位订阅者 视频详细信息</div>`);
    expect(video.snapshot(document, url).description).toBe('第一句。第二句。第三句。');
    document.querySelector('script')!.textContent = `var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: 'abcdefghijk', shortDescription: 'Previous video' } })};`;
    expect(() => video.snapshot(document, url)).toThrow(/切换|刷新/);
  });

  it('uses metadata and caption availability bound to the current watch video despite stale SPA tags', () => {
    const video = loadVideo();
    const currentUrl = 'https://www.youtube.com/watch?v=x4DL9SRA3Og';
    const document = page(`<meta property="og:title" content="Previous SOC title">
      <ytd-watch-flexy video-id="x4DL9SRA3Og"><ytd-watch-metadata><h1>Still stale</h1></ytd-watch-metadata></ytd-watch-flexy>
      <ytd-video-owner-renderer><a>Previous channel</a></ytd-video-owner-renderer>
      <script>var ytInitialPlayerResponse = ${JSON.stringify({
        videoDetails: { videoId: 'x4DL9SRA3Og', title: 'GPU architecture', author: 'Current channel', shortDescription: 'Current description' },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'zh-Hans' }] } },
      })};</script>`);
    const result = video.snapshot(document, currentUrl);
    expect(result.title).toBe('GPU architecture');
    expect(result.channel).toBe('Current channel');
    expect(result.description).toBe('Current description');
    expect(result.captionsAvailable).toBe(true);
  });

  it('content listener keeps the message channel open while collecting and checks the active ID', async () => {
    const video = loadVideo();
    let listener: any;
    const chrome = { runtime: { onMessage: { addListener(fn: any) { listener = fn; } } } };
    const context: any = { chrome, location: { href: url }, document: page(), OcaYouTubeVideo: video };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./content.js', import.meta.url), 'utf8'), context);
    let firstReply!: (value: any) => void;
    const first = new Promise<any>(resolve => { firstReply = resolve; });
    expect(listener({ type: 'oca-youtube-snapshot', expectedVideoId: 'abcdefghijk' }, {}, firstReply)).toBe(true);
    expect((await first).ok).toBe(false);
    context.location.href = 'https://www.youtube.com/watch?v=abcdefghijk';
    let secondReply!: (value: any) => void;
    const second = new Promise<any>(resolve => { secondReply = resolve; });
    expect(listener({ type: 'oca-youtube-snapshot', expectedVideoId: 'abcdefghijk' }, {}, secondReply)).toBe(true);
    const reply = await second;
    expect(reply.ok).toBe(true);
    expect(reply.payload.videoId).toBe('abcdefghijk');
  });
});
