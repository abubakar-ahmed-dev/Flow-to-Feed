# Prompt: flowchart-v2

Same labeled-line analysis contract as `architecture-v2.md`, with a flowchart goal. The workflow compiles the analysis to `flowchart TD` (steps as nodes, flow labels as edge labels). See `architecture-v2.md` for the full template and rules; only the opening line differs:

Analyze the passage for a flowchart (decision points and the order of steps). Reply ONLY with these labeled lines, nothing else.

Compiler notes:
- `Flow N (label): A -> B -> C` lines become `A -->|label| B` edges.
- Decision branches: emit one flow per branch (e.g. `Flow 2 (cache hit): App -> Client`, `Flow 3 (cache miss): App -> DB -> App`).
