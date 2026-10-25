# Phase 8 Implementation Plan — Visual Templates & Assets

**Status:** planning complete, not started. **Owner:** agent. **Estimated effort:** 3–4 h implementation + ~1 h E2E/debug.
**This file is local-only during Phase 7 merge** (listed in `.git/info/exclude`); commit it with the Phase 8 branch.

---

## Goal

Approved channel variants (currently text in `variants.content`) become real postable images at stable public URLs:

| Platform | Images | Size | Format |
| --- | --- | --- | --- |
| Instagram | one card per slide (4–6) | 1080×1350 | JPEG (flattened white) |
| Facebook | one explainer card | 1200×1200 | JPEG |
| X | one summary card (+ optional diagram card) | 1200×675 | PNG |

Acceptance: open a project → every approved variant has images at **public HTTPS URLs** (fetchable without login), matching the current edited text; re-export after edits inserts new asset rows (history preserved, old rows never mutated).

---

## Key decisions (locked, with reasons)

1. **Client-side rendering** (spec decision): HTML/CSS cards rendered in a hidden DOM node → exported via `html-to-image` npm package → JPEG/PNG blob → uploaded. No server rendering (keeps Render memory small; matches bg-context §3.5).
2. **System fonts only** (Segoe UI/system-ui stack). Webfonts break in html-to-image exports unless embedded; skip for deadline. Recorded limitation in write-up.
3. **Mermaid diagram embed**: approved diagram's rendered SVG inlined into the card DOM (plain SVG, no foreignObject issues). Light theme on white card background regardless of app theme.
4. **Binary upload, not base64 JSON**: `POST /api/assets/upload` takes `express.raw({ type: 'image/*', limit: '10mb' })` body + all metadata as query params. Base64 of a 1080×1350 JPEG ≈ 800 KB would flirt with the global 1 MB JSON limit; raw avoids it.
5. **Server-side integrity**: API recomputes SHA-256 of the uploaded bytes; client-sent hash must match; MIME allow-list `image/jpeg|image/png`; size ≤ 10 MB; dimensions must be the platform's exact size (backend-enforced, mirrors shared limits).
6. **Assets are immutable**: every export inserts NEW rows keyed by content hash; `revision` column stores the variant revision that produced them. UI shows "stale images" when variant.revision > latest asset revision.
7. **No AI calls in this phase** — everything renders from approved content + approved diagram.

---

## Files to create / change (implementation order)

### 1. `packages/shared/src/assets.ts` (new)
```ts
export const PLATFORM_CARD = {
  instagram: { width: 1080, height: 1350, mime: "image/jpeg", perSlide: true },
  facebook:  { width: 1200, height: 1200, mime: "image/jpeg", perSlide: false },
  x:         { width: 1200, height: 675,  mime: "image/png",  perSlide: false },
} as const;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
```
Export from `index.ts`. (Sizes already in `platform-limits.ts` `visual` — reuse or consolidate: extend `PLATFORM_LIMITS.visual` instead of a second map. DECISION: extend `PLATFORM_LIMITS` with `mime` + `perSlide` and delete nothing.)

### 2. `apps/api/src/services/assets.ts` (new)
`uploadAsset(userId, meta, body: Buffer)`:
1. `getProject(projectId)` → ownership check (404).
2. If `variantId`: fetch variant → project match + `variant.stale` info; platform must equal variant.platform.
3. Validate: mime ∈ allow-list per platform; byte length ≤ 10 MB; sha256(body) === meta.hash; width/height match `PLATFORM_LIMITS[platform].visual`.
4. `supabaseAdmin().storage.from(bucket).upload(path, body, { contentType })` with `path = projectId/variantId/{hash}.{ext}` (idempotent — same content = same path; use `upsert: false` and tolerate "exists").
5. `getPublicUrl(path)` → insert `assets` row: `{project_id, variant_id, diagram_id?, revision: variant.revision, slide_index, storage_path, public_url, width, height, mime_type, hash}` → return row + publicUrl.

### 3. `apps/api/src/routes/assets.ts` (new)
```
POST /api/assets/upload
  ?projectId&variantId&slideIndex&width&height&hash[&diagramId]
  body: raw image bytes
```
`express.raw({ type: ["image/jpeg", "image/png"], limit: "10mb" })` on THIS route only (mount before global json, or set route-level parser — Express 5: use `express.raw` inline in the route chain; global json parser skips non-JSON content types, verify).
Mount `app.use("/api/assets", requireOwner, assetsRouter)`.
Also `GET /api/assets?variantId=` → list rows for UI strip (owner-scoped).

### 4. `apps/web/src/render/cards.ts` (new — templates)
Pure string builders (no DOM — unit-testable):
- `slideCardHtml({title, heading, body, slideIndex, slideCount, diagramSvg?})` → IG portrait card: kicker (title), big heading, body, slide counter "2/5", diagram SVG (optional, max-height 45%).
- `fbCardHtml({title, paragraphs, diagramSvg?})` → square: title, stacked paragraphs, diagram block bottom.
- `xCardsHtml({posts, diagramSvg?})` → landscape summary card (post 1 hook + "🧵" hint); `diagramCardHtml(diagramSvg, title)` → landscape diagram-only card.
Shared inline `<style>`: white bg, `#0d1117` text, accent `#2f81f7`, font stack `system-ui, "Segoe UI", sans-serif`, base font ~54px on IG (phone readability), 40px FB, 34px X. Density rule: if diagram component count > 8 → render diagram at 70% width centered + footnote "simplified view".
Each card root: `<div class="card" style="width:Wpx;height:Hpx;overflow:hidden">` with `data-card="platform"` marker for tests.

### 5. `apps/web/src/render/export.ts` (new)
```ts
renderCard(html, w, h): Promise<Blob>   // hidden container → html-to-image toJpeg/toPng
uploadAsset(blob, meta): Promise<{publicUrl}>  // fetch raw body + query params + x-sha256 header
exportVariantImages(platform, variant, diagramSvg?): Promise<AssetRef[]>  // orchestrates loop
```
Details:
- `import { toJpeg, toPng } from "html-to-image"` (add dep to web).
- Offscreen container: `position:fixed; left:-99999px` with exact `width/height`; `document.fonts.ready` await; `pixelRatio: 1`; `backgroundColor: "#ffffff"`; jpeg quality 0.92.
- Hash: `crypto.subtle.digest("SHA-256", blobBytes)` → hex (browser WebCrypto).
- Mermaid SVG: render approved diagram via `mermaid.render` (light theme override: initialize second mermaid instance config `theme:"default"`), strip `max-width` style so it scales into card.

### 6. `apps/web/src/components/VariantsSection.tsx` (change)
Per platform card:
- "Generate images" button (enabled when variant exists and its issues.length === 0).
- Progress line ("image 2/5…") then thumbnail strip (`<img src=publicUrl>`), each linking to the URL.
- Stale badge: `variant.revision > latestAssetRevision` → "images out of date — regenerate".
- State: `assetsByVariant` loaded via `GET /api/assets?variantId=` on mount/refresh.

### 7. `apps/web/src/types.ts` — `AssetRow` interface (id, public_url, width, height, mime_type, slide_index, revision, created_at).

### 8. Tests
- `apps/api/test/assets.spec.ts` (unit): hash-mismatch rejection, mime rejection, dimension rejection — via direct service calls with admin-inserted project/variant fixtures (no HTTP).
- Web templates: skip DOM-dependent tests (jsdom cost not worth it); compiler-style string assertions only if cheap (`buildCardHtml` contains exact size + data-card marker).

### 9. `scripts/verify-phase8.ts` (E2E, no Gemma dependency)
1. temp user/project/token.
2. admin-insert variant row (instagram, 5 slides, valid content) — bypasses job machinery (already proven in P7).
3. Export path exercised through REAL HTTP: craft card bytes host-side? Browser export can't run in node. **Split verification:**
   - **API part (node)**: upload a real JPEG byte buffer (generate with a tiny valid JPEG header + random body — or ship `evidence/fixtures/pixel.jpg` 1×1 scaled? any decodable jpeg bytes) → expect 201 → fetch publicUrl → 200 image/jpeg → wrong-hash upload → 400 → wrong-dimensions → 400.
   - **Browser part (manual, owner)**: open project → IG variant → Generate images → strip appears → download link works. Owner screenshots → `evidence/screenshots/`.
4. Evidence rows appended.

Note: keep a checked-in fixture image `evidence/fixtures/` for the node-side upload test (tiny base64 → Buffer).

---

## Storage & security checklist

- Bucket `shareable-assets` public read ✓ (created P1). Uploads via service key only — never client-direct (no anon storage policy needed).
- Ownership: upload/list routes owner-checked (RLS not consulted — service key bypasses; API enforces).
- Path scheme `projectId/variantId/hash.ext` prevents cross-project overwrite; hash equality = identical bytes, overwrite harmless.
- No metadata trust from client except declared dimensions/hash — both verified server-side.

---

## Risks & fallbacks

| Risk | Mitigation |
| --- | --- |
| html-to-image misrenders Mermaid SVG (styles/clipping) | Mermaid SVG is plain shapes+text — historically safe; fallback: render diagram PNG separately via canvas and stack `<img>` into card DOM |
| Fonts shift between preview and export | system fonts only; verify in browser pass |
| Express 5 global json parser intercepts raw route | mount raw parser in route chain; test with curl first |
| Export slow (5 images × ~2 s) | sequential fine; progress UI per image |
| Storage public URL cache staleness on re-export | hash in filename → new URL per content; no cache issue |

---

## Implementation order (checklist)

- [ ] 1. shared: extend `PLATFORM_LIMITS` (mime, perSlide) + export
- [ ] 2. api: assets service + route + app mount (+ curl smoke test)
- [ ] 3. api: unit tests (hash/mime/dimension rejections)
- [ ] 4. web: `render/cards.ts` templates
- [ ] 5. web: `render/export.ts` (html-to-image + upload + hash)
- [ ] 6. web: VariantsSection "Generate images" + strip + stale logic
- [ ] 7. `scripts/verify-phase8.ts` API-part E2E + fixture image
- [ ] 8. Owner browser pass: real IG export → screenshots → evidence
- [ ] 9. Commit `phase-8-assets` branch → PR → merge (plan file included, remove from `.git/info/exclude`)

## Out of scope (recorded)

- Instagram caption image (caption stays text for Buffer body)
- Diagram pack icons (deferred P6)
- Server-side rendering / headless browser
- Video/reels formats
