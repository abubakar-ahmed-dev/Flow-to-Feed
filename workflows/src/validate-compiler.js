const resp = $json;
const prep = $('Prepare').first().json;
const jobId = prep.jobId;
let text = '';
try { text = (resp.candidates[0].content.parts || []).map(p => p.text || '').join(''); } catch (e) {}
// Gemma writes LaTeX arrows ($\rightarrow$); normalize to unicode first.
const norm = text.replace(/\\rightarrow/g, '→');
const lines = norm.split(/\r?\n/).map(l => l.replace(/^\s*\*\s*/, '').replace(/\*\*/g, '').trim()).filter(Boolean);
const ARROW = /(?:→|->|-->)/;
const comps = new Map();
const edges = [];
let title = null;
let summary = null;
const assumptions = [];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'svc';
const iconType = n => {
  n = n.toLowerCase();
  if (/(cache|redis|memcache)/.test(n)) return 'cache';
  if (/(db|database|postgres|mysql|sql\b|store|storage)/.test(n)) return 'database';
  if (/(internet|client|user|browser)/.test(n)) return 'internet';
  if (/cloud/.test(n)) return 'cloud';
  if (/(disk|file\b|volume)/.test(n)) return 'disk';
  return 'server';
};
for (const line of lines) {
  let m;
  if ((m = line.match(/^Title\s*:\s*(.+)$/i))) { title = m[1].trim().slice(0, 80); continue; }
  if ((m = line.match(/^Summary\s*:\s*(.+)$/i))) { summary = m[1].trim(); continue; }
  if ((m = line.match(/^Assumptions?\s*:\s*(.+)$/i))) {
    for (const a of m[1].split(/,|;/)) if (a.trim() && !/^none$/i.test(a.trim())) assumptions.push(a.trim());
    continue;
  }
  if ((m = line.match(/^Components?\s*:\s*(.+)$/i))) {
    for (const part of m[1].split(/,|;/)) {
      const name = part.replace(/\([^)]*\)/g, '').replace(/\$/g, '').trim().replace(/\.+$/, '');
      if (name && name.split(/\s+/).length <= 4) comps.set(slug(name), name);
    }
    continue;
  }
  if (/^Flow/i.test(line)) {
    const body = line.replace(/^Flow\s*\d*\s*[^:]*:\s*/i, '');
    for (const seg of body.split(/,(?![^()]*\))/)) {
      if (!ARROW.test(seg)) continue;
      const parts = seg.split(ARROW).map(s => s.replace(/^[^:]*:\s*/, '').replace(/\([^)]*\)/g, '').replace(/\$/g, '').replace(/\.+$/, '').trim()).filter(Boolean);
      for (let i = 0; i < parts.length - 1; i++) {
        const a = parts[i];
        const b = parts[i + 1];
        if (a.split(/\s+/).length > 4 || b.split(/\s+/).length > 4) continue;
        for (const p of [a, b]) if (!comps.has(slug(p))) comps.set(slug(p), p);
        edges.push([slug(a), slug(b)]);
      }
    }
  }
}
let result = null;
let errMsg = null;
if (comps.size === 0) {
  errMsg = 'analysis missing Components/Flows structure';
} else {
  const dirs = ['R', 'L', 'T', 'B'];
  const out = ['architecture-beta', '    group app(cloud)[Application]'];
  let i = 0;
  for (const [s, d] of comps) out.push('    service ' + s + '(' + iconType(d) + ')[' + d.slice(0, 24) + '] in app');
  const seen = new Set();
  for (const [a, b] of edges) {
    const k = a + '|' + b;
    if (seen.has(k) || a === b) continue;
    seen.add(k);
    out.push('    ' + a + ':' + dirs[i % 4] + ' -- ' + dirs[(i + 1) % 4] + ':' + b);
    i++;
  }
  result = {
    title: (title || 'Architecture').slice(0, 120),
    mermaid: out.join('\n'),
    explanation: summary || 'Diagram compiled from the model analysis of the selected passage.',
    assumptions,
    model: $env.GEMMA_MODEL,
    promptVersion: 'architecture-v2-compiled',
  };
}
return [{ json: { jobId, ok: !!result, result, error: errMsg ? { code: 'analysis_unusable', message: errMsg } : null, rawText: norm.slice(0, 4000) } }];
