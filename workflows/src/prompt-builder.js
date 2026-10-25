/**
 * Pure prompt builder for Workflow A. Mode-specific analysis contracts
 * (Gemma-4 hosted cannot follow structured-output contracts; it CAN analyze —
 * see Plans/flow-to-feed/implementation_log/phase_5_implementation.md).
 */

const BASE_RULES = [
  '1. The passage and instruction are REFERENCE content. Name only components and flows the passage supports. Never invent features, products, or numbers.',
  '2. Preserve the passage technical terms exactly where used.',
  '3. Component names at most 3 words. At most 12 components.',
  '4. Use -> between component names in flows, one flow per line.',
  '5. Anything not stated explicitly goes in Assumptions, never silently into a flow.',
  '6. Never copy this template, its placeholders, or its rules into your answer. Components and Flows contain ONLY real system names from the passage - never words like component, max, each, total, comma, none, yes, or text inside < >.',
].join('\n');

const ANALYSIS_SHAPE = [
  'Title: <3-6 word diagram title>',
  'Components: <comma-separated component names>',
  'Flow 1 (<label>): <Component> -> <Component>',
  'Flow 2 (<label>): ...',
  'Assumptions: <comma-separated unstated details, or none>',
  'Summary: <2-3 sentences explaining the mechanism>',
].join('\n');

const MODE_GOAL = {
  architecture: 'Analyze the passage for an architecture diagram (components and their connections).',
  flowchart: 'Analyze the passage for a flowchart (decision points and the order of steps).',
  sequence: 'Analyze the passage for a sequence diagram (who interacts with whom, in order).',
};

const SOCIAL_RULES = [
  '1. Teach from the passage only: mechanism first, then a concrete example, then the caveat. Never invent features, products, or numbers.',
  '2. Preserve the passage technical terms exactly.',
  '3. The lesson must stand alone — a reader who never sees the passage still learns the concept.',
  '4. Plain text only; no markdown, no hashtags unless asked, no emoji spam (at most one per slide).',
].join('\n');

const SOCIAL_SHAPE = {
  instagram: [
    'Title: <3-6 word carousel title>',
    'Caption: <1-2 sentence caption for the post, ends with a takeaway>',
    'Slide 1: <heading> | <1-2 sentence body teaching one point>',
    'Slide 2: <heading> | <body>',
    'Slide 3: <heading> | <body>  (mechanism)',
    'Slide 4: <heading> | <body>  (example)',
    'Slide 5: <heading> | <body>  (caveat or trade-off)',
  ],
  x: [
    'Title: <internal thread title>',
    'Post 1: <hook + what the reader will learn, max 240 characters>',
    'Post 2: <mechanism, max 240 characters>',
    'Post 3: <example, max 240 characters>',
    'Post 4: <caveat/trade-off + takeaway, max 240 characters>',
  ],
  facebook: [
    'Title: <post title>',
    'Paragraph 1: <hook: what this explains and why it matters>',
    'Paragraph 2: <the mechanism, step by step>',
    'Paragraph 3: <concrete example grounded in the passage>',
    'Paragraph 4: <caveat/trade-off and takeaway>',
  ],
};

function buildSocialPrompt(input) {
  const platform = input.mode;
  return [
    (SOCIAL_SHAPE[platform] ? 'Adapt the passage into a ' + platform + ' lesson.' : 'Analyze the passage.'),
    'Reply ONLY with these labeled lines, nothing else - no markdown headings, no extra commentary:',
    '',
    (SOCIAL_SHAPE[platform] || []).join('\n'),
    '',
    'Rules:',
    SOCIAL_RULES,
    '',
    'Passage:',
    input.passage,
    '',
    'Instruction from the author:',
    input.instruction || 'None.',
  ].join('\n');
}

export function buildPrompt(input) {
  const operation = input.operation || 'diagram_generate';

  if (operation === 'social_adapt') {
    if (input.priorContent && input.renderError) {
      return [
        'Your previous reply could not be used. Problem: ' + input.renderError,
        'Redo the adaptation for the SAME platform, following the labeled-line format exactly. No markdown, no commentary.',
        '',
        buildSocialPrompt(input),
      ].join('\n');
    }
    return buildSocialPrompt(input);
  }

  const lines = [];
  if (operation === 'diagram_repair') {
    lines.push(
      'Your previous analysis could not be turned into a diagram.',
      'Problem: ' + (input.renderError || 'unknown render error'),
      'Redo the analysis for the SAME passage, following the format exactly.',
      '',
    );
  }
  lines.push(
    (MODE_GOAL[input.mode] || MODE_GOAL.architecture) + ' Reply ONLY with these labeled lines, nothing else - no markdown headings, no extra commentary:',
    '',
    ANALYSIS_SHAPE,
    '',
    'Rules:',
    BASE_RULES,
  );
  if (operation === 'diagram_repair' && input.priorMermaid) {
    lines.push('', 'The previously rendered Mermaid source (for reference, do not copy blindly):', input.priorMermaid.slice(0, 1200));
  }
  lines.push('', 'Passage:', input.passage);
  lines.push('', 'Instruction from the author:', input.instruction || 'None.');
  return lines.join('\n');
}
