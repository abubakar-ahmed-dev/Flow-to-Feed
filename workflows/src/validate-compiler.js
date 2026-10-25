// n8n Validate node wrapper — pure logic lives in analysis-compiler.js
import { compileAnalysis } from './analysis-compiler.js';

const resp = $json;
const prep = $('Prepare').first().json;
const jobId = prep.jobId;
let text = '';
try { text = (resp.candidates[0].content.parts || []).map(p => p.text || '').join(''); } catch (e) {}

const out = compileAnalysis(text, { mode: prep.mode, model: $env.GEMMA_MODEL });
const result = out.ok ? { ...out.result } : null;
const error = out.ok ? null : out.error;
return [{ json: { jobId, ok: !!result, result, error, rawText: norm_safe(text).slice(0, 4000) } }];

function norm_safe(t) {
  return t.replace(/\\rightarrow/g, '→');
}
