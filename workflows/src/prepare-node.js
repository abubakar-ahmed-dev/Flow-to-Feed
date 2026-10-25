// n8n Prepare node body — buildPrompt() is inlined at provision time.
const b = $json.body || {};
const input = {
  operation: String(b.operation || 'diagram_generate'),
  mode: String(b.mode || 'architecture'),
  passage: String(b.passage || ''),
  instruction: b.instruction ? String(b.instruction) : undefined,
  priorMermaid: b.priorMermaid ? String(b.priorMermaid) : undefined,
  priorContent: b.priorContent ? String(b.priorContent) : undefined,
  renderError: b.renderError ? String(b.renderError) : undefined,
};
return [{ json: { jobId: String(b.jobId || ''), operation: input.operation, mode: input.mode, prompt: buildPrompt(input) } }];
