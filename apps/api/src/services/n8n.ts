import { env } from "../config/env.js";

export interface GenerationTrigger {
  jobId: string;
  operation: "diagram_generate" | "diagram_repair" | "social_adapt";
  mode: string;
  passage: string;
  instruction?: string;
  priorMermaid?: string;
  renderError?: string;
}

/**
 * Fires the n8n generation webhook (production URL). Bounded wait — n8n
 * acks 202 immediately; all real progress arrives via callbacks.
 */
export async function triggerGeneration(trigger: GenerationTrigger): Promise<void> {
  const url = env.n8n.generationWebhookUrl;
  if (!url) throw new Error("N8N_GENERATION_WEBHOOK_URL is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": env.n8n.webhookSecret ?? "",
      },
      body: JSON.stringify({
        jobId: trigger.jobId,
        operation: trigger.operation,
        mode: trigger.mode,
        passage: trigger.passage,
        instruction: trigger.instruction,
        priorMermaid: trigger.priorMermaid,
        renderError: trigger.renderError,
      }),
      signal: controller.signal,
    });
    if (res.status !== 200 && res.status !== 202) {
      throw new Error(`n8n webhook responded ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
