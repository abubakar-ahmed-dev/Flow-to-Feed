# Phase 2 — API core (implementation log)

**Status:** Completed (2026-10-24, PR #9, squash-merged to dev). One CI fix pending — see "Open items".

## What was implemented

- **Auth**: `requireOwner` middleware — verifies Supabase access token via `auth.getUser`, enforces single-owner when `OWNER_USER_ID` set, stamps `req.userId`.
- **Projects**: `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`. `source_revision` = sha256(source_markdown), computed server-side on create/patch. `GET :id` returns project + diagrams + variants + recent jobs with computed `stale` flags (`withStale`).
- **Jobs**: `GET /api/jobs/:id` with ownership join (not-owned reads 404, no leakage).
- **Callbacks**: `POST /api/internal/jobs/:id/events` — `x-callback-secret` header, timing-safe compare; insert into `job_events` keyed by `event_id` PK (replay → `{status:"duplicate"}`, no re-apply); `applyJobEvent` pure transition (running = attempts+1, succeeded/failed freeze result/error).
- **Validation**: zod schemas in `packages/shared/src/validation.ts` (create/update project, job event). 20k source cap enforced server-side. ZodError → 400, malformed JSON → 400.
- **Secrets util**: `lib/secrets.ts` length-independent `timingSafeEqual` via sha256.
- **Tests**: 14 vitest unit tests (revision, validation, applyJobEvent, withStale). Vitest aliases `@flowtofeed/shared` to source so tests need no prior build.
- **Live E2E**: `scripts/verify-phase2.ts` — 20/20 PASS against the real Supabase project (temp probe user created + deleted; cascade cleanup verified by design).

## Git/CI events

- Branch `phase-2-api-core` from `dev` → PR #9 → squash-merged to `dev` (branch protection not yet configured, merge happened despite red CI — fix forward).
- CI on PR failed twice:
  1. **Typecheck** — `@flowtofeed/shared` unresolved on fresh checkout: API resolves the workspace package via `types: dist/index.d.ts`, which only exists after `shared` is built; CI typechecked before any build. **Fix (pending, next session):** add `"paths": {"@flowtofeed/shared": ["../../packages/shared/src/index.ts"]}` to `apps/api/tsconfig.json` (and `apps/web/tsconfig.json` preventively), commit to `dev`, watch CI go green.
  2. **CodeQL** — repo is PRIVATE; code scanning needs public repo. Owner is flipping the repo public (also required for the submission). After flip: re-run CodeQL workflow; if green, keep; if still blocked, check Settings → Code security.
- Infra added earlier this session: `dev` branch flow, CodeQL workflow, dependabot, PR/issue templates, CI extended with unit tests.

## Notes for next phase

- Next session start order: (1) owner makes repo public, (2) apply tsconfig paths fix on dev, (3) confirm CI + CodeQL green, (4) then Phase 3 (n8n skeleton, needs Docker + n8n owner account) and/or Phase 4 (web shell) — both unblocked and parallelizable.
- `verify-phase2.ts` is reusable as a health check after refactors; it never leaves data behind (probe user deleted; rows cascade).
- `OWNER_USER_ID` still unset in real `.env` — the app works for any authenticated user until T7 (first real signup) pins the owner.
