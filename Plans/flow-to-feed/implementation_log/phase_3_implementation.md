# Phase 3 — n8n local + Workflow A skeleton (implementation log)

**Status:** Completed (2026-10-24). Round-trip verified live: webhook 202 → authenticated idempotent callback → job `running`/attempts=1 → replay no-op → bad secret 403.

## What was implemented

- `workflows/generate.json` — Workflow A v0: Webhook (headerAuth, `POST /webhook/generate`, responseNode) → Respond 202 `{accepted, jobId}` → Set (jobId, derived `eventId = n8n-<jobId>-ack`, stage) → HTTP Request callback `POST http://host.docker.internal:3000/api/internal/jobs/<jobId>/events`.
- `scripts/n8n-provision.ts` — generates/ensures `N8N_WEBHOOK_SECRET`/`N8N_CALLBACK_SECRET` in `apps/api/.env` (in-place line edits only), imports the headerAuth credential, injects the real callback secret into the provisioned workflow copy (committed JSON keeps the placeholder), imports + activates the workflow, restarts the container.
- `scripts/test-n8n-roundtrip.ts` — E2E: temp user/project/job → live webhook → poll job state → verify `job_events` row → replay (attempts must stay 1) → wrong-secret rejection. Probe user cascaded away at the end.
- `docker-compose.yml` already in place; root `.env` carries the persistent `N8N_ENCRYPTION_KEY`.
- `workflows/README.md` — tested version (2.44.6), provisioning instructions, verified quirks.

## Hard-won findings (n8n 2.44.6)

1. **HTTP Request node drops generic `headerAuth` credentials at runtime.** The outgoing `x-callback-secret` header was literally absent (`provided=none` in API debug log) despite correct credential data in the DB. Fix: explicit `sendHeaders` parameter; the secret value is injected by the provision script into the n8n-side workflow copy. The committed JSON keeps placeholders.
2. `import:workflow --activeState=fromJson` is refused in regular deployment mode ("queue or multi-main only"). Activation works via the deprecated-but-functional `update:workflow --id=<id> --active=true`.
3. `list:workflow` ids change on re-import; the fresh import is the **last** entry. Provision script was hardened to take the last id (an earlier draft grabbed the wrong id and "activated" nothing).
4. Git-bash mangles container paths (`/home/...` → `C:/Program Files/Git/home/...`); all `docker exec n8n` commands must go through `sh -c "..."`.
5. `n8n import:credentials` requires the JSON to be an **array**.

## Incidents

- **`.env` data loss (agent-caused, recovered):** the first draft of `ensureSecrets()` rebuilt `apps/api/.env` from its own parse; a parse miss dropped the owner's Supabase credentials. Owner restored via VS Code Timeline. The script now edits only target lines and can never drop others. Lesson recorded: never rewrite a secrets file from parsed state.
- Two red CI runs from a reverted `paths` tsconfig experiment earlier the same day; fixed by building `@flowtofeed/shared` before workspace typechecks.

## Environment state after this phase

- n8n volume reset twice during debugging; final state = clean provision + activated workflow, webhook live at `http://localhost:5678/webhook/generate`.
- `apps/api/.env` holds the aligned `N8N_WEBHOOK_SECRET`/`N8N_CALLBACK_SECRET` matching n8n's stored credential / workflow header.
- T6 (n8n owner UI account) still pending — not needed while provisioning is CLI-driven, needed before editing workflows in the UI (Phase 5).

## Notes for next phase

- Phase 5 replaces the Set node with the real pipeline (prompt build → Gemma call → validation → corrective retry → callbacks at each stage) — extend `generate.json`, bump version in `workflows/README.md`.
- Phase 4 (web shell) can proceed independently; Phase 3 gives it a real jobs endpoint to poll.
- Callback secret injection means Render deployment must run the same substitution for the production workflow copy (document in `docs/deployment.md` during Phase 11).
