/**
 * Phase 8 E2E (API part): asset upload integrity + public delivery.
 * temp user/project + admin-inserted instagram variant (5 slides, valid shape)
 * -> upload real JPEG -> 201 -> public URL fetches 200 without auth
 * -> sha256 mismatch -> 400 -> wrong dimensions -> 400 -> listing works.
 * (Browser export path verified manually by the owner; documented in plan.)
 */
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

const JPEG = readFileSync(path.resolve(process.cwd(), "evidence/fixtures/pixel.jpg"));
const HASH = createHash("sha256").update(JPEG).digest("hex");

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const admin: SupabaseClient = createClient(url!, secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon: SupabaseClient = createClient(url!, publishableKey!);

  const email = `p8-probe+${Date.now()}@flowtofeed.test`;
  const password = randomUUID() + randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
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

  try {
    const mk = async (method: string, p: string, body?: unknown, contentType = "application/json") =>
      fetch(`http://127.0.0.1:3000${p}`, {
        method,
        headers: { "content-type": contentType, authorization: `Bearer ${token}` },
        body: body === undefined
          ? undefined
          : Buffer.isBuffer(body)
            ? body
            : JSON.stringify(body),
      });

    const projRes = await mk("POST", "/api/projects", {
      title: "Cache-Aside",
      source_markdown: "# Cache-Aside\n\n" + "x".repeat(50),
    });
    const projBody = (await projRes.json()) as any;
    report("project created", !!projBody?.project?.id, `status ${projRes.status} ${JSON.stringify(projBody).slice(0, 200)}`);

    // admin-inserted instagram variant (5 slides) — job machinery proven in P7
    const content = {
      instagram: {
        title: "Cache-Aside Explained",
        caption: "Reads get fast without breaking correctness.",
        slides: [1, 2, 3, 4, 5].map((i) => ({ heading: `Slide ${i}`, body: `Body for slide ${i}.` })),
      },
    };
    const { data: variant, error: vErr } = await admin
      .from("variants")
      .insert({ project_id: projBody.project.id, platform: "instagram", source_revision: projBody.project.source_revision, content })
      .select("*")
      .single();
    report("variant fixture inserted", !vErr && !!variant, vErr?.message);

    // 1. happy path upload
    const q = `projectId=${projBody.project.id}&platform=instagram&variantId=${variant.id}&slideIndex=0&width=1080&height=1350&hash=${HASH}`;
    const up = await mk("POST", `/api/assets/upload?${q}`, JPEG, "image/jpeg");
    const upBody = await up.json();
    report("upload accepted 201", up.status === 201 && !!upBody?.publicUrl, `status ${up.status} ${JSON.stringify(upBody).slice(0,250)}`);

    // 2. public URL fetches without auth
    const pub = await fetch(upBody?.publicUrl ?? "");
    report("public URL fetches 200 anon", pub.status === 200 && (pub.headers.get("content-type") ?? "").startsWith("image/jpeg"), `status ${pub.status}`);

    // 3. integrity: wrong hash rejected
    const badHash = await mk("POST", `/api/assets/upload?${q}&hash=${"0".repeat(64)}`, JPEG, "image/jpeg");
    report("hash mismatch rejected 400", badHash.status === 400, `status ${badHash.status}`);

    // 4. wrong platform dimensions rejected
    const badDims = await mk("POST", `/api/assets/upload?projectId=${projBody.project.id}&platform=instagram&variantId=${variant.id}&width=100&height=100&hash=${HASH}`, JPEG, "image/jpeg");
    report("wrong dimensions rejected 400", badDims.status === 400, `status ${badDims.status}`);

    // 5. listing
    const list = await mk("GET", `/api/assets?variantId=${variant.id}`);
    const listBody = await list.json();
    report("asset listing works", list.status === 200 && listBody?.assets?.length === 1, `${listBody?.assets?.length ?? 0} assets`);

    // 6. unauthenticated upload rejected
    const anonUp = await fetch(`http://127.0.0.1:3000/api/assets/upload?${q}`, {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: JPEG,
    });
    report("anon upload rejected 401", anonUp.status === 401, `status ${anonUp.status}`);
  } finally {
    server.close();
    if (failures === 0) {
      await admin.auth.admin.deleteUser(created.user.id);
      console.log(`(cleaned up probe user ${email})`);
    } else {
      console.log(`(kept probe user ${email} for debugging)`);
    }
  }

  console.log(failures === 0 ? "\nAll Phase 8 API checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
