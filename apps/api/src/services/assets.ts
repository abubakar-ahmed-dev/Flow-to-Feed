import { createHash } from "node:crypto";
import { supabaseAdmin } from "../db.js";
import {
  ASSET_MIME_ALLOW,
  MAX_ASSET_BYTES,
  PLATFORM_LIMITS,
  type Platform,
} from "@flowtofeed/shared";
import { getProject, type ProjectRow } from "./projects.js";

export interface AssetRow {
  id: string;
  project_id: string;
  variant_id: string | null;
  diagram_id: string | null;
  revision: number;
  slide_index: number | null;
  storage_path: string;
  public_url: string | null;
  width: number;
  height: number;
  mime_type: string;
  hash: string;
  created_at: string;
}

export interface UploadMeta {
  projectId: string;
  variantId?: string;
  diagramId?: string;
  platform: Platform;
  slideIndex?: number;
  width: number;
  height: number;
  hash: string;
}

export type UploadResult =
  | { asset: AssetRow; publicUrl: string }
  | { error: "not_found" | "bad_request"; message?: string };

/**
 * Stores an exported card image: verifies integrity (sha256), platform
 * dimensions and MIME, uploads to the public bucket, records the asset row.
 * Identical bytes reuse the same storage path (idempotent by hash).
 */
export async function uploadAsset(
  userId: string,
  meta: UploadMeta,
  body: Buffer,
): Promise<UploadResult> {
  const project: ProjectRow | null = await getProject(meta.projectId);
  if (!project || project.owner_id !== userId) {
    return { error: "not_found", message: "Project not found" };
  }

  const limits = PLATFORM_LIMITS[meta.platform];
  const mime = `image/${limits.visual.format}`;
  const issues: string[] = [];
  if (!ASSET_MIME_ALLOW.includes(mime as (typeof ASSET_MIME_ALLOW)[number])) issues.push("mime not allowed");
  if (body.length === 0 || body.length > MAX_ASSET_BYTES) issues.push(`size ${body.length} outside allowed range`);
  if (meta.width !== limits.visual.width || meta.height !== limits.visual.height) {
    issues.push(`dimensions must be ${limits.visual.width}x${limits.visual.height}`);
  }
  const actualHash = createHash("sha256").update(body).digest("hex");
  if (actualHash !== meta.hash) issues.push("sha256 mismatch");

  let variant: { id: string; revision: number } | null = null;
  if (meta.variantId) {
    const { data, error } = await supabaseAdmin()
      .from("variants")
      .select("id, revision, platform")
      .eq("id", meta.variantId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.platform !== meta.platform) {
      return { error: "bad_request", message: "variant does not match platform" };
    }
    variant = data;
  }

  if (issues.length > 0) {
    return { error: "bad_request", message: issues.join("; ") };
  }

  const ext = limits.visual.format === "jpeg" ? "jpg" : "png";
  const storagePath = `${meta.projectId}/${meta.variantId ?? "diagram"}/${actualHash}.${ext}`;
  const bucket = process.env.SUPABASE_MEDIA_BUCKET ?? "shareable-assets";

  const { error: upErr } = await supabaseAdmin()
    .storage
    .from(bucket)
    .upload(storagePath, body, { contentType: mime, upsert: true });
  if (upErr && !/exists/i.test(upErr.message)) throw upErr;

  const { data: urlData } = supabaseAdmin()
    .storage
    .from(bucket)
    .getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) throw new Error("could not resolve public URL");

  const { data: asset, error: insErr } = await supabaseAdmin()
    .from("assets")
    .insert({
      project_id: meta.projectId,
      variant_id: meta.variantId ?? null,
      diagram_id: meta.diagramId ?? null,
      revision: variant?.revision ?? 1,
      slide_index: meta.slideIndex ?? null,
      storage_path: storagePath,
      public_url: publicUrl,
      width: meta.width,
      height: meta.height,
      mime_type: mime,
      hash: actualHash,
    })
    .select("*")
    .single();
  if (insErr) throw insErr;

  return { asset, publicUrl };
}

export async function listAssets(
  userId: string,
  variantId: string,
): Promise<AssetRow[] | null> {
  const { data: variant, error } = await supabaseAdmin()
    .from("variants")
    .select("id, project_id, project:projects(owner_id)")
    .eq("id", variantId)
    .maybeSingle();
  if (error) throw error;
  const row = variant as { id: string; project_id: string; project: { owner_id: string } | null } | null;
  if (!row || !row.project || row.project.owner_id !== userId) return null;

  const { data, error: listErr } = await supabaseAdmin()
    .from("assets")
    .select("*")
    .eq("variant_id", variantId)
    .order("slide_index", { ascending: true })
    .order("created_at", { ascending: false });
  if (listErr) throw listErr;
  return (data ?? []) as AssetRow[];
}
