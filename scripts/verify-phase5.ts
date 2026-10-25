/**
 * Phase 5 end-to-end: real Gemma generation through the full pipeline.
 *
 * temp user/project -> POST /api/projects/:id/diagrams (cache-aside passage)
 * -> n8n -> Gemma -> validation -> callback -> job succeeded
 * -> save diagram -> approve. Appends a measured duration to
 * evidence/measurements.md.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { appendFileSync, existsSync } from "node:fs";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const gemmaModel = process.env.GEMMA_MODEL ?? process.env.LLM_MODEL ?? "gemma-4-26b-a4b-it";

if (!url || !secretKey || !publishableKey) {
  console.error("Missing Supabase keys.");
  process.exit(1);
}

const PASSAGE = `Cache-aside is a caching strategy where the application is responsible for keeping data consistent. The application receives a read request and checks the cache first. On a cache hit the value is returned immediately and the database is never touched. On a cache miss the application reads the value from the database, stores a copy in the cache with a TTL, and then returns it. On writes, the application updates the database and invalidates the cache entry rather than updating the cached copy. The cache is disposable: if Redis restarts the system must stay correct because the database remains the source of truth.`;

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const admin: SupabaseClient = createClient(url!, secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon: SupabaseClient = createClient(url!, publishableKey!);

  const email = `p5-probe+${Date.now()}@flowtofeed.test`;
  const password = randomUUID() + randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) {
    console.error(`probe user failed: ${error?.message}`);
    process.exit(1);
  }
  process.env.OWNER_USER_ID = created.user.id;

  const { createApp } = await import("../apps/api/src/app.js");
  const server = createApp().listen(3000, "0.0.0.0");
  const base = `http://127.0.0.1:3000`;

  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  const token = session?.session?.access_token;
  if (signInErr || !token) {
    console.error(`sign-in failed: ${signInErr?.message}`);
    await admin.auth.admin.deleteUser(created.user.id);
    server.close();
    process.exit(1);
  }

  const api = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) } as { status: number; body: any };
  };

  const startedAt = Date.now();
  try {
    const { body: projBody } = await api("POST", "/api/projects", {
      title: "Cache-Aside",
      source_markdown: `# Cache-Aside\n\n${PASSAGE}`,
    });
    const projectId = projBody?.project?.id;
    report("project created", !!projectId);

    const gen = await api("POST", `/api/projects/${projectId}/diagrams`, {
      mode: "architecture",
      passage: PASSAGE,
      instruction: "Show the read path and the invalidation-on-write behavior",
    });
    report("generation accepted 202", gen.status === 202 && !!gen.body?.job?.id, JSON.stringify(gen.body?.job?.state));
    const jobId = gen.body?.job?.id;

    let job = gen.body?.job;
    const deadline = Date.now() + 420_000;
    while (job && (job.state === "queued" || job.state === "running") && Date.now() < deadline) {
      await sleep(3000);
      const r = await api("GET", `/api/jobs/${jobId}`);
      job = r.body?.job;
      if (job && (job.state === "running" || job.state === "queued")) {
        process.stdout.write(`  … ${job.state} stage=${job.stage ?? "?"} attempts=${job.attempts}\n`);
      }
    }
    const durationSec = Math.round((Date.now() - startedAt) / 100) / 10;
    report("job reached terminal state", !!job && job.state !== "queued" && job.state !== "running", `state=${job?.state} in ${durationSec}s`);
    report("job succeeded", job?.state === "succeeded", JSON.stringify(job?.error));

    const result = job?.result ?? {};
    report("result has architecture-beta source", typeof result.mermaid === "string" && result.mermaid.includes("architecture-beta"), `${(result.mermaid ?? "").length} chars`);
    report("model id recorded", result.model === gemmaModel, `${result.model}`);
    report(
      "prompt version recorded",
      result.promptVersion === "architecture-v2-compiled" ||
        result.promptVersion === "architecture-v2-compiled+repair",
      `${result.promptVersion}`,
    );
    report("assumptions is array", Array.isArray(result.assumptions), `${result.assumptions?.length ?? 0} items`);

    const saved = await api("POST", "/api/diagrams", { projectId, jobId });
    report("diagram saved from job", saved.status === 201 && !!saved.body?.diagram?.id, `status ${saved.status}`);
    report("diagram tied to current source revision", saved.body?.diagram?.source_revision === projBody?.project?.source_revision);

    const detail = await api("GET", `/api/projects/${projectId}`);
    report("detail lists the diagram", (detail.body?.diagrams ?? []).length === 1);

    const approved = await api("PATCH", `/api/diagrams/${saved.body?.diagram?.id}`, { review_state: "approved", render_state: "rendered" });
    report("diagram approved", approved.body?.diagram?.review_state === "approved");

    // measured-run evidence (real observation only)
    const evidencePath = path.resolve(process.cwd(), "evidence/measurements.md");
    if (!existsSync(evidencePath)) {
      appendFileSync(evidencePath, "# Measured runs\n\nReal observations only. One row per verified run.\n\n| Date | Operation | Model | Prompt | Duration | Result |\n| --- | --- | --- | --- | --- | --- |\n");
    }
    appendFileSync(
      evidencePath,
      `| 2026-10-24 | architecture diagram (cache-aside) | ${result.model} | ${result.promptVersion} | ${durationSec}s | job ${job?.state}, ${result.mermaid?.length ?? 0} chars |\n`,
    );
    console.log(`+ evidence appended to evidence/measurements.md (${durationSec}s)`);
  } finally {
    server.close();
    await admin.auth.admin.deleteUser(created.user.id);
    console.log(`(cleaned up probe user ${email})`);
  }

  console.log(failures === 0 ? "\nAll Phase 5 checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
