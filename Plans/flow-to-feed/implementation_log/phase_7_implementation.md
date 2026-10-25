# Phase 7 — Social variants (implementation log)

**Status:** Completed 2026-10-25. X platform fully E2E-verified twice (generation → Gemma → compile → callback → job succeeded → variant saved 201 → weighted validation). IG/FB: pipeline identical, compilers unit-tested, full E2E deferred to Render (P11) after local network instability.

## What was implemented

- **Shared** `packages/shared/src/social.ts`: `SocialContent` types, `validateSocialContent` (IG caption/slides rules, FB paragraph rules, X 3–5 posts with **twitter-text weighted length ≤ 280** per post), `weightedXLength` helper (+ `.d.ts` shim; library is CJS, default-import interop).
- **Workflow**: `workflows/src/social-compiler.js` (labeled-line parser: Title/Caption/Slide N `heading | body`/Post N/Paragraph N; continuation lines append; caps aligned to validation: posts ≤ 5, slides ≤ 6); social branch in `prompt-builder.js` (per-platform shapes: hook/mechanism/example/caveat); Validate node branches on `operation === 'social_adapt'`; Prepare forwards `operation`.
- **API**: `POST /api/projects/:id/social` (job + n8n trigger), `POST /api/variants/save` (succeeded-job → upsert variant by project+platform, revision bump, backend re-validation), `PATCH /api/variants/:id` (manual edits re-validated, revision bump, re-tied to current source revision).
- **UI** `VariantsSection`: per-platform cards, generate with job polling, editable slides/paragraphs/posts, live weighted X counters (red over budget), platform-rule issue list, stale badge.
- **Verification** `scripts/verify-phase7.ts`: serial platform execution (concurrent Gemma calls exhaust container→Google connections — measured), 900s poll windows, platform filter arg, save-error diagnostics, evidence rows.

## Bugs found and fixed (the debugging story)

1. **Wrapper-vs-section validation**: `validateSocialContent('x', content)` received the wrapper `{x:{posts}}` instead of `{posts}` — every adaptation rejected as "thread needs 3-5 posts" despite valid content. Found via rejection-detail logging. Fix: `content[platform]`.
2. **Count mismatch**: Gemma overshoots requested counts (6+ posts, 7 slides) → backend caps rejected after successful generation. Fix: compiler caps (slice to 5 posts / 6 slides) so compile+validate agree.
3. **Prepare didn't forward `operation`** → Validate ran the diagram compiler on social output ("missing Components/Flows"). Fix: return operation in Prepare json.
4. **CI miss (process failure, mine)**: merged PR #16 with red typecheck — skipped local typecheck after the final edit. Fixed forward on dev; lesson: typecheck is part of every edit's definition-of-done, no exceptions near deadline.

## Environment findings

- Local container→Google latency collapsed twice today (480s timeouts on trivial calls; 2s an hour later). IG/FB E2E starvation traced to `EXECUTIONS_TIMEOUT=600` cancelling >10-min executions — raised to 1800s. Serial triggering avoids concurrent-call connection exhaustion.
- Render deployment expected to eliminate the network variable (datacenter egress); IG/FB E2E queued for P11.

## Evidence

- `evidence/measurements.md`: two X-generation rows (224s, 374s) + 3-platform serial attempt rows.
- Kept-probe runs cleaned; Supabase auth users p5/p6/p7 probes deleted.

## Notes for next phase

- Phase 8 per `docs/PHASE8_PLAN.md` (local-only during P7 merge — unlist from `.git/info/exclude` on the phase-8 branch and commit the plan with it).
- P9 Buffer: X thread content ready for thread-array mapping; IG slides → carousel upload pending P8 images.
- Re-run IG/FB E2E on Render before the demo claim is written in the DEV post (or scope the claim to X-E2E + IG/FB-unit honestly).
