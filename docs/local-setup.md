# Local setup

Owner machine: Windows, VS Code, Node.js, Docker Desktop/WSL2.

## Prerequisites

- Node.js >= 22 (`node -v`)
- Docker Desktop running (`docker version`)
- Values from `things-required.txt`: Supabase URL/keys, Gemma API key, Buffer key/channel ids

## 1. Install dependencies

```bash
npm install
```

## 2. Environment

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in the Supabase, Gemma, and Buffer values. `N8N_ENCRYPTION_KEY` must be a persistent random string; losing it makes saved n8n credentials unreadable.

## 3. Start n8n

```bash
npm run compose:up
npm run compose:logs      # follow startup
```

Open http://localhost:5678 and create the local n8n owner account. The named volume `n8n_data` persists workflows across restarts; `npm run compose:down` keeps it.

## 4. Start the API

```bash
npm run dev:api
```

Health check: http://localhost:3000/api/health

## 5. Start the frontend

```bash
npm run dev:web
```

Open http://localhost:5173. The Vite dev server proxies `/api` to `http://localhost:3000`.

## Docker networking note

The API calls n8n at `localhost:5678` (host side, fine). n8n calls the API back at `http://host.docker.internal:3000` — `localhost` inside the n8n container is the container itself. If callbacks fail, verify the API listens on `0.0.0.0` (not `127.0.0.1`) and that `N8N_CALLBACK_BASE_URL` uses `host.docker.internal`.

## n8n workflows

Import the exported JSON from `workflows/` into the local n8n instance, resolve credential placeholders, and activate them. Use the **production** webhook URLs in `apps/api/.env` (`N8N_GENERATION_WEBHOOK_URL`, `N8N_DISTRIBUTION_WEBHOOK_URL`); keep the test URLs for interactive node debugging.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build shared, api, web |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run compose:down` | Stop n8n (volume preserved) |
| `docker volume rm flow-to-feed_n8n_data` | Reset n8n completely (destructive) |
