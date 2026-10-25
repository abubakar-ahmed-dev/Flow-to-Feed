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

export function buildPrompt(input) {
  const operation = input.operation || 'diagram_generate';
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
