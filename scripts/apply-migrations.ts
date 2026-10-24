/**
 * Applies SQL migrations from supabase/migrations/ in filename order.
 * Tracks applied files in schema_migrations so re-runs are no-ops.
 *
 * Requires SUPABASE_DB_URL (Supabase dashboard -> Connect -> Session pooler
 * connection string). Loads apps/api/.env, falling back to the root .env.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "apps/api/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(
    "Missing SUPABASE_DB_URL. Copy the Session pooler connection string from " +
      "Supabase dashboard -> Connect into apps/api/.env (local/dev use only).",
  );
  process.exit(1);
}

const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new Client({ connectionString: dbUrl });

async function main() {
  await client.connect();

  await client.query(`
    create table if not exists public.schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query<{ id: string }>(
    "select id from public.schema_migrations",
  );
  const applied = new Set(rows.map((r) => r.id));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`> applying ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into public.schema_migrations (id) values ($1)",
        [file],
      );
      await client.query("commit");
      ran += 1;
      console.log(`✓ ${file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`✗ ${file} failed — rolled back`);
      throw err;
    }
  }

  console.log(ran === 0 ? "No new migrations." : `Applied ${ran} migration(s).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
