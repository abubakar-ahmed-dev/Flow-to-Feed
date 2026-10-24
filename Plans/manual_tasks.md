# Manual Tasks (owner)

Human-only steps. Full details + fill-in blanks: `things-required.txt` (local file, not committed). Do these in order; each unblocks a phase in `flow-to-feed/phase_wise_plan.md`.

## T1 — Create the GitHub repo (unblocks: push, all phases) — ~2 min

1. GitHub → New repository.
2. Name: `flow-to-feed`. Public. Empty (no README/.gitignore/license).
3. Copy the remote URL and send it. The agent will wire `git remote` and push.

## T2 — Supabase project (unblocks: P1, P2, P4) — ~10 min

1. supabase.com → New project (free tier). Note region.
2. Settings → API: copy Project URL, `anon` key, `service_role` key → paste into `things-required.txt` and `apps/api/.env`.
3. Do not run any SQL — the agent supplies migrations in Phase 1.

## T3 — Gemma API key (unblocks: P5) — ~10 min

1. https://aistudio.google.com/ → Get API key → create key.
2. Check https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api for the hosted Gemma models your key can call.
3. Report the key + the exact model id available (doc proposes `gemma-4-26b-a4b-it` — confirm or correct it).

## T4 — Buffer setup (unblocks: P9; do early — proof tasks need it) — ~30 min

1. Create/verify Buffer account (Free: 3 channels is exactly our need).
2. Connect: Instagram (**professional/business** account required), a Facebook **Page** you admin, and X.
3. Get API access per https://developers.buffer.com/ ; copy the API token.
4. Note organization id + the three channel ids (dashboard URL or API).

## T5 — Local environment check (unblocks: P3) — ~5 min

1. `node -v` → confirm >= 22.
2. Start Docker Desktop; `docker version` succeeds.

## T6 — n8n owner account (unblocks: P3 workflow building) — ~3 min

1. After the agent starts compose (`npm run compose:up`), open http://localhost:5678.
2. Create the local owner account; report the email (keep the password private).

## T7 — OWNER_USER_ID (unblocks: backend owner checks) — ~2 min, after P4 auth exists

1. Sign in once in the app.
2. Supabase → Authentication → Users → copy your user id → paste into `.env`.

## T8 — Decisions (unblocks: P11/P12 extras)

1. Claim a Hacktoberfest `.tech` domain? yes/no.
2. DEV username for the submission post.

## T9 — Render check (unblocks: P11)

1. Log into Render; confirm the grant credit remaining.
2. Confirm you can create: one Node web service + one Docker web service with a 1 GB disk.
