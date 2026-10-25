# Phase 6 — Diagram feature (implementation log)

**Status:** Completed 2026-10-25. Flowchart generation E2E 144.6s; bounded repair E2E 198.5s; repaired diagram re-tied to current source revision.

## What was implemented

- **Pure compiler** `workflows/src/analysis-compiler.js` — `compileAnalysis(analysisText, {mode, model})` for all three modes: `architecture-beta`, `flowchart TD` (labeled edges), `sequenceDiagram` (participants in first-appearance order, autonumber). Unit-tested from `apps/api/test/analysis-compiler.spec.ts` (6 tests: dedupe, LaTeX-arrow normalization, mode outputs, garbage rejection, icon mapping).
- **Prompt builder** `workflows/src/prompt-builder.js` — mode goal + shared labeled-line contract; repair variant embeds prior Mermaid + the render error.
- **n8n bundling** `workflows/src/inject-nodes.js` — n8n Code nodes cannot import, so provision-time injection inlines the pure modules into `Prepare`/`Validate`/`Validate Repair` jsCode in `workflows/generate.json`. Single source of truth stays the .js modules.
- **API**: `POST /api/diagrams/:id/repair` (bounded `diagram_repair` job + n8n trigger with priorMermaid + renderError), `POST /api/diagrams/:id/apply-repair` (validates job↔diagram↔operation, re-ties `source_revision` to the project's current revision, resets review to draft).
- **UI** `DiagramReview`: live render + edit, Approve, **Repair** button (self-polling job, auto-apply), **SVG/PNG export** (client-side; PNG flattened white), density hint at >10 components, stale badge.
- **Verification**: `scripts/verify-phase6.ts` — flowchart generate E2E + hand-broken diagram repair E2E; appends measured durations to `evidence/measurements.md`.

## Decisions

- **Icon packs deferred**: built-in architecture icon set covers the demo; Iconify pack registration + font bundling deferred past the deadline (recorded in plan).
- **Repair = analysis redo, not text patch**: the repair prompt rebuilds the labeled-line analysis with the prior Mermaid + parser error as context, then recompiles — the compiler stays the single formatting authority.
- `diagram_repair` result carries `diagramId` in `jobs.input`; apply-repair verifies job↔diagram identity before writing.

## Notes for next phase

- Phase 7 (social variants) reuses the same job/callback machinery with `operation: social_adapt` and platform-specific prompts; X character validation still needs the weighted counter.
- UI browser pass still pending (owner eyeball): editor + diagram cards at localhost:5173.
