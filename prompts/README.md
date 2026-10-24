# Prompt templates

Versioned prompts used by the n8n generation workflow. Each template records its version and the model id it was written for; results store the prompt version used.

Planned templates:

| Template | Purpose | Status |
| --- | --- | --- |
| `architecture-v1.md` | Architecture diagram Mermaid source from a passage | pending |
| `flowchart-v1.md` | Flowchart generation | pending |
| `sequence-v1.md` | Sequence diagram generation | pending |
| `social-adapt-v1.md` | Channel-specific educational adaptation (IG/FB/X) | pending |
| `repair-v1.md` | Bounded repair from a validation/parser error | pending |

Every prompt states: source is reference content, explain only supported mechanisms, preserve caveats and technical terms, mark assumptions, use approved icon identifiers, keep labels short and the graph bounded, and return the requested structured output.
