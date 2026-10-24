import { supabaseAdmin } from "../db.js";
import { sourceRevision } from "./revision.js";
import type { CreateProjectInput, UpdateProjectInput } from "@flowtofeed/shared";

export interface ProjectRow {
  id: string;
  owner_id: string;
  title: string;
  source_markdown: string;
  source_url: string | null;
  source_revision: string;
  is_public_sample: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiagramRow {
  id: string;
  project_id: string;
  mode: string;
  title: string | null;
  source_text: string;
  source_revision: string;
  mermaid: string | null;
  explanation: string | null;
  assumptions: unknown;
  icon_ids: unknown;
  review_state: string;
  render_state: string;
  created_at: string;
  updated_at: string;
}

export interface VariantRow {
  id: string;
  project_id: string;
  platform: string;
  source_revision: string;
  revision: number;
  diagram_ids: unknown;
  content: unknown;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  project_id: string;
  operation: string;
  state: string;
  stage: string | null;
  attempts: number;
  result: unknown;
  error: unknown;
  model: string | null;
  prompt_version: string | null;
  created_at: string;
  updated_at: string;
}

/** Flags derived artifacts whose source_revision no longer matches the project. */
export function withStale<T extends { source_revision: string }>(
  projectRevision: string,
  rows: T[],
): (T & { stale: boolean })[] {
  return rows.map((row) => ({ ...row, stale: row.source_revision !== projectRevision }));
}

export async function listProjects(userId: string): Promise<ProjectRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectRow> {
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .insert({
      owner_id: userId,
      title: input.title,
      source_markdown: input.source_markdown,
      source_url: input.source_url ?? null,
      source_revision: sourceRevision(input.source_markdown),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getProject(projectId: string): Promise<ProjectRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProject(
  project: ProjectRow,
  input: UpdateProjectInput,
): Promise<ProjectRow> {
  const nextSource = input.source_markdown ?? project.source_markdown;
  const patch: Partial<ProjectRow> = {
    title: input.title ?? project.title,
    source_markdown: nextSource,
    source_url: input.source_url !== undefined ? input.source_url : project.source_url,
    // recompute on any source change so derived artifacts can detect staleness
    source_revision: sourceRevision(nextSource),
  };
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .update(patch)
    .eq("id", project.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export interface ProjectDetail {
  project: ProjectRow;
  diagrams: ReturnType<typeof withStale<DiagramRow>>;
  variants: ReturnType<typeof withStale<VariantRow>>;
  jobs: JobRow[];
}

export async function getProjectDetail(
  project: ProjectRow,
): Promise<ProjectDetail> {
  const [diagramsRes, variantsRes, jobsRes] = await Promise.all([
    supabaseAdmin()
      .from("diagrams")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    supabaseAdmin()
      .from("variants")
      .select("*")
      .eq("project_id", project.id)
      .order("platform"),
    supabaseAdmin()
      .from("jobs")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (diagramsRes.error) throw diagramsRes.error;
  if (variantsRes.error) throw variantsRes.error;
  if (jobsRes.error) throw jobsRes.error;

  return {
    project,
    diagrams: withStale(project.source_revision, diagramsRes.data ?? []),
    variants: withStale(project.source_revision, variantsRes.data ?? []),
    jobs: jobsRes.data ?? [],
  };
}
