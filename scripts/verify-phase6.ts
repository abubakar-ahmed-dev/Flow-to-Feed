/**
 * Phase 6 E2E: flowchart generation + bounded repair path.
 * 1. temp user/project -> generate flowchart (mode=flowchart) -> job succeeded
 * 2. result.mermaid is valid flowchart TD; diagram saved
 * 3. hand-broken architecture diagram -> POST /api/diagrams/:id/repair
 *    -> job succeeded -> apply-repair -> mermaid replaced with valid source
 * Appends measured durations to evidence/measurements.md.
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
if (!url || !secretKey || !publishableKey) {
  console.error("Missing Supabase keys.");
  process.exit(1);
}

const PASSAGE = `Cache-aside: the application checks the cache first. On a hit it returns the value immediately. On a miss it reads PostgreSQL, stores the value in Redis with a TTL, and returns it. Writes update PostgreSQL and invalidate the Redis key. If the cache is cold after a restart, the first requests repopulate it.`;

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollJob(api: (m: string, p: string) => Promise<{ status: number; body: any }>, jobId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let job: any = null;
  while (Date.now() < deadline) {
    const r = await api("GET", `/api/jobs/${jobId}`);
    job = r.body?.job;
    if (job && job.state !== "queued" && job.state !== "running") return { job, seconds: Math.round((timeoutMs - (deadline - Date.now())) / 10) / 100 };
    await sleep(4000);
  }
  return { job, seconds: timeoutMs / 1000 };
}

async function main() {
  const admin: SupabaseClient = createClient(url!, secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon: SupabaseClient = createClient(url!, publishableKey!);

  const email = `p6-probe+${Date.now()}@flowtofeed.test`;
  const password = randomUUID() + randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error || !created.user) {
    console.error(`probe user failed: ${error?.message}`);
    process.exit(1);
  }
  process.env.OWNER_USER_ID = created.user.id;

  const { createApp } = await import("../apps/api/src/app.js");
  const server = createApp().listen(3000, "0.0.0.0");
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  const token = session?.session?.access_token;
  if (signInErr || !token) {
    console.error(`sign-in failed: ${signInErr?.message}`);
    await admin.auth.admin.deleteUser(created.user.id);
    server.close();
    process.exit(1);
  }

  const api = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(`http://127.0.0.1:3000${p}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  try {
    const { body: projBody } = await api("POST", "/api/projects", {
      title: "Cache-Aside", source_markdown: `# Cache-Aside\n\n${PASSAGE}`,
    });
    const projectId = projBody?.project?.id;
    report("project created", !!projectId);

    // 1. flowchart generation (new mode)
    let t0 = Date.now();
    const gen = await api("POST", `/api/projects/${projectId}/diagrams`, {
      mode: "flowchart",
      passage: PASSAGE,
      instruction: "Show the hit path, the miss path, and the write invalidation as separate flows",
    });
    report("flowchart generation accepted 202", gen.status === 202);
    const flow = await pollJob(api, gen.body?.job?.id, 420_000);
    const flowSeconds = Math.round((Date.now() - t0) / 100) / 10;
    report("flowchart job succeeded", flow.job?.state === "succeeded", `state=${flow.job?.state} in ${flowSeconds}s ${JSON.stringify(flow.job?.error)}`);
    report("flowchart mermaid valid", typeof flow.job?.result?.mermaid === "string" && flow.job.result.mermaid.startsWith("flowchart TD"), `${flow.job?.result?.mermaid?.split("\n").length ?? 0} lines`);
    report("flowchart prompt version", flow.job?.result?.promptVersion === "flowchart-v2-compiled", `${flow.job?.result?.promptVersion}`);

    const saved = await api("POST", "/api/diagrams", { projectId, jobId: gen.body?.job?.id });
    report("flowchart diagram saved", saved.status === 201 && saved.body?.diagram?.mode === "flowchart");

    // 2. bounded repair on a broken diagram
    const { data: broken, error: brokenErr } = await admin
      .from("diagrams")
      .insert({
        project_id: projectId,
        mode: "architecture",
        title: "Broken by test",
        source_text: PASSAGE,
        source_revision: projBody.project.source_revision,
        mermaid: "architecture-beta\n    service broken(Not a valid token here ][",
        explanation: null,
        assumptions: [],
        icon_ids: [],
        review_state: "draft",
        render_state: "failed",
      })
      .select("*")
      .single();
    report("broken diagram fixture inserted", !brokenErr && !!broken, brokenErr?.message);

    t0 = Date.now();
    const repair = await api("POST", `/api/diagrams/${broken.id}/repair`, {
      renderError: "Parse error: Expecting '(', '--' or direction, got ']'",
    });
    report("repair accepted 202", repair.status === 202, JSON.stringify(repair.body?.job?.state));
    const rep = await pollJob(api, repair.body?.job?.id, 420_000);
    const repSeconds = Math.round((Date.now() - t0) / 100) / 10;
    report("repair job succeeded", rep.job?.state === "succeeded", `state=${rep.job?.state} in ${repSeconds}s ${JSON.stringify(rep.job?.error)}`);

    const applied = await api("POST", `/api/diagrams/${broken.id}/apply-repair`, { jobId: repair.body?.job?.id });
    report("repair applied", applied.status === 200 && applied.body?.diagram?.mermaid?.startsWith("architecture-beta"), `status ${applied.status}`);
    report("repaired diagram tied to current revision", applied.body?.diagram?.source_revision === projBody.project.source_revision);

    const evidencePath = path.resolve(process.cwd(), "evidence/measurements.md");
    if (!existsSync(evidencePath)) {
      appendFileSync(evidencePath, "# Measured runs\n\n| Date | Operation | Model | Prompt | Duration | Result |\n| --- | --- | --- | --- | --- | --- |\n");
    }
    appendFileSync(
      evidencePath,
      `| 2026-10-25 | flowchart diagram | ${flow.job?.result?.model} | ${flow.job?.result?.promptVersion} | ${flowSeconds}s | ${flow.job?.result?.mermaid?.split("\n").length ?? 0} lines |\n` +
      `| 2026-10-25 | diagram repair (architecture) | ${rep.job?.result?.model} | ${rep.job?.result?.promptVersion} | ${repSeconds}s | repaired ok |\n`,
    );
    console.log("+ evidence appended");
  } finally {
    server.close();
    await admin.auth.admin.deleteUser(created.user.id);
    console.log(`(cleaned up probe user ${email})`);
  }

  console.log(failures === 0 ? "\nAll Phase 6 checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
