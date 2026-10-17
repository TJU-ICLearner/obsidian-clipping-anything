(() => {
  'use strict';
  const ID = /^[A-Za-z0-9_-]{11}$/;
  const oneLine = value => String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const md = value => oneLine(value).replace(/([\\`*_{}\[\]()<>#+!|~])/g, '\\$1');
  const yaml = value => JSON.stringify(String(value || '').replace(/[\u0000-\u001f]/g, ' '));
  function stamp(seconds) {
    const n = Math.floor(seconds);
    const hh = Math.floor(n / 3600);
    const mm = Math.floor(n / 60) % 60;
    const ss = n % 60;
    return hh ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  function safeFolder(value) {
    const parts = String(value || 'Clippings/YouTube').split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || /[\\:\u0000-\u001f]/.test(part))) throw new Error('目标文件夹无效。');
    return parts.join('/');
  }
  function safeTitle(value) {
    const cleaned = oneLine(value).replace(/[\\/:*?"<>|.]+/g, ' ').replace(/\s+/g, ' ').trim();
    const encoder = new TextEncoder();
    let result = '';
    let bytes = 0;
    for (const character of cleaned) {
      const length = encoder.encode(character).length;
      if (bytes + length > 180) break;
      result += character;
      bytes += length;
    }
    return result.trim() || 'YouTube video';
  }
  function randomSuffix(randomBytes) {
    const bytes = randomBytes ? randomBytes() : crypto.getRandomValues(new Uint8Array(8));
    if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1 || bytes.length < 4) throw new Error('无法生成唯一笔记名。');
    return Array.from(bytes.slice(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function cleanDescription(value) {
    let source = String(value || '').replace(/\r\n?/g, '\n');
    source = source.split(/…更多|\.\.\.更多|视频详细信息|\bShow more\b|\bVideo details\b/i)[0];
    const lines = source.split('\n').map(line => line.trim())
      .filter(line => line && !/^(?:#[^\s#]+\s*)+$/.test(line))
      .map(line => line.replace(/(?:\s*#[\p{L}\p{N}_-]+)+\s*$/gu, '').trim())
      .filter(Boolean);
    return lines.join('\n').trim();
  }
  function untimedSentences(description, title = '') {
    const cleaned = cleanDescription(description);
    if (!cleaned) return [];
    const promotion = /https?:\/\/|www\.|加入会员|订阅频道|资料包|优惠码|购买链接|关注公众号/i;
    const lines = cleaned.split('\n').filter(line => !promotion.test(line));
    if (lines.length > 1 && lines[0].length < 100 && !/[。！!]$/.test(lines[0]) && lines.slice(1).join('').length >= 60) lines.shift();
    let prose = lines.join(' ');
    const titleLead = oneLine(title).split(/[？?（(]/)[0];
    const firstStop = prose.indexOf('。');
    if (titleLead.length >= 4 && prose.startsWith(titleLead) && firstStop > 18 && firstStop < 150
      && prose.slice(0, firstStop).includes('（') && prose.length - firstStop > 60) {
      prose = prose.slice(firstStop + 1).trim();
    }
    const sentences = prose.replace(/\.\s+(?=[A-Z])/g, '.\n')
      .split('\n').flatMap(line => line.match(/[^。！？!?]+[。！？!?]?/g) || [])
      .map(line => line.trim()).filter(Boolean);
    return sentences.length >= 3 && sentences.join('').length >= 60 ? sentences : [];
  }
  function build(snapshot, options = {}) {
    const id = String(snapshot?.videoId || '');
    if (!ID.test(id)) throw new Error('YouTube 视频 ID 无效。');
    const folder = safeFolder(options.folder);
    const now = options.now ? new Date(options.now) : new Date();
    if (Number.isNaN(now.getTime())) throw new Error('剪藏时间无效。');
    const iso = now.toISOString();
    const title = oneLine(snapshot.title) || `YouTube ${id}`;
    let source = `https://www.youtube.com/watch?v=${id}`;
    if (snapshot.url) {
      const raw = new URL(snapshot.url);
      if (raw.protocol !== 'https:' || raw.hostname !== 'www.youtube.com') throw new Error('视频来源链接无效。');
      if (raw.pathname === `/shorts/${id}` || raw.pathname === `/shorts/${id}/`) source = `https://www.youtube.com/shorts/${id}`;
      else if (raw.pathname !== '/watch' || raw.searchParams.getAll('v').length !== 1 || raw.searchParams.get('v') !== id) throw new Error('视频来源链接与 ID 不匹配。');
    }
    const suffix = randomSuffix(options.randomBytes);
    const filepath = `${folder}/${safeTitle(title)} ${id} ${iso.replace(/[:.]/g, '-')}-${suffix}.md`;
    const lines = [
      '---',
      'clip_platform: youtube',
      `youtube_id: ${yaml(id)}`,
      `title: ${yaml(title)}`,
      `source: ${yaml(source)}`,
      `clipped_at: ${yaml(iso)}`,
      '---', '',
      `# ${md(title)}`, '',
      `**频道：** ${md(snapshot.channel || '未知')}`, '',
      `**来源：** ${source}`, '',
      `<iframe src="https://www.youtube.com/embed/${id}?enablejsapi=1" title="YouTube video" width="100%" height="360" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`,
    ];
    const description = cleanDescription(snapshot.description);
    const cues = Array.isArray(snapshot.cues) ? snapshot.cues : [];
    const untimed = cues.length ? [] : untimedSentences(description, title);
    if (description && !untimed.length) lines.push('', '## 简介', '', md(description));
    if (Array.isArray(snapshot.chapters) && snapshot.chapters.length) {
      lines.push('', '## 章节', '');
      for (const chapter of snapshot.chapters) if (Number.isFinite(chapter.start) && chapter.start >= 0 && oneLine(chapter.title)) lines.push(`\`${stamp(chapter.start)}\` ${md(chapter.title)}`);
    }
    lines.push('', untimed.length ? '## 简介摘录' : '## 字幕', '');
    let count = 0;
    for (const cue of cues) {
      if (!Number.isFinite(cue.start) || cue.start < 0 || !oneLine(cue.text)) continue;
      lines.push(`\`${stamp(cue.start)}\` ${md(cue.text)}`);
      count++;
    }
    if (!count && untimed.length) {
      lines.push('由视频简介整理，未经音频校对，无时间轴。非完整字幕。', '');
      for (const sentence of untimed) lines.push(md(sentence));
    } else if (!count) lines.push('未从页面读取到文字记录。可在 YouTube 页面打开文字记录后重新剪藏。');
    return { markdown: lines.join('\n') + '\n', filepath };
  }
  globalThis.OcaYouTubeNote = { build, stamp, untimedSentences };
})();
