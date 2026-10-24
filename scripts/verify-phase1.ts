/**
 * Phase 1 smoke checks:
 *  1. service-role path reaches every table
 *  2. anon (publishable) key can read but cannot write — RLS lockdown holds
 *  3. the shareable-assets storage bucket exists (created if missing)
 *
 * Loads apps/api/.env, falling back to the root .env.
 */
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!url || !secretKey || !publishableKey) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY.",
  );
  process.exit(1);
}

const TABLES = [
  "projects",
  "diagrams",
  "variants",
  "assets",
  "jobs",
  "job_events",
  "distribution_attempts",
] as const;

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

  // 1. service-role reads every table (empty results are fine)
  for (const table of TABLES) {
    const { error } = await admin.from(table).select("*").limit(1);
    report(`service-role read ${table}`, !error, error?.message);
  }

  // 2. anon can read (rows filtered to the public sample — none yet)
  for (const table of TABLES) {
    const { error } = await anon.from(table).select("*").limit(1);
    report(`anon read ${table}`, !error, error?.message);
  }

  // 3. anon cannot write: insert into projects must violate RLS
  const { error: insertError } = await anon.from("projects").insert({
    owner_id: crypto.randomUUID(),
    title: "rls-probe",
    source_markdown: "should never persist",
    source_revision: "probe",
  });
  report(
    "anon insert rejected by RLS",
    insertError !== null,
    insertError ? insertError.message : "insert unexpectedly succeeded",
  );

  // 4. shareable-assets bucket exists and is public
  const bucket = "shareable-assets";
  const { data: buckets } = await admin.storage.listBuckets();
  const existing = buckets?.find((b) => b.name === bucket);
  if (existing) {
    report(`bucket ${bucket} exists`, true);
    report(`bucket ${bucket} public`, existing.public === true);
  } else {
    const { error } = await admin.storage.createBucket(bucket, {
      public: true,
    });
    report(`bucket ${bucket} created (public)`, !error, error?.message);
  }

  console.log(failures === 0 ? "\nAll Phase 1 checks passed." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exitCode = 1;
}

main();
