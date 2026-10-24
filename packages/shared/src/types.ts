// Shared contracts between web, api, and n8n payloads.
// Source of truth: bg-context.md §8 — adjust only with both sides in sync.

export type DiagramMode = "architecture" | "flowchart" | "sequence";
export type Platform = "instagram" | "facebook" | "x";
export type DistributionAction = "buffer_draft" | "publish_now" | "schedule";

/** Per-channel distribution lifecycle shown in the UI. */
export type DistributionState =
  | "draft"
  | "submitting"
  | "scheduled"
  | "published"
  | "failed"
  | "needs_verification";

export interface DiagramResult {
  mode: DiagramMode;
  title: string;
  mermaid: string;
  explanation: string;
  assumptions: string[];
  sourceRevision: string;
}

export interface SocialDraft {
  platform: Platform;
  sourceRevision: string;
  diagramIds: string[];
  caption?: string;
  paragraphs?: string[];
  thread?: { text: string; assetId?: string }[];
  slides?: {
    title: string;
    body: string;
    diagramId?: string;
    altText: string;
  }[];
  caveats: string[];
}

/** Authenticated, idempotent callback from n8n to the API. */
export interface JobEvent {
  eventId: string;
  jobId: string;
  status: "running" | "succeeded" | "failed";
  stage: string;
  result?: unknown;
  error?: { code: string; message: string };
}

/** Envelope the API sends to n8n when starting a generation job. */
export interface GenerationJobPayload {
  jobId: string;
  operation: "diagram_generate" | "diagram_repair" | "social_adapt";
  sourceRevision: string;
  sourceContext: string;
  instruction?: string;
  mode?: DiagramMode;
  platform?: Platform;
  approvedDiagramRefs?: { diagramId: string; mermaid: string }[];
  callbackUrl: string;
}
