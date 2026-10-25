// Shapes returned by the Express API (JSON projections of the Supabase rows).

export interface ProjectSummary {
  id: string;
  title: string;
  source_revision: string;
  is_public_sample: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiagramRow {
  id: string;
  project_id: string;
  mode: "architecture" | "flowchart" | "sequence";
  title: string | null;
  source_text: string;
  source_revision: string;
  mermaid: string | null;
  explanation: string | null;
  assumptions: string[];
  review_state: "draft" | "approved" | "rejected";
  render_state: "pending" | "rendered" | "failed";
  stale: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  project_id: string;
  operation: string;
  state: "queued" | "running" | "succeeded" | "failed";
  stage: string | null;
  attempts: number;
  result?: { mermaid?: string; title?: string; explanation?: string; assumptions?: string[] } | null;
  error?: { code: string; message: string } | null;
  model: string | null;
  created_at: string;
}

export interface AssetRow {
  id: string;
  variant_id: string | null;
  public_url: string;
  width: number;
  height: number;
  mime_type: string;
  slide_index: number | null;
  revision: number;
  created_at: string;
}

export interface VariantRow {
  id: string;
  project_id: string;
  platform: "instagram" | "facebook" | "x";
  source_revision: string;
  revision: number;
  // channel payload; shape depends on platform (see @flowtofeed/shared SocialContent)
  content: Record<string, unknown>;
  stale: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetailResponse {
  project: ProjectSummary & {
    source_markdown: string;
    source_url: string | null;
  };
  diagrams: DiagramRow[];
  variants: VariantRow[];
  jobs: JobRow[];
}

export interface JobResponse {
  job: JobRow;
}
