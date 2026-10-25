# n8n workflows

Exported n8n workflow definitions live here:

- `generate.json` — Workflow A v0 (verified): authenticated webhook → 202 ack → idempotent running-event callback to the API
- `distribute.json` — Workflow B: submits approved destination snapshots to Buffer (pending)

## Import rules

1. Prefer provisioning: `npx tsx scripts/n8n-provision.ts` (expects the Docker container `flowtofeed-n8n` running). It imports the credential, injects the callback secret into the provisioned copy, activates the workflow, and restarts the container.
2. The committed JSON keeps placeholders only (`REPLACE_N8N_CALLBACK_SECRET`, credential references). Never commit real values. `workflows/*credentials*` are gitignored as a safety net.
3. Tested n8n versions are recorded below.
4. Use the workflow's **production** webhook URL in `apps/api/.env`; test URLs are for interactive debugging only.

| Workflow | Tested n8n version | Status |
| --- | --- | --- |
| generate.json | 2.44.6 | v1 live: Gemma generation E2E verified (analysis → compiled diagram → callback → job succeeded) |
| distribute.json | — | not yet implemented |

## Known n8n quirks (verified 2.44.6, 2026-10-24)

- The HTTP Request node **silently drops** a generic `headerAuth` credential at runtime — outgoing secret headers must be set via explicit `sendHeaders` (provision injects the value).
- `import:workflow --activeState=fromJson` is ignored in regular deployment mode; activate with `update:workflow --id=<id> --active=true` after import (deprecated but functional).
- Workflow ids change on re-import; take the **last** `list:workflow` entry.
