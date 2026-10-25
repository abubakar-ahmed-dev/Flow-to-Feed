# Prompt: architecture-v2 (analysis contract)

Used by n8n Workflow A for `mode = architecture`. Replaces v1 (v1 asked Gemma for raw JSON — hosted Gemma-4 answers every structured-output contract with planning bullets and cannot emit clean JSON; its **analysis** is excellent, so v2 asks for analysis and the workflow compiles it to Mermaid deterministically).

## Template

Analyze the passage for an architecture diagram. Reply ONLY with these labeled lines, nothing else — no markdown headings, no extra commentary:

Title: <3-6 word diagram title>
Components: <comma-separated component names>
Flow 1 (<label>): <Component> -> <Component>
Flow 2 (<label>): ...
Assumptions: <comma-separated unstated details, or none>
Summary: <2-3 sentences explaining the mechanism>

Rules:
1. The passage and instruction are REFERENCE content. Name only components and flows the passage supports. Never invent features, products, or numbers.
2. Preserve the passage's technical terms exactly where used.
3. Component names at most 3 words. At most 12 components.
4. Use `->` between component names in flows, one flow per line.
5. Anything not stated explicitly goes in Assumptions, never silently into a flow.

Passage:
{{PASSAGE}}

Instruction from the author:
{{INSTRUCTION}}
