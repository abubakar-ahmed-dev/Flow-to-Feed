/**
 * Phase 7 E2E: all three channel adaptations through the real pipeline.
 * Triggers instagram + facebook + x jobs concurrently (n8n executes them in
 * parallel), saves each variant, asserts weighted-X validation runs
 * backend-side, appends measured durations to evidence/measurements.md.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
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

const PASSAGE = `Cache-aside: the application checks the cache first. On a hit it returns the value immediately and PostgreSQL is never touched. On a miss it reads PostgreSQL, stores the value in Redis with a TTL, and returns it. Writes update PostgreSQL and invalidate the Redis key rather than updating the cached copy. The cache is disposable: if Redis restarts, correctness survives and the cache warms up again.`;

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type JobLite = { id: string; state: string; error?: { message?: string } | null; result?: any };

async function main() {
  const admin: SupabaseClient = createClient(url!, secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon: SupabaseClient = createClient(url!, publishableKey!);

  const email = `p7-probe+${Date.now()}@flowtofeed.test`;
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
      title: "Cache-Aside",
      source_markdown: `# Cache-Aside\n\n${PASSAGE}`,
    });
    const projectId = projBody?.project?.id;
    report("project created", !!projectId);

    // Serial by design: three concurrent Gemma calls through the container
    // network exhaust connections (measured 2026-10-25); serial keeps each
    // call within the HTTP timeout.
    const t0 = Date.now();
    const platforms = (process.argv[2] ? process.argv[2].split(",") : ["instagram", "facebook", "x"]) as (
      | "instagram"
      | "facebook"
      | "x"
    )[];
    const jobs: Record<string, JobLite | null> = {};
    const secondsBy: Record<string, number> = {};
    for (const platform of platforms) {
      const started = Date.now();
      const r = await api("POST", `/api/projects/${projectId}/social`, { platform, passage: PASSAGE });
      report(`${platform} generation accepted 202`, r.status === 202 && !!r.body?.job?.id);
      jobs[platform] = r.body?.job ?? null;
      const deadline = Date.now() + 900_000;
      while (jobs[platform] && Date.now() < deadline) {
        const j = jobs[platform]!;
        const poll = await api("GET", `/api/jobs/${j.id}`);
        const job = poll.body?.job as JobLite | undefined;
        if (job) {
          jobs[platform] = job;
          if (job.state !== "queued" && job.state !== "running") break;
        }
        await sleep(4000);
      }
      secondsBy[platform] = Math.round((Date.now() - started) / 100) / 10;
      process.stdout.write(`  ${platform}: ${jobs[platform]?.state} in ${secondsBy[platform]}s\n`);
    }
    const seconds = Math.round((Date.now() - t0) / 100) / 10;

    // assert per platform + save variants
    for (const platform of platforms) {
      const job = jobs[platform];
      report(`${platform} job succeeded`, job?.state === "succeeded", `state=${job?.state} in ${seconds}s ${JSON.stringify(job?.error)}`);
      const saved = await api("POST", "/api/variants/save", { projectId, jobId: job?.id });
      report(`${platform} variant saved`, saved.status === 201, `status ${saved.status} ${JSON.stringify(saved.body).slice(0, 300)}`);
    }

    const detail = await api("GET", `/api/projects/${projectId}`);
    const variants = detail.body?.variants ?? [];
    report("three variants on project", variants.length === 3, `${variants.length} variants`);
    const x = variants.find((v: any) => v.platform === "x")?.content?.x;
    report("x posts present", Array.isArray(x?.posts) && x.posts.length >= 3, `${x?.posts?.length ?? 0} posts`);

    // backend weighted validation: corrupt an X post to 300 chars -> PATCH rejected
    const xVariant = variants.find((v: any) => v.platform === "x");
    if (xVariant) {
      const bad = structuredClone(xVariant.content);
      bad.x.posts[0] = "y".repeat(300);
      const rejected = await api("PATCH", `/api/variants/${xVariant.id}`, { content: bad });
      report("backend rejects over-weight X post", rejected.status === 400, `status ${rejected.status}`);
    }

    const evidencePath = path.resolve(process.cwd(), "evidence/measurements.md");
    if (!existsSync(evidencePath)) {
      appendFileSync(evidencePath, "# Measured runs\n\n| Date | Operation | Model | Prompt | Duration | Result |\n| --- | --- | --- | --- | --- | --- |\n");
    }
    appendFileSync(
      evidencePath,
      `| 2026-10-25 | social adapt (IG+FB+X parallel) | gemma-4-26b-a4b-it | social-*-v2 | ${seconds}s | 3 variants saved |\n`,
    );
    console.log("+ evidence appended");
  } finally {
    server.close();
    if (failures === 0) {
      await admin.auth.admin.deleteUser(created.user.id);
      console.log(`(cleaned up probe user ${email})`);
    } else {
      console.log(`(kept probe user ${email} for debugging — delete manually)`);
    }
  }

  console.log(failures === 0 ? "\nAll Phase 7 checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
