/**
 * Phase 2 end-to-end verification against the live Supabase project.
 *
 * Creates a temporary auth user, exercises the real API (auth, project CRUD,
 * revision flip + stale flagging, job events with idempotency and secret
 * checks), then deletes the user (cascades all created rows).
 *
 * Loads apps/api/.env, falling back to the root .env.
 */
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const callbackSecret = process.env.N8N_CALLBACK_SECRET ?? "test-callback-secret";

if (!url || !secretKey || !publishableKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}
process.env.N8N_CALLBACK_SECRET = callbackSecret;

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

interface ApiResponse {
  status: number;
  body: any;
}

async function main() {
  const admin: SupabaseClient = createClient(url!, secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon: SupabaseClient = createClient(url!, publishableKey!);

  // temp owner account (deleted at the end)
  const email = `p2-probe+${Date.now()}@flowtofeed.test`;
  const password = randomUUID() + randomUUID();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    console.error(`Could not create probe user: ${createErr?.message}`);
    process.exit(1);
  }
  const userId = created.user.id;
  process.env.OWNER_USER_ID = userId; // enforce single-owner path during the run

  const { createApp } = await import("../apps/api/src/app.js");
  const server = createApp().listen(0);
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  const token = session?.session?.access_token;
  if (signInErr || !token) {
    console.error(`Sign-in failed: ${signInErr?.message}`);
    await admin.auth.admin.deleteUser(userId);
    server.close();
    process.exit(1);
  }

  const api = async (
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; secret?: string } = {},
  ): Promise<ApiResponse> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.secret) headers["x-callback-secret"] = opts.secret;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, body };
  };

  try {
    const mdV1 = "# Cache-Aside\n\nCheck the cache first, then the database.";
    const mdV2 = mdV1 + "\n\nUpdated with invalidation detail.";
    const rev = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

    // 1. unauthenticated requests are rejected
    const noAuth = await api("POST", "/api/projects", { body: { title: "x", source_markdown: mdV1 } });
    report("unauthenticated create rejected", noAuth.status === 401, `status ${noAuth.status}`);

    // 2. create project -> revision computed server-side
    const created = await api("POST", "/api/projects", {
      token,
      body: { title: "Cache-Aside", source_markdown: mdV1 },
    });
    report("create project 201", created.status === 201, `status ${created.status}`);
    const project = created.body?.project;
    report(
      "server computed source revision",
      project?.source_revision === rev(mdV1),
    );

    // 3. list + detail
    const list = await api("GET", "/api/projects", { token });
    report("list shows the project", list.body?.projects?.length === 1);
    let detail = await api("GET", `/api/projects/${project.id}`, { token });
    report("detail returns project", detail.body?.project?.id === project.id);

    // 4. stale flagging: diagram at old revision, diagram at current revision
    await admin.from("diagrams").insert([
      {
        project_id: project.id,
        mode: "architecture",
        source_text: "passage",
        source_revision: rev(mdV1),
        mermaid: "architecture-beta",
      },
      {
        project_id: project.id,
        mode: "flowchart",
        source_text: "passage",
        source_revision: "ancient-revision",
        mermaid: "flowchart TD",
      },
    ]);
    detail = await api("GET", `/api/projects/${project.id}`, { token });
    const diagrams = detail.body?.diagrams ?? [];
    report(
      "stale flags computed",
      diagrams.length === 2 &&
        diagrams.every((d: any) => d.stale === (d.source_revision !== rev(mdV1))),
      JSON.stringify(diagrams.map((d: any) => ({ mode: d.mode, stale: d.stale }))),
    );

    // 5. patch source -> revision flips, all derived rows go stale
    const patched = await api("PATCH", `/api/projects/${project.id}`, {
      token,
      body: { source_markdown: mdV2 },
    });
    report(
      "patch recomputes revision",
      patched.body?.project?.source_revision === rev(mdV2),
    );
    detail = await api("GET", `/api/projects/${project.id}`, { token });
    report(
      "all diagrams stale after source change",
      (detail.body?.diagrams ?? []).every((d: any) => d.stale === true),
    );

    // 6. validation: oversized source rejected
    const tooBig = await api("POST", "/api/projects", {
      token,
      body: { title: "big", source_markdown: "x".repeat(20_001) },
    });
    report("oversized source rejected 400", tooBig.status === 400, `status ${tooBig.status}`);

    // 7. jobs + idempotent callback events
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .insert({ project_id: project.id, operation: "diagram_generate" })
      .select("*")
      .single();
    report("job fixture inserted", !jobErr && !!job, jobErr?.message);

    const wrongSecret = await api("POST", `/api/internal/jobs/${job.id}/events`, {
      body: { eventId: "evt-wrongsecret", jobId: job.id, status: "running", stage: "s" },
      secret: "not-the-secret",
    });
    report("callback with bad secret rejected", wrongSecret.status === 401, `status ${wrongSecret.status}`);

    const runEvent = await api("POST", `/api/internal/jobs/${job.id}/events`, {
      body: { eventId: "evt-run-0001", jobId: job.id, status: "running", stage: "calling_model" },
      secret: callbackSecret,
    });
    report("running event applied", runEvent.body?.status === "applied", JSON.stringify(runEvent.body));

    const jobAfterRun = await api("GET", `/api/jobs/${job.id}`, { token });
    report(
      "job running with attempts=1",
      jobAfterRun.body?.job?.state === "running" && jobAfterRun.body?.job?.attempts === 1,
    );

    const replay = await api("POST", `/api/internal/jobs/${job.id}/events`, {
      body: { eventId: "evt-run-0001", jobId: job.id, status: "running", stage: "calling_model" },
      secret: callbackSecret,
    });
    report("duplicate eventId acknowledged", replay.body?.status === "duplicate", JSON.stringify(replay.body));
    const jobAfterReplay = await api("GET", `/api/jobs/${job.id}`, { token });
    report(
      "attempts unchanged after replay",
      jobAfterReplay.body?.job?.attempts === 1,
    );

    const doneEvent = await api("POST", `/api/internal/jobs/${job.id}/events`, {
      body: {
        eventId: "evt-done-0001",
        jobId: job.id,
        status: "succeeded",
        stage: "validated",
        result: { mermaid: "architecture-beta", title: "Cache-Aside" },
      },
      secret: callbackSecret,
    });
    report("succeeded event applied", doneEvent.body?.state === "succeeded");
    const jobDone = await api("GET", `/api/jobs/${job.id}`, { token });
    report(
      "terminal result stored",
      jobDone.body?.job?.result?.title === "Cache-Aside" && jobDone.body?.job?.attempts === 1,
    );

    // 8. cross-checks
    const foreignJob = await api("GET", `/api/jobs/${randomUUID()}`, { token });
    report("unknown job 404", foreignJob.status === 404);
    const noTokenJobs = await api("GET", `/api/jobs/${job.id}`);
    report("jobs endpoint requires auth", noTokenJobs.status === 401);
    const mismatch = await api("POST", `/api/internal/jobs/${randomUUID()}/events`, {
      body: { eventId: "evt-mismatch1", jobId: job.id, status: "running", stage: "s" },
      secret: callbackSecret,
    });
    report("url/body job id mismatch rejected", mismatch.status === 400, `status ${mismatch.status}`);
  } finally {
    server.close();
    await admin.auth.admin.deleteUser(userId);
    console.log(`\n(cleaned up probe user ${email})`);
  }

  console.log(failures === 0 ? "\nAll Phase 2 checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
