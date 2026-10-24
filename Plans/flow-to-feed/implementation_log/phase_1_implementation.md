# Phase 1 — Data model & migrations (implementation log)

**Status:** In progress — schema written and committed; apply/verify blocked on owner credential.

## What was implemented (2026-10-24)

- `supabase/migrations/0001_init.sql` (committed):
  - Tables: `projects`, `diagrams`, `variants`, `assets`, `jobs`, `job_events`, `distribution_attempts`
  - `auth.users` FK on `projects.owner_id` with cascade delete; child tables cascade from `projects`
  - `updated_at` maintained by `set_updated_at()` triggers (assets immutable — created_at only)
  - Check-constraint enums matching `packages/shared` types (modes, platforms, actions, states)
  - `variants` unique per `(project_id, platform)`
  - `distribution_attempts.idempotency_key` unique — duplicate-protection anchor
  - `job_events.event_id` as PK — n8n duplicate callbacks become no-ops
  - RLS on all 7 tables: owner full access via `auth.uid()` (through `projects` join for children), anon read-only for rows under `is_public_sample = true` projects
- Tooling (committed):
  - `scripts/apply-migrations.ts` — `npm run db:migrate`, tracks applied files in `schema_migrations`, transactional per file
  - `scripts/verify-phase1.ts` — `npm run db:verify`, checks service-role reads on all tables, anon read allowed, anon **insert rejected by RLS**, bootstraps public `shareable-assets` bucket
  - Both load `apps/api/.env` (fallback root `.env`)
- Root `package.json`: `db:migrate`/`db:verify` scripts, devDeps `pg`, `@types/pg`, `dotenv`, `tsx`
- `.env.example`: added `SUPABASE_DB_URL` (dev/migrations only)

## Blockers

- **T2b:** `SUPABASE_DB_URL` missing — need Session pooler connection string in `apps/api/.env` to run `db:migrate` and `db:verify`.

## Verified

- `npm install` clean; `npm run db:migrate` parses and exits with the expected missing-URL message (no DB call attempted).
- API workspace typecheck still green after env.ts key-rename changes.

## Notes for next phase

- Phase 2 (API core) can start in parallel — it only needs the schema (written; applying is a formality once T2b lands) and Supabase keys (present).
- New key names (`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`) are primary everywhere; legacy names read as fallback.
- `.gitignore` now also excludes `.claude/`.

## Completion (2026-10-24)

- T2b received: `SUPABASE_DB_URL` (Session pooler) added to `apps/api/.env`.
- `npm run db:migrate` — `0001_init.sql` applied, recorded in `schema_migrations`.
- `npm run db:verify` — 16/16 PASS:
  - service-role reads all 7 tables
  - anon reads all 7 tables (zero rows, no errors)
  - anon insert into `projects` rejected: "new row violates row-level security policy" — lockdown confirmed
  - `shareable-assets` bucket created, public
- **Phase 1 complete.** Phase 2 unblocked; owner_id FK on `auth.users` means T7 (first signup) still needed before real owner data exists.
