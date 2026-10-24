import { supabaseAdmin } from "../db.js";
import type { JobEventInput } from "@flowtofeed/shared";
import type { JobRow } from "./projects.js";

/**
 * Pure transition for a job row given an n8n callback event.
 * Each `running` event counts one provider attempt; `succeeded`/`failed` freeze
 * the terminal state with the result or error payload.
 */
export function applyJobEvent(
  job: { state: string; stage: string | null; attempts: number },
  event: JobEventInput,
): Partial<JobRow> {
  const stage = event.stage || job.stage;
  if (event.status === "running") {
    return { state: "running", stage, attempts: job.attempts + 1 };
  }
  if (event.status === "succeeded") {
    return { state: "succeeded", stage, result: event.result ?? null };
  }
  return {
    state: "failed",
    stage,
    error: event.error ?? { code: "unknown", message: "Job failed without error detail" },
  };
}

/** Returns the job only when it belongs to a project owned by `userId`. */
export async function getJobForUser(
  jobId: string,
  userId: string,
): Promise<(JobRow & { project: { owner_id: string; title: string } }) | null> {
  const { data, error } = await supabaseAdmin()
    .from("jobs")
    .select("*, project:projects(owner_id, title)")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as JobRow & { project: { owner_id: string; title: string } | null };
  const project = row.project;
  if (!project || project.owner_id !== userId) return null;
  return { ...row, project };
}
