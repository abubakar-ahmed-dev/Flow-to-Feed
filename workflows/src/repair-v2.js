const v = $json;
const prep = $('Prepare').first().json;
const prompt = [
  'Your previous reply could not be used: ' + v.error.message,
  '',
  'Redo the analysis. Reply ONLY with these labeled lines, nothing else - no markdown headings, no bullets markers, no commentary:',
  '',
  'Title: <3-6 word diagram title>',
  'Components: <comma-separated component names>',
  'Flow 1 (<label>): <Component> -> <Component>',
  'Assumptions: <comma-separated unstated details, or none>',
  'Summary: <2-3 sentences explaining the mechanism>',
  '',
  'Example of the exact shape:',
  'Title: Queue Worker Pipeline',
  'Components: API, Jobs queue, Worker, Results database',
  'Flow 1 (Enqueue): API -> Jobs queue',
  'Flow 2 (Consume): Worker -> Jobs queue',
  'Flow 3 (Persist): Worker -> Results database',
  'Assumptions: none',
  'Summary: Producers hand jobs to the queue and workers drain it, persisting results.',
  '',
  'Original task:',
  prep.prompt,
].join('\n');
return [{ json: { jobId: v.jobId, prompt } }];
