# Submission notes (Hacktoberfest Week 3)

## Hard facts

- Challenge: https://dev.to/challenges/hacktoberfest-week3-2026-10-19
- Entry window: Oct 19, 9:00 AM PDT → **Oct 25, 11:59 PM PDT = Oct 26, 11:59 AM PKT**
- Tags required: `devchallenge`, `hf26challenge`
- One English DEV post using the template in `bg-context.md` §16
- Target: publish the submission the evening of Oct 25 PKT; keep Oct 26 morning as buffer

## Required in the post

| Section | Evidence source |
| --- | --- |
| What I Built | Cache-aside demo narrative, measured time comparison |
| Demo | Render URL (works without login via public sample) + 2–3 min video |
| Code | This repo embedded in the post |
| How I Built It | Gemma model id + prompt versions, n8n workflow screenshots |
| Why Open Innovation Matters | Editable Mermaid source, portable workflow JSON, swappable model config |
| My Agent Session | Optional; DevRelay session link if captured |
| The Lazy Payoff | Measured minutes saved on the cache-aside run (real numbers only) |
| Prize Categories | Only categories actually implemented |

## Prize category checklist

- [ ] **Best Use of Render** — both services live, reproducible config, redeploy persistence shown
- [ ] **Best Use of Gemma** — actual model id, prompt examples, real generations recorded in `evidence/`
- [ ] **Best Use of GitHub Copilot** — meaningful GitHub Actions CI on this repo (`.github/workflows/ci.yml`) + Actions runs as evidence
- [ ] **Best Use of .tech domain** — optional; only if a domain is claimed, connected, and serving HTTPS

## Evidence to capture during build (do not reconstruct later)

1. Screenshot: n8n generation workflow with a real Gemma response
2. Screenshot: architecture diagram with server/database/cache icons rendered
3. Screenshot: the three channel variants side by side
4. Screenshot: Buffer draft/scheduled confirmation + provider confirmation of one real publication
5. Measured numbers: generation duration, validation failures, manual vs assisted prep time
6. A recorded limitation + correction (honest write-ups score well; writing quality is the heaviest criterion)

## Pre-submit checks

- Repo README has setup, env vars, workflow import steps, attribution
- `evidence/` committed with real observations
- Public sample project viewable without login
- Post-deadline commits noted in README per contest rules
