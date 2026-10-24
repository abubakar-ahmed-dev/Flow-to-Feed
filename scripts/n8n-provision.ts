/**
 * Provisions the local n8n container with FlowToFeed credentials + workflows:
 *  1. ensures N8N_WEBHOOK_SECRET / N8N_CALLBACK_SECRET exist in apps/api/.env
 *     (generates and persists them if missing or placeholder)
 *  2. writes credential import files with the REAL secret values (temp dir,
 *     never committed)
 *  3. docker cp + n8n import:credentials + import:workflow --activeState=fromJson
 *  4. restarts the container so production webhooks register
 *
 * Run before scripts/test-n8n-roundtrip.ts. Requires Docker Desktop running.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const API_ENV = path.resolve(process.cwd(), "apps/api/.env");
const WORKFLOW_SRC = path.resolve(process.cwd(), "workflows/generate.json");
const IMPORT_DIR = path.join(os.tmpdir(), "flowtofeed-n8n-import");
const CONTAINER = "flowtofeed-n8n";

function loadEnv(file: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(file)) return map;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) map.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  return map;
}

/**
 * Edits ONLY the target key lines in place (or appends). Never rebuilds the
 * file from parsed state — a parse miss must not be able to drop other keys.
 */
function ensureSecrets(): void {
  const keys = ["N8N_WEBHOOK_SECRET", "N8N_CALLBACK_SECRET"];
  const original = existsSync(API_ENV) ? readFileSync(API_ENV, "utf8") : "";
  let lines = original.split(/\r?\n/);
  let changed = false;

  for (const key of keys) {
    const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    const currentValue = loadEnv(API_ENV).get(key);
    if (!currentValue || currentValue.includes("REPLACE")) {
      const newLine = `${key}=${randomBytes(24).toString("hex")}`;
      if (idx >= 0) {
        lines[idx] = newLine;
      } else {
        lines = [...lines.filter((l) => l.trim() !== ""), newLine];
      }
      changed = true;
      console.log(`+ ${idx >= 0 ? "replaced" : "appended"} ${key}`);
    }
  }

  if (changed) {
    writeFileSync(API_ENV, lines.join("\n"));
    console.log("+ secrets persisted to apps/api/.env (other lines untouched)");
  }
}

function sh(cmd: string): string {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

async function main() {
  ensureSecrets();
  const env = loadEnv(API_ENV);
  const webhookSecret = env.get("N8N_WEBHOOK_SECRET")!;
  const callbackSecret = env.get("N8N_CALLBACK_SECRET")!;

  // credential import files — real values, temp dir only
  rmSync(IMPORT_DIR, { recursive: true, force: true });
  mkdirSync(IMPORT_DIR, { recursive: true });
  writeFileSync(
    path.join(IMPORT_DIR, "cred-webhook.json"),
    JSON.stringify([
      {
        id: "flowtofeedWebhookAuth",
        name: "FlowToFeed Generate Webhook Auth",
        type: "httpHeaderAuth",
        data: { name: "x-webhook-secret", value: webhookSecret },
      },
    ]),
  );
  // The outgoing callback secret cannot ride a generic headerAuth credential
  // (HTTP Request node drops it at runtime — verified 2026-10-24), so the
  // provisioned workflow copy carries the real value; the committed source
  // keeps the placeholder.
  writeFileSync(
    path.join(IMPORT_DIR, "generate.json"),
    readFileSync(WORKFLOW_SRC, "utf8").replace(
      "REPLACE_N8N_CALLBACK_SECRET",
      callbackSecret,
    ),
  );

  sh(`docker exec ${CONTAINER} mkdir -p /home/node/.n8n-import`);
  sh(`docker cp "${IMPORT_DIR}/." ${CONTAINER}:/home/node/.n8n-import/`);
  console.log(
    sh(`docker exec ${CONTAINER} sh -c "n8n import:credentials --input=/home/node/.n8n-import/cred-webhook.json"`) || "imported webhook credential",
  );
  console.log(
    sh(
      `docker exec ${CONTAINER} sh -c "n8n import:workflow --input=/home/node/.n8n-import/generate.json"`,
    ) || "workflow imported",
  );
  // regular deployment mode ignores --activeState on import; activate explicitly
  const listing = sh(`docker exec ${CONTAINER} sh -c "n8n list:workflow"`);
  console.log(listing);
  const ids = [...listing.matchAll(/^([^\s|]+)\s*\|/gm)].map((m) => m[1]);
  const workflowId = ids.at(-1); // freshly imported workflow is last in the list
  if (workflowId) {
    console.log(
      sh(
        `docker exec ${CONTAINER} sh -c "n8n update:workflow --id=${workflowId} --active=true"`,
      ) || `workflow ${workflowId} activated`,
    );
  } else {
    console.error("could not resolve workflow id from list:workflow output");
    console.error(listing);
  }

  // active workflow webhooks register at startup
  sh(`docker restart ${CONTAINER}`);
  execSync("sleep 6");
  console.log("container restarted — production webhook should be live at");
  console.log("  http://localhost:5678/webhook/generate");
  rmSync(IMPORT_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
