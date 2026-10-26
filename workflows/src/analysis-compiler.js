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
    .replace(/\.+$/, '') // strip trailing dots BEFORE trim, else "Database ." -> "Database "
    .trim();
}

// Connector words: the model sometimes glues clause fragments into a single
// "component" ("Database, then Application"). A real component name never
// starts with one of these.
const CONNECTOR_START = /^(then|and|or|also|after|next|into|from|to|if|when|where|with|on|at|the|it|its|first|second|finally|invalidate|populates?|updates?|checks?|returns?)\b/i;

function isJunk(name) {
  if (name.length < 2 || name.length > 40) return true;
  if (/[<>?]/.test(name)) return true;
  if (/[,;]/.test(name)) return true; // fragments of a split clause
  if (/^(none|yes|no|ok|correct|true|false|n\/a|tbd|unknown|missing)$/i.test(name)) return true;
  if (CONNECTOR_START.test(name)) return true;
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
    if ((m = line.match(/^Title\s*:\s*(.+)$/i))) {
      // strip echoed meta ("(4 words).*", backticks) and parenthetical annotations
      title = m[1].trim()
        .replace(/\(([^)]*)\)/g, (full, inner) => (/\d|\bword|\bmax|\btotal|\beach|\bchar/i.test(inner) ? '' : full))
        .replace(/\s+/g, ' ')
        .replace(/[\s.*`]+$/, '') // trailing ".", "*", "`" are model echo artifacts
        .trim()
        .slice(0, 80);
      continue;
    }
    if ((m = line.match(/^Summary\s*:\s*(.+)$/i))) { summary = m[1].trim(); continue; }
    if ((m = line.match(/^Assumptions?\s*:\s*(.+)$/i))) {
      for (const piece of m[1].split(/,|;/)) {
        const a = piece.replace(/^["'*(]+|["'*)]+$/g, '').replace(/\*+$/, '').trim();
        // the model echoes format guidance ("\"None\" if nothing unstated",
        // "Unstated details", "None*", "...") as if it were content
        if (!a) continue;
        if (/^none$/i.test(a)) continue;
        if (/nothing unstated|^unstated details|^\.\.+|^format|^template/i.test(a)) continue;
        assumptions.push(a);
      }
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

// Per-flow edge colors (crimson / teal / amber / slate) — hit vs miss style
// path distinctions become visible without reading the labels.
const FLOW_COLORS = ['#c22740', '#0f766e', '#b45309', '#475569'];

const NODE_STYLE = {
  server:   { shape: (l) => `["${l}"]`,  cls: 'app' },
  cloud:    { shape: (l) => `["${l}"]`,  cls: 'app' },
  cache:    { shape: (l) => `("${l}")`,  cls: 'cache' },
  database: { shape: (l) => `[("${l}")]`, cls: 'data' },
  disk:     { shape: (l) => `[("${l}")]`, cls: 'data' },
  internet: { shape: (l) => `(["${l}"])`, cls: 'external' },
};

/**
 * Architecture mode: labeled, color-coded flowchart LR (architecture-beta
 * edges cannot carry labels — verified mermaid 11 limitation — so hit/miss
 * style paths were invisible). Nodes keep type shapes/fills; every flow gets
 * its own edge color and a label on its first hop.
 */
function compileArchitecture(parsed) {
  if (parsed.comps.size === 0) return null;
  const out = ['flowchart LR'];
  const classes = new Map();
  for (const [s, d] of parsed.comps) {
    const style = NODE_STYLE[iconType(d)] || NODE_STYLE.server;
    out.push('    ' + s + style.shape(d.slice(0, 28).replace(/"/g, "'")));
    classes.set(s, style.cls);
  }
  out.push(
    '    classDef app fill:#fbeef0,stroke:#c22740,stroke-width:2px,color:#1c1917',
    '    classDef data fill:#faf8f4,stroke:#78716c,stroke-width:1.5px,color:#1c1917',
    '    classDef cache fill:#eef7f5,stroke:#0f766e,stroke-width:2px,color:#1c1917',
    '    classDef external fill:#f5f1ea,stroke:#44403c,stroke-width:1.5px,color:#1c1917',
  );
  for (const [s, cls] of classes) out.push('    class ' + s + ' ' + cls);

  const seen = new Set();
  const linkStyles = [];
  let ei = 0;
  parsed.flows.forEach((f, fi) => {
    const color = FLOW_COLORS[fi % FLOW_COLORS.length];
    const mine = [];
    let first = true;
    for (let k = 0; k < f.chain.length - 1; k++) {
      const a = slug(f.chain[k]);
      const b = slug(f.chain[k + 1]);
      // collapse by pair: a second flow over the same hop recolors nothing and
      // would only draw parallel noise; its label surfaces on its next new hop
      const key = a + '|' + b;
      if (seen.has(key) || a === b) continue;
      seen.add(key);
      // a bare "Flow 1:" line parses to the generic label "flow" — silence it,
      // an edge reading |flow| tells the reader nothing
      const name = f.label && !/^flow$/i.test(f.label) ? f.label : '';
      const label = first && name ? '|' + name.slice(0, 24).replace(/[|"]/g, '') + '|' : '';
      out.push('    ' + a + ' ' + (label ? '-->' : '---') + label + ' ' + b);
      mine.push(ei++);
      first = false;
    }
    if (mine.length) linkStyles.push('    linkStyle ' + mine.join(',') + ' stroke:' + color + ',color:' + color);
  });
  out.push(...linkStyles);
  return out.join('\n');
}

function compileFlowchart(parsed) {
  if (parsed.flows.length === 0) return null;
  const names = new Map();
  for (const f of parsed.flows) for (const p of f.chain) names.set(slug(p), p);
  const out = ['flowchart TD'];
  for (const [s, d] of names) out.push('    ' + s.replace(/-/g, '_') + '[' + d.slice(0, 28).replace(/[|"]/g, '') + ']');
  const seen = new Set();
  const linkStyles = [];
  let ei = 0;
  parsed.flows.forEach((f, fi) => {
    const color = FLOW_COLORS[fi % FLOW_COLORS.length];
    const mine = [];
    for (let k = 0; k < f.chain.length - 1; k++) {
      const a = slug(f.chain[k]).replace(/-/g, '_');
      const b = slug(f.chain[k + 1]).replace(/-/g, '_');
      const key = a + '|' + b + '|' + f.label;
      if (seen.has(key) || a === b) continue;
      seen.add(key);
      out.push('    ' + a + ' -->|' + f.label.slice(0, 20).replace(/[|"]/g, '') + '| ' + b);
      mine.push(ei++);
    }
    if (mine.length) linkStyles.push('    linkStyle ' + mine.join(',') + ' stroke:' + color + ',color:' + color);
  });
  out.push(...linkStyles);
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
      promptVersion: (mode + '-v3-labeled'),
      componentCount: parsed.comps.size,
    },
  };
}
