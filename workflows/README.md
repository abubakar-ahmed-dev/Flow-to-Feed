# n8n workflows

Exported n8n workflow definitions live here:

- `generate.json` — Workflow A: diagram generation, diagram repair, social adaptation (single authenticated webhook, operation-dispatched)
- `distribute.json` — Workflow B: submits approved destination snapshots to Buffer

## Import rules

1. Import into n8n (local Docker first, then Render).
2. Resolve credential placeholders — never commit real credentials. Files matching `*credentials*` are gitignored as a safety net.
3. Record the tested n8n version in this README when a workflow is verified end to end.
4. Use the workflow's **production** webhook URL in `apps/api/.env`; test URLs are for interactive debugging only.

| Workflow | Tested n8n version | Status |
| --- | --- | --- |
| generate.json | — | not yet implemented |
| distribute.json | — | not yet implemented |
