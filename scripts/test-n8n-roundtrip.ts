/**
 * Phase 3 end-to-end round-trip: app database -> n8n webhook -> n8n -> API
 * callback -> job state.
 *
 *  1. creates a temp user/project/job (cascaded cleanup at the end)
 *  2. POSTs to the live n8n production webhook with the webhook secret
 *  3. expects 202 + the job to reach state=running with attempts=1
 *  4. replays the same request — event id is derived from the job id, so the
 *     duplicate must be a no-op (attempts stay 1)
 *  5. a wrong secret must be rejected by the webhook auth (401)
 *
 * Requires: n8n container running and provisioned (scripts/n8n-provision.ts),
 * apps/api/.env with Supabase + N8N_WEBHOOK_SECRET.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
const WEBHOOK = "http://localhost:5678/webhook/generate";

if (!url || !secretKey || !publishableKey || !webhookSecret) {
  console.error("Missing Supabase keys or N8N_WEBHOOK_SECRET in apps/api/.env");
  process.exit(1);
}

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollJob(
  admin: SupabaseClient,
  jobId: string,
  want: (job: any) => boolean,
  timeoutMs = 15000,
): Promise<any | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await admin.from("jobs").select("*").eq("id", jobId).single();
    if (data && want(data)) return data;
    await sleep(500);
  }
  return null;
}

async function main() {
  const admin: SupabaseClient = createClient(url!, secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon: SupabaseClient = createClient(url!, publishableKey!);

  const email = `p3-probe+${Date.now()}@flowtofeed.test`;
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
  const userId = created.user.id;
  process.env.OWNER_USER_ID = userId;

  // The provisioned workflow calls back to http://host.docker.internal:3000 —
  // the API must listen there for the round-trip. Stop any dev API first.
  const { createApp } = await import("../apps/api/src/app.js");
  const server = createApp().listen(3000, "0.0.0.0");
  console.log("api listening on :3000 (n8n callback target)");

  try {
    const { data: project, error: projErr } = await admin
      .from("projects")
      .insert({
        owner_id: userId,
        title: "n8n roundtrip probe",
        source_markdown: "# probe",
        source_revision: "probe-rev",
      })
      .select("*")
      .single();
    if (projErr || !project) throw new Error(`project fixture failed: ${projErr?.message}`);

    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .insert({ project_id: project.id, operation: "diagram_generate" })
      .select("*")
      .single();
    if (jobErr || !job) throw new Error(`job fixture failed: ${jobErr?.message}`);

    // 1. happy path
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": webhookSecret! },
      body: JSON.stringify({ jobId: job.id }),
    });
    const body: any = await res.json().catch(() => null);
    report("webhook 202 accepted", res.status === 202 && body?.accepted === true && body?.jobId === job.id, `status ${res.status} ${JSON.stringify(body)}`);

    const running = await pollJob(admin, job.id, (j) => j.state === "running" && j.attempts === 1);
    report("callback applied: job running, attempts=1", !!running, running ? `stage=${running.stage}` : "timeout");

    const { data: events } = await admin.from("job_events").select("event_id").eq("job_id", job.id);
    report("event stored with derived id", events?.length === 1 && events![0]?.event_id === `n8n-${job.id}-ack`, JSON.stringify(events));

    // 2. replay = same derived eventId = idempotent no-op
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": webhookSecret! },
      body: JSON.stringify({ jobId: job.id }),
    });
    await sleep(2500);
    const afterReplay = await admin.from("jobs").select("*").eq("id", job.id).single();
    report("replay: attempts still 1", afterReplay.data?.attempts === 1, `attempts=${afterReplay.data?.attempts}`);

    // 3. wrong secret rejected (n8n header auth returns 403)
    const bad = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": "wrong" },
      body: JSON.stringify({ jobId: job.id }),
    });
    report("wrong secret rejected", bad.status === 403, `status ${bad.status}`);
  } finally {
    if (server) server.close();
    await admin.auth.admin.deleteUser(userId);
    console.log(`(cleaned up probe user ${email})`);
  }

  console.log(failures === 0 ? "\nAll Phase 3 checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
