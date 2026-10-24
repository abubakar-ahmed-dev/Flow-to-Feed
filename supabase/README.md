# Supabase

Application data (Postgres), auth, and asset storage.

- `migrations/` — ordered SQL migrations for the application schema and ownership policies. Apply with the Supabase SQL editor or CLI in order.
- The service-role key is used only by the Express backend, never the browser.
- Storage bucket `shareable-assets` holds approved public image URLs handed to Buffer.

Migration status is tracked in `migrations/` filenames; the implementation plan lives in `Plans/flow-to-feed/phase_wise_plan.md`.
