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

export async function getDiagramForUser(
  userId: string,
  diagramId: string,
): Promise<(DiagramRow & { project: ProjectRow }) | null> {
  const { data, error } = await supabaseAdmin()
    .from("diagrams")
    .select("*, project:projects(*)")
    .eq("id", diagramId)
    .maybeSingle();
  if (error) throw error;
  const row = data as (DiagramRow & { project: ProjectRow | null }) | null;
  if (!row || !row.project || row.project.owner_id !== userId) return null;
  return { ...row, project: row.project };
}

export type RepairResult =
  | { job: Record<string, unknown> }
  | { error: "not_found" };

/** Starts a bounded repair job for a diagram that failed to render. */
export async function requestRepair(
  userId: string,
  diagramId: string,
  renderError: string,
  trigger: (t: {
    jobId: string;
    operation: "diagram_repair";
    mode: string;
    passage: string;
    priorMermaid: string;
    renderError: string;
  }) => Promise<void>,
): Promise<RepairResult> {
  const diagram = await getDiagramForUser(userId, diagramId);
  if (!diagram) return { error: "not_found" };

  const { data: job, error: jobError } = await supabaseAdmin()
    .from("jobs")
    .insert({
      project_id: diagram.project_id,
      operation: "diagram_repair",
      input: {
        mode: diagram.mode,
        passage: diagram.source_text,
        diagramId,
        priorMermaid: diagram.mermaid ?? "",
        renderError,
      },
    })
    .select("*")
    .single();
  if (jobError) throw jobError;

  try {
    await trigger({
      jobId: job.id,
      operation: "diagram_repair",
      mode: diagram.mode,
      passage: diagram.source_text,
      priorMermaid: diagram.mermaid ?? "",
      renderError,
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

export type ApplyRepairResult =
  | { diagram: DiagramRow }
  | { error: "not_found" | "invalid_job" };

/** Applies a succeeded repair job's output back onto the diagram. */
export async function applyRepair(
  userId: string,
  diagramId: string,
  jobId: string,
): Promise<ApplyRepairResult> {
  const diagram = await getDiagramForUser(userId, diagramId);
  if (!diagram) return { error: "not_found" };

  const { data: job, error: jobError } = await supabaseAdmin()
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  const input = (job?.input ?? {}) as { diagramId?: string };
  if (
    !job ||
    job.project_id !== diagram.project_id ||
    job.operation !== "diagram_repair" ||
    job.state !== "succeeded" ||
    !job.result?.mermaid ||
    input.diagramId !== diagramId
  ) {
    return { error: "invalid_job" };
  }

  const { data: updated, error: updateError } = await supabaseAdmin()
    .from("diagrams")
    .update({
      mermaid: job.result.mermaid,
      title: job.result.title ?? diagram.title,
      explanation: job.result.explanation ?? diagram.explanation,
      assumptions: job.result.assumptions ?? diagram.assumptions,
      // repaired against the CURRENT project source revision
      source_revision: diagram.project.source_revision,
      render_state: "pending",
      review_state: "draft",
    })
    .eq("id", diagramId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return { diagram: updated };
}

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
