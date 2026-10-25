// n8n Validate node body — compileAnalysis() is inlined at provision time.
const resp = $json;
const prep = $('Prepare').first().json;
const jobId = prep.jobId;
let text = '';
try { text = (resp.candidates[0].content.parts || []).map(p => p.text || '').join(''); } catch (e) {}
const out = compileAnalysis(text, { mode: prep.mode, model: $env.GEMMA_MODEL });
const result = out.ok ? out.result : null;
const error = out.ok ? null : out.error;
return [{ json: { jobId, ok: !!result, result, error, rawText: out.normalized || '' } }];
