import { supabaseAdmin } from "../db.js";
import { validateSocialContent, type SocialContent, type SocialValidationIssue } from "@flowtofeed/shared";
import { getProject, type ProjectRow } from "./projects.js";

export interface VariantRow {
  id: string;
  project_id: string;
  platform: "instagram" | "facebook" | "x";
  source_revision: string;
  revision: number;
  content: SocialContent[keyof SocialContent];
  created_at: string;
  updated_at: string;
}

type SaveResult = { variant: VariantRow } | { error: "not_found" | "invalid_job" };

export type StartResult =
  | { job: Record<string, unknown> }
  | { error: "not_found" };

/** Starts a social adaptation job (202; content arrives via callbacks). */
export async function startSocialAdapt(
  userId: string,
  projectId: string,
  platform: "instagram" | "facebook" | "x",
  passage: string,
  instruction: string | undefined,
  trigger: (t: {
    jobId: string;
    operation: "social_adapt";
    mode: string;
    passage: string;
    instruction?: string;
  }) => Promise<void>,
): Promise<StartResult> {
  const project: ProjectRow | null = await getProject(projectId);
  if (!project || project.owner_id !== userId) return { error: "not_found" };

  const { data: job, error: jobError } = await supabaseAdmin()
    .from("jobs")
    .insert({
      project_id: projectId,
      operation: "social_adapt",
      input: { platform, passage, instruction },
    })
    .select("*")
    .single();
  if (jobError) throw jobError;

  try {
    await trigger({
      jobId: job.id,
      operation: "social_adapt",
      mode: platform,
      passage,
      instruction,
    });
  } catch (err) {
    await supabaseAdmin()
      .from("jobs")
      .update({
        state: "failed",
        error: {
          code: "trigger_failed",
          message: err instanceof Error ? err.message : "n8n trigger failed",
        },
      })
      .eq("id", job.id);
    return { job: { ...job, state: "failed" } };
  }
  return { job };
}

/** Persists a social variant from a succeeded adaptation job. */
export async function saveVariantFromJob(
  userId: string,
  projectId: string,
  jobId: string,
): Promise<SaveResult> {
  const project: ProjectRow | null = await getProject(projectId);
  if (!project || project.owner_id !== userId) return { error: "not_found" };

  const { data: job, error: jobError } = await supabaseAdmin()
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  const result = job?.result as
    | { platform?: keyof SocialContent; content?: SocialContent[keyof SocialContent] }
    | undefined;
  if (
    !job ||
    job.project_id !== projectId ||
    job.operation !== "social_adapt" ||
    job.state !== "succeeded" ||
    !result?.platform ||
    !result.content
  ) {
    console.error(
      "[variants] save rejected:",
      JSON.stringify({
        hasJob: !!job,
        jobProject: job?.project_id,
        requestedProject: projectId,
        operation: job?.operation,
        state: job?.state,
        hasResult: !!job?.result,
        platform: result?.platform,
        hasContent: !!result?.content,
      }),
    );
    return { error: "invalid_job" };
  }

  const platform = result.platform;
  // backend-side content validation (X weighted length etc.)
  // content is the wrapper {instagram|facebook|x: {...}}; validators take the per-platform section
  const issues = validateSocialContent(platform, result.content?.[platform]);
  if (issues.length > 0) {
    console.error("[variants] content rejected:", platform, JSON.stringify(issues));
    return { error: "invalid_job" };
  }

  const { data: existing } = await supabaseAdmin()
    .from("variants")
    .select("id, revision")
    .eq("project_id", projectId)
    .eq("platform", platform)
    .maybeSingle();

  const patch = {
    source_revision: project.source_revision,
    content: result.content as Record<string, unknown>,
    revision: (existing?.revision ?? 0) + 1,
  };

  if (existing) {
    const { data, error: updErr } = await supabaseAdmin()
      .from("variants")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updErr) throw updErr;
    return { variant: data as VariantRow };
  }
  const { data, error: insErr } = await supabaseAdmin()
    .from("variants")
    .insert({ project_id: projectId, platform, ...patch })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return { variant: data as VariantRow };
}

export type EditResult =
  | { variant: VariantRow }
  | { error: "not_found" | "validation_failed"; issues?: SocialValidationIssue[] };

/** Manual edits are validated against the same platform rules. */
export async function updateVariant(
  userId: string,
  variantId: string,
  content: SocialContent[keyof SocialContent],
): Promise<EditResult> {
  const { data, error } = await supabaseAdmin()
    .from("variants")
    .select("*, project:projects(owner_id, source_revision)")
    .eq("id", variantId)
    .maybeSingle();
  if (error) throw error;
  const row = data as
    | (VariantRow & { project: { owner_id: string; source_revision: string } | null })
    | null;
  if (!row || !row.project || row.project.owner_id !== userId) return { error: "not_found" };

  const issues = validateSocialContent(row.platform, content);
  if (issues.length > 0) return { error: "validation_failed", issues };

  const { data: updated, error: updErr } = await supabaseAdmin()
    .from("variants")
    .update({
      content: content as Record<string, unknown>,
      revision: row.revision + 1,
      source_revision: row.project.source_revision,
    })
    .eq("id", variantId)
    .select("*")
    .single();
  if (updErr) throw updErr;
  return { variant: updated as VariantRow };
}
