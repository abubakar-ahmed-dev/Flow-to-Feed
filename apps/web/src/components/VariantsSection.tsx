import { useEffect, useState } from "react";
import mermaid from "mermaid";
import {
  validateSocialContent,
  weightedXLength,
  X_WEIGHTED_LIMIT,
  PLATFORM_LIMITS,
  type SocialContent,
  type Platform,
} from "@flowtofeed/shared";
import type { AssetRow, DiagramRow, VariantRow } from "../types";
import { api, ApiError } from "../lib/api";
import { supabase } from "../lib/supabase";
import { buildCards } from "../render/cards";
import { exportVariantImages } from "../render/export";

interface Props {
  projectId: string;
  passage: string;
  variants: VariantRow[];
  diagrams: DiagramRow[];
  onChanged: () => void;
}

type JobLite = { id: string; state: string; error?: { message?: string } | null };

const PLATFORMS: { key: Platform; label: string; blurb: string }[] = [
  { key: "instagram", label: "Instagram", blurb: "caption + 4–6 slide carousel" },
  { key: "facebook", label: "Facebook", blurb: "short-paragraph explainer" },
  { key: "x", label: "X", blurb: "3–5 post thread" },
];

/** Channel lessons: adapt (job), edit, export postable images to public URLs. */
export default function VariantsSection({ projectId, passage, variants, diagrams, onChanged }: Props) {
  return (
    <section style={{ marginTop: "2rem" }}>
      <h3>Channel lessons</h3>
      <div style={{ display: "grid", gap: "1rem" }}>
        {PLATFORMS.map((p) => (
          <PlatformCard
            key={p.key}
            platform={p.key}
            label={p.label}
            blurb={p.blurb}
            projectId={projectId}
            passage={passage}
            variant={variants.find((v) => v.platform === p.key)}
            diagrams={diagrams}
            onChanged={onChanged}
          />
        ))}
      </div>
    </section>
  );
}

function PlatformCard({
  platform, label, blurb, projectId, passage, variant, diagrams, onChanged,
}: {
  platform: Platform; label: string; blurb: string; projectId: string; passage: string;
  variant?: VariantRow; diagrams: DiagramRow[]; onChanged: () => void;
}) {
  const [jobState, setJobState] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SocialContent | null>(
    (variant?.content as SocialContent | undefined) ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetRow[] | null>(null);
  const [imgState, setImgState] = useState<string | null>(null);

  const limits = PLATFORM_LIMITS[platform];
  const current = (draft ?? (variant?.content as SocialContent | undefined)) as SocialContent | undefined;
  const section = current?.[platform] as SocialContent[typeof platform] | undefined;
  const issues = section ? validateSocialContent(platform, section) : [];
  const imagesStale = !!variant && (!assets || assets.length === 0 || assets.some((a) => a.revision < variant.revision));

  useEffect(() => {
    if (!variant) return;
    api<{ assets: AssetRow[] }>(`/assets?variantId=${variant.id}`)
      .then((r) => setAssets(r.assets))
      .catch(() => setAssets(null));
  }, [variant?.id]);

  async function generate() {
    setJobState("queued");
    setJobError(null);
    setNotice(null);
    try {
      const { job } = await api<{ job: JobLite }>(`/projects/${projectId}/social`, {
        method: "POST",
        body: { platform, passage },
      });
      let current = job;
      const deadline = Date.now() + 900_000;
      while (current && (current.state === "queued" || current.state === "running") && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        current = (await api<{ job: JobLite }>(`/jobs/${current.id}`)).job;
      }
      if (!current || current.state !== "succeeded") {
        throw new ApiError(500, "adapt_failed", current?.error?.message ?? "adaptation job did not succeed");
      }
      const { variant: saved } = await api<{ variant: VariantRow }>("/variants/save", {
        method: "POST",
        body: { projectId, jobId: current.id },
      });
      setDraft(saved.content as SocialContent);
      setJobState(null);
      onChanged();
    } catch (e) {
      setJobState(null);
      setJobError(e instanceof ApiError ? e.message : "Generation failed");
    }
  }

  async function save() {
    if (!variant || !draft) return;
    setSaving(true);
    setNotice(null);
    try {
      const { variant: updated } = await api<{ variant: VariantRow }>(`/variants/${variant.id}`, {
        method: "PATCH",
        body: { content: draft[platform] },
      });
      setDraft({ ...draft, [platform]: updated.content } as SocialContent);
      setNotice("Saved.");
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.code === "validation_failed") {
        setNotice("Rejected by platform rules: " + (e.details as { message: string }[] | undefined)?.map((i) => i.message).join("; "));
      } else {
        setNotice(e instanceof Error ? e.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  async function approvedDiagramSvg(): Promise<string | null> {
    const diagram = diagrams.find((d) => d.review_state === "approved" && d.mermaid);
    if (!diagram) return null;
    try {
      const { svg } = await mermaid.render(`card-${++mermaidSeq}`, diagram.mermaid!);
      return svg;
    } catch {
      return null;
    }
  }

  async function generateImages() {
    if (!variant || !section) return;
    setImgState("0/" + imageCount());
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const diagramSvg = await approvedDiagramSvg();
      const cards = buildCards(platform, section as never, diagramSvg);
      await exportVariantImages({
        projectId, platform, variantId: variant.id, cards, token,
        onProgress: (done, total) => setImgState(`${done}/${total}`),
      });
      const r = await api<{ assets: AssetRow[] }>(`/assets?variantId=${variant.id}`);
      setAssets(r.assets);
      setImgState(null);
    } catch (e) {
      setImgState(null);
      setNotice(e instanceof Error ? e.message : "Image export failed");
    }
  }

  function imageCount(): number {
    if (!section) return 0;
    if (platform === "instagram") return (section as NonNullable<SocialContent["instagram"]>).slides.length;
    return 1;
  }

  const dirty = JSON.stringify(draft ?? null) !== JSON.stringify((variant?.content as SocialContent | undefined) ?? null);

  return (
    <div className="card">
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong>{label}</strong>
        <span style={badge}>{blurb}</span>
        {variant?.stale && <span style={{ ...badge, color: "var(--danger)" }}>stale</span>}
        <span style={{ flex: 1 }} />
        <button onClick={generate} disabled={jobState !== null}>
          {jobState ? "Generating…" : variant ? "Regenerate" : "Generate"}
        </button>
        {variant && draft && (
          <button onClick={save} disabled={saving || !dirty || issues.length > 0}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {jobState && <p style={{ color: "var(--warn)", margin: "0.5rem 0 0" }}>Adapting for {label}…</p>}
      {jobError && <p style={{ color: "var(--danger)", margin: "0.5rem 0 0" }}>{jobError}</p>}
      {notice && <p style={{ color: "var(--text-muted)", margin: "0.5rem 0 0" }}>{notice}</p>}

      {!variant && !jobState && !jobError && (
        <p style={{ color: "var(--text-muted)", margin: "0.5rem 0 0" }}>Not generated yet.</p>
      )}

      {draft && platform === "instagram" && section && (
        <InstagramEditor
          content={section as NonNullable<SocialContent["instagram"]>}
          onChange={(c) => setDraft({ ...draft, instagram: c })}
        />
      )}
      {draft && platform === "facebook" && section && (
        <FacebookEditor
          content={section as NonNullable<SocialContent["facebook"]>}
          onChange={(c) => setDraft({ ...draft, facebook: c })}
        />
      )}
      {draft && platform === "x" && section && (
        <XEditor content={section as NonNullable<SocialContent["x"]>} onChange={(c) => setDraft({ ...draft, x: c })} />
      )}

      {issues.length > 0 && (
        <ul style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
          {issues.map((i, k) => (
            <li key={k}>{i.message}</li>
          ))}
        </ul>
      )}

      {variant && (
        <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.75rem", paddingTop: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              onClick={generateImages}
              disabled={issues.length > 0 || imgState !== null}
              title={`Exports ${limits.visual.perSlide ? "one image per slide" : "one image"} at ${limits.visual.width}×${limits.visual.height}`}
            >
              {imgState ? `Exporting ${imgState}…` : "Generate images"}
            </button>
            {imagesStale && assets && assets.length > 0 && (
              <span style={{ color: "var(--warn)", fontSize: "0.85rem" }}>images out of date — regenerate</span>
            )}
          </div>
          {assets && assets.length > 0 && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
              {assets.map((a) => (
                <a key={a.id} href={a.public_url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                  <img
                    src={a.public_url}
                    alt={`slide ${a.slide_index ?? 0}`}
                    style={{ height: 120, borderRadius: 6, border: "1px solid var(--border)" }}
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

let mermaidSeq = 0;

function InstagramEditor({ content, onChange }: { content: NonNullable<SocialContent["instagram"]>; onChange: (c: NonNullable<SocialContent["instagram"]>) => void }) {
  return (
    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
      <input value={content.title} onChange={(e) => onChange({ ...content, title: e.target.value })} style={field} placeholder="Carousel title" />
      <textarea value={content.caption} onChange={(e) => onChange({ ...content, caption: e.target.value })} rows={2} style={field} placeholder="Caption" />
      {content.slides.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.5rem" }}>
          <input
            value={s.heading}
            onChange={(e) => onChange({ ...content, slides: content.slides.map((x, k) => (k === i ? { ...x, heading: e.target.value } : x)) })}
            style={field}
            placeholder={`Slide ${i + 1} heading`}
          />
          <input
            value={s.body}
            onChange={(e) => onChange({ ...content, slides: content.slides.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)) })}
            style={field}
            placeholder="body"
          />
        </div>
      ))}
    </div>
  );
}

function FacebookEditor({ content, onChange }: { content: NonNullable<SocialContent["facebook"]>; onChange: (c: NonNullable<SocialContent["facebook"]>) => void }) {
  return (
    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
      <input value={content.title} onChange={(e) => onChange({ ...content, title: e.target.value })} style={field} placeholder="Post title" />
      {content.paragraphs.map((p, i) => (
        <textarea
          key={i}
          value={p}
          rows={2}
          onChange={(e) => onChange({ ...content, paragraphs: content.paragraphs.map((x, k) => (k === i ? e.target.value : x)) })}
          style={field}
          placeholder={`Paragraph ${i + 1}`}
        />
      ))}
    </div>
  );
}

function XEditor({ content, onChange }: { content: NonNullable<SocialContent["x"]>; onChange: (c: NonNullable<SocialContent["x"]>) => void }) {
  return (
    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
      {content.posts.map((p, i) => {
        const len = weightedXLength(p);
        const over = len > X_WEIGHTED_LIMIT;
        return (
          <div key={i}>
            <textarea
              value={p}
              rows={2}
              onChange={(e) => onChange({ ...content, posts: content.posts.map((x, k) => (k === i ? e.target.value : x)) })}
              style={{ ...field, borderColor: over ? "var(--danger)" : "var(--border)" }}
              placeholder={`Post ${i + 1}`}
            />
            <div style={{ fontSize: "0.8rem", color: over ? "var(--danger)" : "var(--text-muted)", textAlign: "right" }}>
              {len}/{X_WEIGHTED_LIMIT} weighted
            </div>
          </div>
        );
      })}
    </div>
  );
}

const badge: React.CSSProperties = {
  fontSize: "0.75rem",
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "0.05rem 0.5rem",
  color: "var(--text-muted)",
};

const field: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.5rem 0.75rem",
};
