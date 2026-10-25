# Phase 8 — Visual templates & assets (implementation log)

**Status:** API path complete + E2E verified (8/8 checks). Browser export built, owner visual pass pending.

## What was implemented

- **Shared**: `PLATFORM_LIMITS.visual` extended with `mime` + `perSlide`; `MAX_ASSET_BYTES`, `ASSET_MIME_ALLOW`.
- **API** `services/assets.ts` + `routes/assets.ts`:
  - `POST /api/assets/upload` — route-level `express.raw` (image bodies bypass JSON parser); query metadata (projectId, platform, variantId, slideIndex, width, height, hash); server-side sha256 recomputation, per-platform dimension/MIME enforcement, ≤10 MB; Supabase Storage upload idempotent by content hash (`projectId/variantId/hash.ext`); `getPublicUrl`; `assets` row insert with variant revision.
  - `GET /api/assets?variantId=` — owner-scoped listing.
- **Web** `render/cards.ts` (pure HTML templates: slideCard/fbCard/xCard + buildCards orchestrator; system fonts — recorded export limitation), `render/export.ts` (offscreen iframe render, html-to-image JPEG/PNG, WebCrypto sha256, raw upload), VariantsSection "Generate images" + thumbnail strip + stale-images badge.
- **E2E** `scripts/verify-phase8.ts` + fixture `evidence/fixtures/pixel.jpg`: 8/8 PASS (upload 201, anon public fetch 200, hash-mismatch 400, wrong-dims 400, listing, anon-upload 401, project+variant fixtures).

## Bugs hit while wiring the E2E (all fixed)

1. Verify's `fetch` helper JSON-stringified **Buffer** bodies → uploads arrived as JSON text → sha256 mismatch. Fix: Buffer-aware body handling.
2. Same helper passed raw objects → undici stringifies to `[object Object]` → "Malformed JSON". Root cause of the first red run.
3. `docs/PHASE8_PLAN.md` kept out of the Phase 7 merge via `.git/info/exclude`; committed with this branch.

## Deferred / pending

- **Owner browser pass**: html-to-image fidelity with Mermaid SVG (expected fine — plain shapes/text; system fonts) + screenshots for `evidence/`. Button: project → variant → "Generate images".
- Design note for the write-up: system fonts only (webfonts don't survive html-to-image export without embedding).

## Notes for next phase

- P9 Buffer: asset `public_url`s are the media URLs for `createPost` media arrays; X thread card attaches to post 1; IG slides in order.
- P11: Storage public URLs stable across redeploys (bucket persists) — no redeploy risk for scheduled posts.
