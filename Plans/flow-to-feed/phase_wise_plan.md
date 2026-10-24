# FlowToFeed — Phase-Wise Implementation Plan

**Project:** FlowToFeed — technical Markdown → editable Mermaid diagrams + channel-specific visual lessons, published via Buffer.
**Context source:** `bg-context.md` (product spec) + `docs/architecture.md`.
**Deadline:** submission publish target Oct 25 evening PKT; hard deadline **Oct 26, 2026, 11:59 AM PKT**.
**Status convention:** mark each checklist item `Completed` when done. After every phase (completed or not), write a log entry in `implementation_log/phase_<N>_implementation.md`.

## Dependency graph

```
P0 ──┬── P1 ── P2 ──┬── P5 ──┬── P6 ──┐
     │              │        ├── P7 ──┼── P8 ── P9 ── P10 ── P11 ── P12
     └── P3 ────────┘        │        │
     └── P4 ────────────────┘        │
```

| Phase | Depends on | Track |
| --- | --- | --- |
| P0 Scaffold | — | infra |
| P1 Data model & migrations | P0 | backend |
| P2 API core (auth, projects) | P1 | backend |
| P3 n8n local + Workflow A skeleton | P0, integrates with P2 | infra/automation |
| P4 Web shell (auth, dashboard, editor) | P1, P2 | frontend |
| P5 Gemma live proof (E2E job flow) | P2, P3, P4 | integration |
| P6 Diagram feature (3 modes, icons, export) | P5 | frontend + prompts |
| P7 Social variants (3 channels) | P5, needs P6 diagram refs | frontend + prompts |
| P8 Visual templates & asset upload | P6, P7 | frontend |
| P9 Distribution (Workflow B, Buffer) | P8 | backend + automation |
| P10 Public sample & connection status | P2, P9 | frontend |
| P11 Render deployment | P10 | infra |
| P12 CI, evidence, demo, DEV post | P11 (writing starts in parallel early) | submission |

Parallelization: P2/P3/P4 run concurrently after P1. P6/P7 run concurrently after P5. Prompt writing (P5+) happens in parallel with frontend work.

---

## Phase 0 — Repository scaffold (infra)

Goal: pushable repo, professional structure, runnable skeletons, plan and requirement files.

- [x] Monorepo layout (`apps/web`, `apps/api`, `packages/shared`, `workflows`, `prompts`, `supabase/migrations`, `examples`, `evidence`, `docs`, `Plans`)
- [x] Git init, `.gitignore` (env files, `bg-context.md`, `things-required.txt` ignored)
- [x] Env templates: root `.env.example` + `apps/api/.env.example`
- [x] Boilerplate: Vite React TS app, Express TS API with `/api/health`, shared contracts package
- [x] `docker-compose.yml` (n8n, named volume, pinned-version TODO), `render.yaml` (app service)
- [x] GitHub Actions CI (typecheck + build)
- [x] `things-required.txt` (owner-provided credentials checklist)
- [x] Docs: architecture, local setup, deployment, submission notes
- [x] Sample explanation `examples/cache-aside.md`

Acceptance: `npm install && npm run typecheck && npm run build` passes; repo pushes to GitHub cleanly.

## Phase 1 — Data model & migrations (backend)

Goal: authoritative schema in Supabase with ownership enforced. **Completed 2026-10-24.**

Depends on: P0. Owner manual task T2 (Supabase project) must be done.

- [x] `supabase/migrations/0001_init.sql`: tables `projects`, `diagrams`, `variants`, `assets`, `jobs`, `distribution_attempts` per `docs/architecture.md` data model (plus `job_events` for idempotent callbacks)
- [x] Ownership: `owner_id` columns + RLS policies (owner read/write; public read limited to the sample project)
- [x] Idempotency: unique constraint on `distribution_attempts.idempotency_key`
- [x] Apply migration to the Supabase project and verify with a smoke query (`0001_init.sql` applied 2026-10-24)
- [x] Verify service-role access path works and anon access is locked down (`npm run db:verify` — 16/16 PASS, bucket created)

Acceptance: tables exist; anon key cannot read owner rows; unique constraint present.

## Phase 2 — API core (backend)

Goal: authenticated project CRUD with revision tracking. **Completed 2026-10-24** (PR #9 → dev). CI green-run on dev pending — see log.

Depends on: P1.

- [x] Supabase Auth integration: session verification middleware (owner check on every project route)
- [x] `GET/POST /api/projects`, `GET/PATCH /api/projects/:id` (source revision/hash recompute, stale-flag derived outputs)
- [x] `GET /api/jobs/:id`, `POST /api/internal/jobs/:id/events` (secret-checked, idempotent by `eventId`)
- [x] Shared Zod validators for all request bodies in `packages/shared`
- [x] Input validation: 20,000-char source cap enforced server-side

Acceptance: unauthenticated calls rejected; owner CRUD works; source change flips revision hash.

## Phase 3 — n8n local + Workflow A skeleton (automation)

Goal: authenticated webhook → ack → callback loop proven end to end.

Depends on: P0 (owner manual tasks T5, T6). Integrates with P2's callback route.

- [ ] `docker compose up -d`, n8n owner account created, volume persists across restart
- [ ] Workflow A v0: webhook (secret header check) → respond 202 → Set node → HTTP Request callback to `http://host.docker.internal:3000/api/internal/jobs/...`
- [ ] Callback received, stored, idempotent (duplicate `eventId` ignored)
- [ ] Export workflow JSON to `workflows/generate.json` with credential placeholders
- [ ] Record tested n8n version in `workflows/README.md`

Acceptance: API-triggered webhook round-trips; container restart keeps workflow.

## Phase 4 — Web shell (frontend)

Goal: owner signs in and manages projects; UI builds on real API.

Depends on: P1, P2. Runs parallel to P3.

- [ ] Supabase Auth client (browser-safe keys only), sign-in screen
- [ ] Dashboard: project list, recent jobs, channel connection placeholders
- [ ] Project editor: Markdown input + preview, title/source URL, file import (UTF-8 .md), 20k-char indicator
- [ ] Passage selection UI (text range + optional diagram instruction)
- [ ] Mock-fixture mode for UI work while credentials are pending (`examples/cache-aside.md` as fixture)

Acceptance: sign in → create project → paste source → save → reopen intact after refresh.

## Phase 5 — Gemma live proof (integration)

Goal: one real structured Gemma response flowing UI → API → n8n → Gemma → callback → UI.

Depends on: P2, P3, P4. Owner manual tasks T3 (Gemma key) must be done.

- [ ] Verify exact available hosted Gemma model id against the account key; pin in `.env`
- [ ] Prompt `architecture-v1` in `prompts/` (reference content, mechanisms only, assumptions marked, icon id whitelist, bounded graph, structured output)
- [ ] n8n: build prompt from template → call Gemma → Zod-validate response → one corrective retry on malformed output → callback with model id, timing, attempts
- [ ] Transient API failure retry: max 3 total attempts, backoff, Retry-After handling
- [ ] Job record updated at each stage; UI shows progress and final result
- [ ] Record measured generation duration in `evidence/`

Acceptance: cache-aside passage yields valid structured `DiagramResult` visible in UI.

## Phase 6 — Diagram feature (frontend + prompts)

Goal: three diagram modes with editable, validated, exportable Mermaid.

Depends on: P5.

- [ ] Mermaid rendering in browser with registered icon packs (cloud/db/disk/internet/server + curated tech icons: Redis, PostgreSQL, Docker, …)
- [ ] Icon manifest generated from installed assets; Gemma receives only valid ids + meanings
- [ ] Flowchart and sequence prompts (`flowchart-v1`, `sequence-v1`)
- [ ] Editable Mermaid source with live syntax validation
- [ ] Failed render: keep draft, show parser error, one bounded AI repair (`repair-v1`)
- [ ] Multiple diagrams per project, tied to passage + source revision
- [ ] SVG/PNG export with bundled fonts/icons; component-count guidance (~12) with split hint
- [ ] Evidence screenshots (icons survive PNG export)

Acceptance: deliberately broken Mermaid shows useful error and repairs once; exported PNG keeps icons.

## Phase 7 — Social variants (frontend + prompts)

Goal: three genuinely different channel adaptations from source + approved diagrams.

Depends on: P5; needs P6 diagrams for references.

- [ ] `social-adapt-v1` prompt: IG (caption + 4–6 slides: concept/mechanism/example/trade-off), FB (short paragraphs + example + caveat), X (3–5 post thread)
- [ ] Weighted X character validation with `twitter-text` package, every thread item, backend-enforced
- [ ] Per-channel editing; regenerate one channel or one slide without touching accepted work elsewhere
- [ ] Stale-flag derived visuals when text changes
- [ ] Definitions/labels/trade-offs consistent across channels

Acceptance: cache-aside produces all three variants passing validation; each teaches standalone.

## Phase 8 — Visual templates & assets (frontend)

Goal: channel-sized images exported in-browser, stored at public URLs.

Depends on: P6, P7.

- [ ] HTML/SVG templates: IG portrait 1080×1350, FB 1200×1200, X landscape 1200×675, one visual identity
- [ ] Slide editor (title/body), full carousel preview, in-order export
- [ ] Export library verified with Mermaid SVG + embedded fonts/icons; JPEG flattened backgrounds for IG/FB, PNG for diagrams/X
- [ ] `POST /api/assets`: upload validated images to Supabase Storage, record width/height/MIME/hash/revision/slide index
- [ ] Readability check at phone size; focused views for dense diagrams

Acceptance: exported carousel matches current edits; public asset URL fetches without login.

## Phase 9 — Distribution (backend + automation)

Goal: approved snapshots reach Buffer safely with per-channel state tracking.

Depends on: P8. Owner manual task T4 (Buffer channels + key) must be done. Early proof tasks (test draft, thread/carousel payload shape) pulled forward into the M1 window when T4 completes.

- [ ] Buffer adapter: `createPost` mutation with `saveToDraft` / `shareNow` / `customScheduled`+`dueAt` (UTC), verified against current schema
- [ ] X thread array includes first post + replies, top-level text synced to first item
- [ ] Approved snapshot freeze (variant revision + assets + destination + action/time) before any call
- [ ] Application idempotency key + DB unique constraint; duplicate click returns existing attempt
- [ ] Workflow B: authenticated trigger → fetch approved payloads via internal endpoint → per-destination submit → continue after one failure → per-channel callback
- [ ] Capture GraphQL top-level errors AND in-body errors with HTTP 200
- [ ] States: draft/submitting/scheduled/published/failed/needs_verification; "published" only on provider confirmation
- [ ] Refresh + retry-definitively-failed actions; ambiguous timeout → needs_verification + reconcile
- [ ] `distribute.json` exported; timezone display PKT with UTC storage

Acceptance: one real draft created in Buffer; repeated click returns same attempt; one failed destination leaves others intact.

## Phase 10 — Public sample & connection status (frontend)

Goal: reviewer-facing polish on the demo path.

Depends on: P2, P9.

- [ ] Read-only public sample project (cache-aside, all outputs)
- [ ] `GET /api/channels`: connected/ready state per destination in dashboard
- [ ] Distribution history view: provider status, scheduled time (PKT display), result URLs
- [ ] Empty/error states with useful messages (disconnected account, invalid media, queue full)

Acceptance: reviewer without credentials can see a complete sample; owner sees live connection state.

## Phase 11 — Render deployment (infra)

Goal: live app + live n8n surviving a redeploy.

Depends on: P10.

- [ ] App web service from `render.yaml` (health `/api/health`, env vars filled)
- [ ] n8n Docker service: pinned image, 1 GB disk at `/home/node/.n8n`, fixed `N8N_ENCRYPTION_KEY`
- [ ] Production webhook + callback URLs (n8n → app over HTTPS), CORS/origin config
- [ ] Import workflows to production n8n, resolve credential ids, activate
- [ ] Smoke test E2E on production; verify scheduled post fires; confirm workflows/drafts/assets survive redeploy
- [ ] Decide budget: Starter vs 2 GB n8n based on observed memory; note remaining credit

Acceptance: full demo runs on the Render URL; redeploy loses nothing.

## Phase 12 — CI, evidence, submission (submission)

Goal: complete, accurate DEV submission before deadline.

Depends on: P11 (writing runs in parallel from P5 onward).

- [ ] CI green on GitHub Actions (Copilot category evidence: meaningful Actions usage)
- [ ] README final: setup, env, workflow import, Render deploy, account requirements, attribution, post-deadline-commit note
- [ ] `evidence/measurements.md` with real numbers (generation duration, validation failures, manual-vs-assisted)
- [ ] 2–3 min demo video (manual problem → diagram → 3 variants → schedule/publish → payoff + one limitation)
- [ ] DEV post from template §16: tags `devchallenge`, `hf26challenge`; only implemented prize categories listed
- [ ] Optional `.tech` domain: only if claimed + connected + HTTPS verified
- [ ] Publish evening Oct 25 PKT; Oct 26 morning = buffer for fixes

Acceptance: submission live, links work, evidence matches reality.

---

## Manual-task blockers (see `Plans/manual_tasks.md`)

| Phase | Blocked on owner completing |
| --- | --- |
| P1 | T2 Supabase project |
| P3 | T5 Docker running, T6 n8n owner account |
| P5 | T3 Gemma API key + model id confirmation |
| P9 | T4 Buffer account, channels, API token |
| P11 | T6 Render credit check |
| P12 | T9 DEV username, T8 .tech decision |
