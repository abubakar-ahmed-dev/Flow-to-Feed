import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { SOURCE_CHAR_LIMIT } from "@flowtofeed/shared";
import type { DiagramMode } from "@flowtofeed/shared";
import type { DiagramRow, JobResponse, JobRow, ProjectDetailResponse } from "../types";
import DiagramReview from "../components/DiagramReview";
import VariantsSection from "../components/VariantsSection";

const MODES: DiagramMode[] = ["architecture", "flowchart", "sequence"];

export default function ProjectEditor() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // source form state
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // passage selection + generation
  const [passage, setPassage] = useState<{ text: string; start: number; end: number } | null>(null);
  const [mode, setMode] = useState<DiagramMode>("architecture");
  const [instruction, setInstruction] = useState("");
  const [activeJob, setActiveJob] = useState<JobRow | null>(null);
  const [generating, setGenerating] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<ProjectDetailResponse>(`/projects/${id}`);
      setDetail(d);
      setTitle(d.project.title);
      setSourceUrl(d.project.source_url ?? "");
      setMarkdown(d.project.source_markdown);
      setDirty(false);
      const pending = d.jobs.find((j) => j.state === "queued" || j.state === "running");
      if (pending) setActiveJob(pending);
      return d;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Load failed");
      return null;
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // poll the active generation job until it reaches a terminal state
  useEffect(() => {
    if (!activeJob || (activeJob.state !== "queued" && activeJob.state !== "running")) return;
    const timer = setTimeout(async () => {
      try {
        const { job } = await api<JobResponse>(`/jobs/${activeJob.id}`);
        setActiveJob(job);
        if (job.state === "succeeded" || job.state === "failed") {
          setGenerating(false);
          void load();
        }
      } catch {
        setActiveJob(null);
        setGenerating(false);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [activeJob, load]);

  function captureSelection() {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    if (selectionEnd - selectionStart < 8) {
      setPassage(null);
      return;
    }
    setPassage({ text: markdown.slice(selectionStart, selectionEnd), start: selectionStart, end: selectionEnd });
  }

  async function saveSource() {
    setSaving(true);
    setNotice(null);
    try {
      await api(`/projects/${id}`, {
        method: "PATCH",
        body: { title, source_markdown: markdown, ...(sourceUrl ? { source_url: sourceUrl } : { source_url: undefined }) },
      });
      setNotice("Saved.");
      await load();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function importFile(file: File) {
    const text = await file.text();
    setMarkdown(text);
    setDirty(true);
  }

  async function generate() {
    if (!passage) return;
    setGenerating(true);
    setNotice(null);
    try {
      const { job } = await api<JobResponse>(`/projects/${id}/diagrams`, {
        method: "POST",
        body: { mode, passage: passage.text, instruction: instruction || undefined },
      });
      setActiveJob(job);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Generation failed to start");
      setGenerating(false);
    }
  }

  async function saveDiagramFromJob() {
    if (!activeJob || activeJob.state !== "succeeded") return;
    try {
      await api("/diagrams", { method: "POST", body: { projectId: id, jobId: activeJob.id } });
      setActiveJob(null);
      await load();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Saving diagram failed");
    }
  }

  async function patchDiagram(diagram: DiagramRow, patch: { mermaid: string; render_state: "rendered" | "failed"; review_state?: "draft" | "approved" | "rejected" }) {
    await api(`/diagrams/${diagram.id}`, { method: "PATCH", body: patch });
    await load();
  }

  if (loadError) {
    return (
      <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem" }}>
        <p style={{ color: "var(--danger)" }}>{loadError}</p>
        <Link to="/">← Back</Link>
      </main>
    );
  }
  if (!detail) {
    return <main style={{ maxWidth: 720, margin: "3rem auto", color: "var(--text-muted)" }}>Loading…</main>;
  }

  const overLimit = markdown.length > SOURCE_CHAR_LIMIT;

  return (
    <main style={{ maxWidth: 1100, margin: "2rem auto", padding: "0 1rem" }}>
      <Link to="/">← All projects</Link>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
        <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} style={{ ...field, flex: 2, fontWeight: 600 }} placeholder="Title" />
        <input value={sourceUrl} onChange={(e) => { setSourceUrl(e.target.value); setDirty(true); }} style={{ ...field, flex: 3 }} placeholder="Source/blog URL (optional)" />
        <button onClick={saveSource} disabled={saving || !dirty || overLimit}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {notice && <p style={{ color: "var(--text-muted)" }}>{notice}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 style={{ margin: "0 0 0.5rem" }}>Source</h3>
            <span style={{ color: overLimit ? "var(--danger)" : "var(--text-muted)", fontSize: "0.85rem" }}>
              {markdown.length.toLocaleString()} / {SOURCE_CHAR_LIMIT.toLocaleString()}
              {dirty && " · unsaved"}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(e) => { setMarkdown(e.target.value); setDirty(true); }}
            onSelect={captureSelection}
            rows={20}
            spellCheck={false}
            style={{ ...field, fontFamily: "Consolas, monospace", fontSize: "0.9rem", width: "100%" }}
          />
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.5rem" }}>
            <label style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Import .md
              <input type="file" accept=".md,text/markdown,text/plain" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
            </label>
            <span style={{ flex: 1 }} />
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Preview renders on the right</span>
          </div>
        </section>

        <section>
          <h3 style={{ margin: "0 0 0.5rem" }}>Preview</h3>
          <div className="card" style={{ minHeight: 300, maxHeight: 520, overflowY: "auto" }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h3 style={{ margin: "0 0 0.5rem" }}>Generate diagram</h3>
        {passage ? (
          <p style={{ color: "var(--text-muted)", margin: "0 0 0.5rem" }}>
            Passage selected ({passage.text.length.toLocaleString()} chars): “{passage.text.slice(0, 80)}
            {passage.text.length > 80 ? "…" : ""}”
          </p>
        ) : (
          <p style={{ color: "var(--text-muted)", margin: "0 0 0.5rem" }}>
            Select a passage in the source (8+ characters) to enable generation.
          </p>
        )}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <select value={mode} onChange={(e) => setMode(e.target.value as DiagramMode)} style={field}>
            {MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            style={{ ...field, flex: 2 }}
            placeholder="Optional instruction, e.g. 'show the read path only'"
          />
          <button onClick={generate} disabled={!passage || generating || overLimit}>
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>

        {activeJob && (
          <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            {activeJob.state === "queued" || activeJob.state === "running" ? (
              <span style={{ color: "var(--warn)" }}>
                Job {activeJob.state} — stage: {activeJob.stage ?? "…"} (attempt {activeJob.attempts})
              </span>
            ) : activeJob.state === "succeeded" ? (
              <>
                <span style={{ color: "var(--ok)" }}>
                  Generation succeeded{activeJob.model ? ` (${activeJob.model})` : ""}
                </span>
                <button onClick={saveDiagramFromJob} style={{ marginLeft: "0.75rem" }}>
                  Save diagram to project
                </button>
              </>
            ) : (
              <span style={{ color: "var(--danger)" }}>
                Job failed: {activeJob.error?.message ?? "unknown error"}
              </span>
            )}
          </div>
        )}
      </section>

      <h3 style={{ marginTop: "2rem" }}>Diagrams ({detail.diagrams.length})</h3>
      {detail.diagrams.map((d) => (
        <DiagramReview key={d.id} diagram={d} onSave={(patch) => patchDiagram(d, patch)} />
      ))}
      {detail.diagrams.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>No diagrams yet.</p>
      )}

      <VariantsSection
        projectId={detail.project.id}
        passage={passage?.text || markdown.slice(0, 4000)}
        variants={detail.variants}
        diagrams={detail.diagrams}
        onChanged={() => void load()}
      />
    </main>
  );
}

const field: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.5rem 0.75rem",
};
