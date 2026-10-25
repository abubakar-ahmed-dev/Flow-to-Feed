import { supabaseAdmin } from "../db.js";
import type { DiagramRow, ProjectRow } from "./projects.js";
import { getProject } from "./projects.js";

type SaveResult =
  | { diagram: DiagramRow }
  | { error: "not_found" | "invalid_job" };

/** Persists a diagram from a succeeded generation job (owner-approved save). */
export async function saveDiagramFromJob(
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
  if (
    !job ||
    job.project_id !== projectId ||
    job.state !== "succeeded" ||
    !job.result?.mermaid
  ) {
    return { error: "invalid_job" };
  }

  const input = (job.input ?? {}) as {
    mode?: string;
    passage?: string;
  };

  const { data: diagram, error: insertError } = await supabaseAdmin()
    .from("diagrams")
    .insert({
      project_id: projectId,
      mode: input.mode ?? "architecture",
      title: job.result.title ?? null,
      source_text: input.passage ?? "",
      source_revision: project.source_revision,
      mermaid: job.result.mermaid,
      explanation: job.result.explanation ?? null,
      assumptions: job.result.assumptions ?? [],
      icon_ids: [],
      review_state: "draft",
      render_state: "pending",
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return { diagram };
}

type PatchResult = { diagram: DiagramRow } | { error: "not_found" };

export async function updateDiagram(
  userId: string,
  diagramId: string,
  patch: {
    title?: string;
    mermaid?: string;
    render_state?: "pending" | "rendered" | "failed";
    review_state?: "draft" | "approved" | "rejected";
  },
): Promise<PatchResult> {
  const { data: row, error: fetchError } = await supabaseAdmin()
    .from("diagrams")
    .select("*, project:projects(owner_id)")
    .eq("id", diagramId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  const existing = row as (DiagramRow & { project: { owner_id: string } | null }) | null;
  const owner = existing?.project?.owner_id;
  if (!existing || owner !== userId) return { error: "not_found" };

  const { data: diagram, error: updateError } = await supabaseAdmin()
    .from("diagrams")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.mermaid !== undefined ? { mermaid: patch.mermaid } : {}),
      ...(patch.render_state !== undefined ? { render_state: patch.render_state } : {}),
      ...(patch.review_state !== undefined ? { review_state: patch.review_state } : {}),
    })
    .eq("id", diagramId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return { diagram };
}
