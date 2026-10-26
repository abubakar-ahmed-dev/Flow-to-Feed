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

function sh(cmd: string, timeoutMs = 60_000): string {
  // every docker exec gets a hard timeout — n8n CLI calls can stall forever
  // when the server is mid-bootstrap, and an unbounded execSync hangs the run
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs }).toString().trim();
}

function waitCliReady(maxSeconds = 90): boolean {
  for (let i = 0; i < Math.ceil(maxSeconds / 3); i++) {
    try {
      sh(`docker exec ${CONTAINER} sh -c "n8n list:workflow"`, 30_000);
      return true;
    } catch {
      execSync("sleep 3");
    }
  }
  return false;
}

function listWorkflowIds(): string[] {
  const listing = sh(`docker exec ${CONTAINER} sh -c "n8n list:workflow"`, 45_000);
  // v2.44.6 prints rows through the logger: `... | info | ID|Name {...}`
  return [...listing.matchAll(/\|\s*info\s*\|\s*([A-Za-z0-9_-]+)\|/g)].map((m) => m[1]);
}

function probeWebhook(): string {
  try {
    return execSync(
      `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5678/webhook/generate -H "x-webhook-secret: probe" -d "{}"`,
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString().trim();
  } catch {
    return "000";
  }
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
  // keeps the placeholder. Same trick for the API base URL: the committed
  // workflow targets the local API (host.docker.internal); setting
  // N8N_CALLBACK_BASE_URL repoints callbacks (e.g. at the Render deploy).
  const callbackBase = env.get("N8N_CALLBACK_BASE_URL") ?? "http://host.docker.internal:3000";
  writeFileSync(
    path.join(IMPORT_DIR, "generate.json"),
    readFileSync(WORKFLOW_SRC, "utf8")
      .replaceAll("REPLACE_N8N_CALLBACK_SECRET", callbackSecret)
      .replaceAll("http://host.docker.internal:3000", callbackBase.replace(/\/+$/, "")),
  );

  sh(`docker exec ${CONTAINER} mkdir -p /home/node/.n8n-import`);
  sh(`docker cp "${IMPORT_DIR}/." ${CONTAINER}:/home/node/.n8n-import/`);

  if (!waitCliReady()) {
    console.error("n8n CLI never became ready — is the container healthy?");
    process.exit(1);
  }
  console.log(
    sh(`docker exec ${CONTAINER} sh -c "n8n import:credentials --input=/home/node/.n8n-import/cred-webhook.json"`) || "imported webhook credential",
  );
  if (!waitCliReady()) {
    console.error("n8n CLI never became ready — is the container healthy?");
    process.exit(1);
  }

  // deactivate every existing workflow first — only one workflow can own the
  // /webhook/generate production path, and a stale active copy blocks the new one
  for (const old of listWorkflowIds()) {
    try {
      sh(`docker exec ${CONTAINER} sh -c "n8n update:workflow --id=${old} --active=false"`, 30_000);
      console.log(`deactivated stale workflow ${old}`);
    } catch {
      console.error(`could not deactivate stale workflow ${old} (may already be inactive)`);
    }
  }

  console.log(
    sh(
      `docker exec ${CONTAINER} sh -c "n8n import:workflow --input=/home/node/.n8n-import/generate.json"`,
      90_000,
    ) || "workflow imported",
  );

  const ids = listWorkflowIds();
  const workflowId = ids.at(-1); // every import appends; last row is the fresh copy
  if (!workflowId) {
    console.error("no workflow id in list output after import");
    process.exit(1);
  }
  console.log(
    sh(
      `docker exec ${CONTAINER} sh -c "n8n publish:workflow --id=${workflowId}"`,
      60_000,
    ) || `workflow ${workflowId} published`,
  );
  console.log(
    sh(
      `docker exec ${CONTAINER} sh -c "n8n update:workflow --id=${workflowId} --active=true"`,
      60_000,
    ) || `activation command sent for ${workflowId}`,
  );

  // one restart, then a short confirm poll. Production webhook routes only
  // register at boot and observed boots take 4-6+ minutes — outliving them
  // here wastes the run (every budget so far was beaten by the boot). The
  // script's contract: import, activate, restart; confirmation is a separate
  // probe once boot settles.
  sh(`docker restart ${CONTAINER}`, 120_000);
  let registered = false;
  for (let i = 0; i < 24; i++) {
    const code = probeWebhook();
    if (code !== "404" && code !== "000") {
      console.log(`webhook registered (probe ${code})`);
      registered = true;
      break;
    }
    execSync("sleep 5");
  }
  if (!registered) {
    console.log(
      "container rebooting — webhook routes register 4-6 min after boot.\n" +
        "Confirm with: curl -s -o /dev/null -w \"%{http_code}\" -X POST http://localhost:5678/webhook/generate -H \"x-webhook-secret: probe\"\n" +
        "(403 = registered and rejecting the probe secret; 404 = not yet)",
    );
  } else {
    console.log("production webhook live at http://localhost:5678/webhook/generate");
  }
  rmSync(IMPORT_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
