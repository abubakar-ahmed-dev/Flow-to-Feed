# Phase 5 — Gemma live proof (implementation log)

**Status:** Completed 2026-10-25. Two consecutive E2E generations: 149.4s and 186s, `gemma-4-26b-a4b-it`, prompt `architecture-v2-compiled`. Diagrams saved + approved via the API; evidence appended to `evidence/measurements.md`.

## What was implemented

- **API**: `POST /api/projects/:id/diagrams` (creates job + fires n8n webhook, 202), `POST /api/diagrams` (persist diagram from succeeded job), `PATCH /api/diagrams/:id` (edits/approval). Migration `0002_jobs_input.sql` adds `jobs.input`.
- **Workflow A v1** (`workflows/generate.json`): webhook → 202 ack → Prepare (prompt) → Gemma (3 tries, 3s backoff) → Validate/compile → Valid? → Callback Success | Repair Prompt → Gemma Repair (3 tries) → Validate Repair → Callback Final. HeaderAuth webhook; callback secret injected at provision.
- **Prompt v2** (`prompts/architecture-v2.md`) + compiler (`workflows/src/validate-compiler.js`, injected into generate.json by `workflows/src/inject-nodes.js`).
- **Verify**: `scripts/verify-phase5.ts` — temp user/project → generate → poll → assert succeeded + mermaid/model/promptVersion/assumptions → save → approve; appends measured run to evidence.

## The Gemma structured-output saga (recorded for the write-up)

Tried, in order — ALL failed against `gemma-4-26b-a4b-it` on the Gemini API:
1. JSON-only instruction → planning bullets ("* Goal: …")
2. Schema-first prompt → echoed the schema itself
3. `responseMimeType: "application/json"` → silently ignored (200, markdown back)
4. Model-turn prefill (`{"title":`) → started JSON then drifted into dashes
5. Few-shot as conversation turns → 11k chars of bullets again
6. `gemma-4-31b-it` → timed out at 240s
7. Plain code-only request ("TITLE: line + architecture-beta code") → bullets + 404 lines

The insight: Gemma's *analysis* content is genuinely good (correct components, flows, caveats) — it just cannot stop planning and cannot transcribe. **Final design: Gemma analyzes in its native bullet style; a deterministic compiler in the workflow converts the labeled-line analysis into `architecture-beta`** (component slug dedupe, keyword icon mapping, LaTeX-arrow normalization, garbage rejection verified unit-style).

## n8n 2.44.6 quirks hit (added to `workflows/README.md`)

- HTTP Request node silently drops generic `headerAuth` credentials → explicit `sendHeaders` + provision-time injection
- `String.replace` vs `replaceAll` on the callback secret: two callback nodes, only the first got the real value — placeholder hit the API as 401
- `import:workflow --activeState=fromJson` refused in regular mode; `update:workflow --active` deprecated→`publish:workflow` needed on this build
- Workflow registration after activation+restart can lag minutes; probes must wait, not restart (restarting resets registration)
- `list:workflow` rows now print through the logger (`| info | ID|Name`)
- CLI before server-ready DB fails silently — readiness gate on `list:workflow` required

## Environment/incidents

- Owner's DB URL (restored file) pointed at the dead direct host — `scripts/fix-db-url.ts` probed pooler regions and recovered to ap-southeast-1 automatically
- Owner rotated the Gemma key mid-phase; container env refreshed via compose restart
- Port 3000 stale-listener killed twice between verify runs

## Notes for next phase

- Phase 6 (diagram modes): flowchart/sequence prompts reuse the same analysis→compile pattern (flowchart compile = mermaid flowchart from same Flows; sequence = ordered interactions). Icon packs still pending (icon manifest task moves to P6).
- UI already renders the produced diagram (client-side Mermaid) — verify once in the browser at localhost:5173.
- Render deployment must replicate secret injection for the production workflow copy (noted in P11).
