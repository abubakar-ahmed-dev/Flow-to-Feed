# How to use FlowToFeed

Full walkthrough: one technical explanation → editable diagram → three channel lessons → postable images.

## Prerequisites (each terminal)

| Terminal | Command | Check |
| --- | --- | --- |
| 1 | `docker compose up -d` | http://localhost:5678 loads (n8n) |
| 2 | `npm run dev:api` | http://localhost:3000/api/health returns `{"ok":true}` |
| 3 | `npm run dev:web` | http://localhost:5173 loads the studio |

## Walkthrough

### 1 — Sign in

Open http://localhost:5173 → create an account or sign in.

### 2 — Source (step 1)

1. Click **New project**.
2. Paste your explanation (or **Import .md** — try `examples/cache-aside.md`).
3. **Save & continue**.

### 3 — Diagram (step 2)

1. **Select a passage** inside the source editor — highlight 8+ characters (e.g. the *Mechanism* section of the cache-aside example). The selected text shows above the controls.
2. Pick a mode: `architecture` (components + connections), `flowchart` (steps + branches), or `sequence` (who talks to whom, in order).
3. Optional: add an instruction like *"show the read path only"*.
4. Click **Generate** — takes **2–6 minutes** (Gemma call; progress shows under the form). Don't close the tab.
5. When it lands: **Add to project** → the diagram renders below.
6. Review it like an editor: **Edit source** to tweak Mermaid, **Repair** if it fails to render (one bounded AI fix), **Approve** when correct.
7. More diagrams: select another passage and repeat. Each diagram remembers the source revision it came from.

### 4 — Lessons (step 3)

1. For each platform card (Instagram / Facebook / X): **Generate** — run them one at a time (2–6 min each).
2. Edit any slide heading/body, paragraph, or post — X shows live weighted-character counts.
3. **Save** — platform rules re-validate server-side (over-limit X posts are rejected).
4. **Generate images** — exports channel-sized cards (IG 1080×1350 per slide, FB 1200×1200, X 1200×675) and uploads them. Thumbnails appear with public URLs.

## Troubleshooting

| Symptom | Meaning | Fix |
| --- | --- | --- |
| Job stuck "queued" minutes | n8n busy or exec still running | wait; check http://localhost:5678 executions |
| Job "failed: timeout…" | Google call timed out; 3 retries exhausted | Regenerate |
| Diagram renders with error | Model output drifted | **Repair** button |
| "images out of date" badge | You edited the lesson after exporting | Generate images again |
| Lesson shows "stale" | Source changed after generation | Regenerate the variant |
