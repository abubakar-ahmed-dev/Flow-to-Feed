/**
 * Repairs SUPABASE_DB_URL when it points at the direct database host
 * (db.<ref>.supabase.co), which has no DNS record without Supabase's IPv4
 * add-on. Derives the Session pooler URL by probing Supabase regions with the
 * ref + password already present in the stored URL, then rewrites the single
 * .env line in place. Never prints credentials.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ENV_FILE = existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "apps/api/.env");

const current = process.env.SUPABASE_DB_URL;
if (!current) {
  console.error("No SUPABASE_DB_URL found.");
  process.exit(1);
}

const m = current.match(/postgres(?:ql)?:\/\/(?:postgres\.|postgres:)([^:@]+)?:?([^@]*)@/);
const ref = current.match(/postgres(?:ql)?:\/\/[^/]*?postgres\.([a-z0-9]+)@/)?.[1]
  ?? current.match(/@db\.([a-z0-9]+)\.supabase\.co/)?.[1];
if (!ref) {
  console.error("Could not extract project ref from SUPABASE_DB_URL.");
  process.exit(1);
}
const password = (() => {
  try {
    const u = new URL(current);
    return decodeURIComponent(u.password);
  } catch {
    return current.match(/:\/\/[^:]+:([^@]+)@/)?.[1] ?? "";
  }
})();

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "sa-east-1",
];

async function tryRegion(region: string): Promise<boolean> {
  const client = new Client({
    host: `aws-0-${region}.pooler.supabase.com`,
    port: 5432,
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    connectionTimeoutMillis: 6000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (/pooler\.supabase\.com/.test(current)) {
    console.log("SUPABASE_DB_URL already uses the pooler — nothing to do.");
    return;
  }
  console.log(`probing pooler regions for project ${ref.slice(0, 6)}…`);
  for (const region of REGIONS) {
    process.stdout.write(`  ${region}: `);
    if (await tryRegion(region)) {
      console.log("OK");
      const fixed = `SUPABASE_DB_URL=postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
      const lines = readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
      const idx = lines.findIndex((l) => /^\s*SUPABASE_DB_URL\s*=/.test(l));
      if (idx >= 0) lines[idx] = fixed;
      else lines.push(fixed);
      writeFileSync(ENV_FILE, lines.join("\n"));
      console.log(`+ rewrote SUPABASE_DB_URL (session pooler, ${region})`);
      return;
    }
    console.log("no");
  }
  console.error("No region accepted the connection — paste the Session pooler string from the Supabase dashboard manually.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
