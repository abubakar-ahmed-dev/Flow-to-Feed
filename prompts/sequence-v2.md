# Prompt: sequence-v2

Same labeled-line analysis contract as `architecture-v2.md`, with a sequence goal. The workflow compiles the analysis to `sequenceDiagram` (participants in first-appearance order, flows as ordered `->>` messages). See `architecture-v2.md` for the full template and rules; only the opening line differs:

Analyze the passage for a sequence diagram (who interacts with whom, in order). Reply ONLY with these labeled lines, nothing else.

Compiler notes:
- Participants appear in first-appearance order across the flow lines.
- Each `Flow N (label): A -> B` becomes `A->>B: label`; multi-hop chains produce consecutive messages.
- Numbering is automatic (`autonumber`).
