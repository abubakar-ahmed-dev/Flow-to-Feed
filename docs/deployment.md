# Deployment (Render)

## Topology

| Service | Deployment | Notes |
| --- | --- | --- |
| `flowtofeed-app` | Node web service (this repo) | Serves built React app + Express API, same origin |
| `flowtofeed-n8n` | Docker web service (`n8nio/n8n` image) | Persistent disk + fixed `N8N_ENCRYPTION_KEY` |
| Data | Supabase Free project | Database + storage, external to Render |
| Model/distribution | Gemma API, Buffer API | External services |

Budget context: application Starter + n8n Starter + 1 GB disk ≈ $14.25/month-equivalent. Recheck pricing and remaining grant credit before provisioning. Render's n8n guide recommends 2 GB if Starter proves insufficient.

## Application service

Option A — Blueprint: connect the GitHub repo and let Render read `render.yaml`.

Option B — Manual:

1. New Web Service → connect repo.
2. Runtime: Node. Build: `npm ci && npm run build`. Start: `npm run start -w @flowtofeed/api`.
3. Health check path: `/api/health`.
4. Add environment variables from `render.yaml` (`sync: false` values come from `things-required.txt`).
5. Deploy and verify `/api/health` over HTTPS.

## n8n service

1. New Web Service → "Deploy an existing image" → `n8nio/n8n:<pinned version>`.
2. Instance type: Starter initially; move to 2 GB if generation workflows hit memory limits.
3. Mount a persistent disk at `/home/node/.n8n` (1 GB).
4. Environment: `N8N_HOST`, `N8N_PROTOCOL=https`, `WEBHOOK_URL=https://<n8n-url>/`, `GENERIC_TIMEZONE=Asia/Karachi`, `N8N_ENCRYPTION_KEY` (same value as local, or a new permanent one), `N8N_DIAGNOSTICS_ENABLED=false`.
5. Deploy, complete owner setup, import workflows from `workflows/`, resolve credential IDs, activate.

## Production wiring

- Set the app's `N8N_BASE_URL` and both webhook URLs to the Render n8n **production** webhook URLs.
- Set n8n's callback base URL to the Render app URL (`https://<app-url>/api/...`).
- Point `APP_BASE_URL` at the Render app URL for CORS (same origin in production, kept for safety).
- Confirm generated workflows, application drafts, and stored assets survive a redeploy before demo day.

## Domain

The Render URL is the working demo URL. If a Hacktoberfest `.tech` domain is claimed: add it as a custom domain on the app service, verify HTTPS, update the submission. The `.tech` category is entered only after that works.
