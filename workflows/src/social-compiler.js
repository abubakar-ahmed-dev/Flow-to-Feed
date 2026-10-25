/**
 * Pure labeled-line parser for social adaptations. Gemma-4 writes labeled
 * lines natively (see phase 5 log); continuation lines append to the current
 * label. Plain-length X check here; authoritative weighted validation happens
 * at save time (packages/shared/src/social.ts).
 */

function parseLabeled(text) {
  const lines = text.replace(/\\rightarrow/g, '→').split(/\r?\n/);
  const entries = [];
  let current = null;
  const LABEL = /^(Title|Caption|Slide|Post|Paragraph)\s*(\d*)\s*:\s*(.*)$/i;
  for (const raw of lines) {
    const m = raw.match(LABEL);
    if (m) {
      current = { label: m[1].toLowerCase(), n: m[2] ? parseInt(m[2], 10) : 0, rest: m[3] ?? '' };
      entries.push(current);
    } else if (current && raw.trim()) {
      current.rest += '\n' + raw.trim();
    }
  }
  return entries;
}

const clean = (s) => String(s || '').replace(/\*\*/g, '').replace(/^-/, '').trim();

export function compileSocial(platform, text, model) {
  const entries = parseLabeled(text);
  let content = null;
  if (platform === 'instagram') {
    const title = clean(entries.find((e) => e.label === 'title')?.rest);
    const caption = clean(entries.find((e) => e.label === 'caption')?.rest);
    const slides = entries
      .filter((e) => e.label === 'slide')
      .map((e) => {
        const sep = e.rest.indexOf('|');
        return sep >= 0
          ? { heading: clean(e.rest.slice(0, sep)), body: clean(e.rest.slice(sep + 1)) }
          : { heading: clean(e.rest.slice(0, 48)), body: clean(e.rest.slice(48)) };
      })
      .filter((s) => s.heading || s.body)
      .slice(0, 6);
    content = { instagram: { title, caption, slides } };
    if (!title || !caption || slides.length < 4) {
      return { ok: false, error: { code: 'analysis_unusable', message: 'reply missing Title/Caption/at least 4 Slide lines' } };
    }
  } else if (platform === 'x') {
    const posts = entries.filter((e) => e.label === 'post').map((e) => clean(e.rest)).filter(Boolean).slice(0, 5);
    content = { x: { posts } };
    console.log('[social-compiler] x posts parsed:', entries.filter((e) => e.label === 'post').length, 'kept:', posts.length);
    if (posts.length < 3) {
      return { ok: false, error: { code: 'analysis_unusable', message: 'reply has fewer than 3 Post lines' } };
    }
    const over = posts.filter((p) => p.length > 280);
    if (over.length) {
      return { ok: false, error: { code: 'analysis_unusable', message: over.length + ' post(s) exceed 280 plain characters; shorten them' } };
    }
  } else if (platform === 'facebook') {
    const title = clean(entries.find((e) => e.label === 'title')?.rest);
    const paragraphs = entries.filter((e) => e.label === 'paragraph').map((e) => clean(e.rest)).filter(Boolean);
    content = { facebook: { title, paragraphs } };
    if (!title || paragraphs.length < 2) {
      return { ok: false, error: { code: 'analysis_unusable', message: 'reply missing Title or at least 2 Paragraph lines' } };
    }
  } else {
    return { ok: false, error: { code: 'bad_platform', message: 'unknown platform ' + platform } };
  }
  return {
    ok: true,
    result: {
      platform,
      content,
      model,
      promptVersion: 'social-' + platform + '-v2',
    },
  };
}
