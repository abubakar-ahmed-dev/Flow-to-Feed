# Prompt templates

Versioned prompts used by the n8n generation workflow. Each template records its version and the model id it was written for; results store the prompt version used.

Planned templates:

| Template | Purpose | Status |
| --- | --- | --- |
| `architecture-v1.md` | v1: JSON output contract — **superseded** (hosted Gemma-4 cannot emit clean JSON; see `Plans/flow-to-feed/implementation_log/phase_5_implementation.md`) | archived |
| `architecture-v2.md` | v2: labeled-line analysis contract; workflow compiles analysis to `architecture-beta` deterministically | live |
| `flowchart-v2.md` | Flowchart generation (same analysis pattern) | pending |
| `sequence-v2.md` | Sequence diagram generation | pending |
| `social-*-v2` | Channel adaptations (IG carousel / FB explainer / X thread) — labeled-line contracts, compiled by workflows/src/social-compiler.js | live |
| `repair-v2.md` | One corrective retry (embedded in workflow; sources in `workflows/src/`) | live |

Every prompt states: source is reference content, explain only supported mechanisms, preserve caveats and technical terms, mark assumptions, use approved icon identifiers, keep labels short and the graph bounded, and return the requested structured output.
