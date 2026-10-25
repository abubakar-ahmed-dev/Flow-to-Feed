/**
 * Pure analysis -> Mermaid compiler. No n8n globals — imported by the workflow
 * (via the Validate wrapper), by unit tests, and reusable app-side.
 *
 * Gemma-4 (hosted) answers every structured-output contract with labeled-line
 * analysis in its native bullet style. Contracts:
 *   architecture: Title/Components/Flow N/Assumptions/Summary  -> architecture-beta
 *   flowchart:    same analysis                                 -> flowchart TD
 *   sequence:     same analysis (flows = ordered interactions)  -> sequenceDiagram
 */

const ARROW = /(?:→|->|-->)/;

// The model sometimes echoes prompt scaffolding (rule text, placeholders,
// validation words) into Components/Flows. These lines compile into junk
// nodes ("max 3 words each", "<Component>- ?", "Yes"), so drop them here.
const ECHO_TAIL = /\s*[-–—:]\s*(correct|incorrect|yes|no|ok|none|stated|unstated)\s*$/i;
const JUNK_NAME = /(^|[^a-z])(max|comma|separated|unstated|rule|rules|instruction|passage|format|placeholder|template|words|each|total|n\/a|tbd|sentence|markdown|labels?|title|summary|assumptions?|components?|flows?|example|examples|step \d)([^a-z]|$)/i;

function cleanName(raw) {
  return raw
    .replace(/\([^)]*\)/g, '')
    .replace(/\$/g, '')
    .replace(ECHO_TAIL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
}

function isJunk(name) {
  if (name.length < 2 || name.length > 40) return true;
  if (/[<>?]/.test(name)) return true;
  if (/^(none|yes|no|ok|correct|true|false|n\/a|tbd|unknown|missing)$/i.test(name)) return true;
  return JUNK_NAME.test(name);
}

export function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'svc';
}

export function iconType(name) {
  const n = name.toLowerCase();
  if (/(cache|redis|memcache)/.test(n)) return 'cache';
  if (/(db|database|postgres|mysql|sql\b|store|storage)/.test(n)) return 'database';
  if (/(internet|client|user|browser)/.test(n)) return 'internet';
  if (/cloud/.test(n)) return 'cloud';
  if (/(disk|file\b|volume)/.test(n)) return 'disk';
  return 'server';
}

function parseAnalysis(raw) {
  // Gemma writes LaTeX arrows ($\rightarrow$); normalize to unicode first.
  const norm = raw.replace(/\\rightarrow/g, '→');
  const lines = norm.split(/\r?\n/).map(l => l.replace(/^\s*\*\s*/, '').replace(/\*\*/g, '').trim()).filter(Boolean);
  const comps = new Map();
  const flows = []; // { label, chain: [names] }
  let title = null;
  let summary = null;
  const assumptions = [];
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
        const name = cleanName(part);
        if (name && !isJunk(name) && name.split(/\s+/).length <= 4) comps.set(slug(name), name);
      }
      continue;
    }
    if (/^Flow/i.test(line)) {
      const labelMatch = line.match(/^Flow\s*\d*\s*\(([^)]*)\)/i);
      const body = line.replace(/^Flow\s*\d*\s*[^:]*:\s*/i, '');
      for (const seg of body.split(/,(?![^()]*\))/)) {
        if (!ARROW.test(seg)) continue;
        const chain = seg.split(ARROW).map(s => cleanName(s.replace(/^[^:]*:\s*/, ''))).filter(Boolean);
        if (chain.length < 2) continue;
        if (chain.some(isJunk)) continue; // echoed rule/placeholder in the chain poisons the edge
        for (const p of chain) if (!comps.has(slug(p))) comps.set(slug(p), p);
        flows.push({ label: (labelMatch ? labelMatch[1] : '').trim() || 'flow', chain });
      }
    }
  }
  // Cap components; drop flows that reference capped-out names (an edge to an
  // undeclared node is a render error in architecture-beta).
  if (comps.size > 12) {
    for (const key of [...comps.keys()].slice(12)) comps.delete(key);
    for (let i = flows.length - 1; i >= 0; i--) {
      if (flows[i].chain.some(p => !comps.has(slug(p)))) flows.splice(i, 1);
    }
  }
  return { comps, flows, title, summary, assumptions };
}

function compileArchitecture(parsed) {
  if (parsed.comps.size === 0) return null;
  const out = ['architecture-beta', '    group app(cloud)[Application]'];
  for (const [s, d] of parsed.comps) out.push('    service ' + s + '(' + iconType(d) + ')[' + d.slice(0, 24) + '] in app');
  const seen = new Set();
  for (const f of parsed.flows) {
    for (let k = 0; k < f.chain.length - 1; k++) {
      const a = slug(f.chain[k]);
      const b = slug(f.chain[k + 1]);
      const key = a + '|' + b;
      if (seen.has(key) || a === b) continue;
      seen.add(key);
      // fixed right/left ports keep chains reading left-to-right; alternating
      // all four port sides scatters nodes across the canvas
      out.push('    ' + a + ':R -- L:' + b);
    }
  }
  return out.join('\n');
}

function compileFlowchart(parsed) {
  if (parsed.flows.length === 0) return null;
  const names = new Map();
  for (const f of parsed.flows) for (const p of f.chain) names.set(slug(p), p);
  const out = ['flowchart TD'];
  for (const [s, d] of names) out.push('    ' + s.replace(/-/g, '_') + '[' + d.slice(0, 28) + ']');
  const seen = new Set();
  for (const f of parsed.flows) {
    for (let k = 0; k < f.chain.length - 1; k++) {
      const a = slug(f.chain[k]).replace(/-/g, '_');
      const b = slug(f.chain[k + 1]).replace(/-/g, '_');
      const key = a + '|' + b + '|' + f.label;
      if (seen.has(key) || a === b) continue;
      seen.add(key);
      out.push('    ' + a + ' -->|' + f.label.slice(0, 20) + '| ' + b);
    }
  }
  return out.join('\n');
}

function compileSequence(parsed) {
  if (parsed.flows.length === 0) return null;
  const order = [];
  for (const f of parsed.flows) for (const p of f.chain) {
    const s = slug(p);
    if (!order.includes(s)) order.push(s);
  }
  const out = ['sequenceDiagram', '    autonumber'];
  for (const s of order) {
    const d = parsed.comps.get(s) || s;
    out.push('    participant ' + s.replace(/-/g, '_') + ' as ' + d.slice(0, 28));
  }
  for (const f of parsed.flows) {
    for (let k = 0; k < f.chain.length - 1; k++) {
      const a = slug(f.chain[k]).replace(/-/g, '_');
      const b = slug(f.chain[k + 1]).replace(/-/g, '_');
      if (a === b) continue;
      out.push('    ' + a + '->>' + b + ': ' + f.label.slice(0, 30));
    }
  }
  return out.join('\n');
}

/**
 * @param {string} analysisText raw model output
 * @param {{mode: 'architecture'|'flowchart'|'sequence', model: string}} opts
 * @returns {{ok: true, result: object} | {ok: false, error: {code: string, message: string}}}
 */
export function compileAnalysis(analysisText, opts) {
  const mode = opts.mode || 'architecture';
  const norm = analysisText.replace(/\\rightarrow/g, '→');
  const parsed = parseAnalysis(norm);
  if (parsed.comps.size === 0) {
    return { ok: false, error: { code: 'analysis_unusable', message: 'reply missing Components/Flows structure' } };
  }
  const mermaid =
    mode === 'flowchart' ? compileFlowchart(parsed) :
    mode === 'sequence' ? compileSequence(parsed) :
    compileArchitecture(parsed);
  if (!mermaid) {
    return { ok: false, error: { code: 'analysis_unusable', message: 'reply missing Flows structure for ' + mode } };
  }
  return {
    ok: true,
    normalized: norm,
    result: {
      title: (parsed.title || 'Architecture').slice(0, 120),
      mermaid,
      explanation: parsed.summary || 'Diagram compiled from the model analysis of the selected passage.',
      assumptions: parsed.assumptions,
      model: opts.model,
      promptVersion: (mode + '-v2-compiled'),
      componentCount: parsed.comps.size,
    },
  };
}
