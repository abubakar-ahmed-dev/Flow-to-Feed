import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { SOURCE_CHAR_LIMIT, type DiagramMode } from "@flowtofeed/shared";
import type { DiagramRow, JobResponse, JobRow, ProjectDetailResponse } from "../types";
import DiagramReview from "../components/DiagramReview";
import VariantsSection from "../components/VariantsSection";

const MODES: DiagramMode[] = ["architecture", "flowchart", "sequence"];
const STEPS = ["Source", "Diagram", "Lessons"] as const;

export default function ProjectEditor() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);

  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  useEffect(() => { void load(); }, [load]);

  // keep polling while a generation job is in flight
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
    }, 2500);
    return () => clearTimeout(timer);
  }, [activeJob, load]);

  function captureSelection() {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    if (selectionEnd - selectionStart < 8) { setPassage(null); return; }
    setPassage({ text: markdown.slice(selectionStart, selectionEnd), start: selectionStart, end: selectionEnd });
  }

  async function saveSource(): Promise<boolean> {
    setSaving(true);
    setNotice(null);
    try {
      await api(`/projects/${id}`, {
        method: "PATCH",
        body: { title, source_markdown: markdown, ...(sourceUrl ? { source_url: sourceUrl } : {}) },
      });
      setNotice("Saved.");
      await load();
      return true;
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function importFile(file: File) {
    setMarkdown(await file.text());
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

  async function patchDiagram(d: DiagramRow, patch: { mermaid: string; render_state: "rendered" | "failed"; review_state?: "draft" | "approved" | "rejected" }) {
    await api(`/diagrams/${d.id}`, { method: "PATCH", body: patch });
    await load();
  }

  if (loadError) {
    return (
      <main className="page page-narrow" style={{ marginTop: "4rem" }}>
        <p className="status-danger">{loadError}</p>
        <Link to="/">← All projects</Link>
      </main>
    );
  }
  if (!detail) {
    return <main className="page page-narrow" style={{ marginTop: "4rem", color: "var(--text-muted)" }}>Loading…</main>;
  }

  const overLimit = markdown.length > SOURCE_CHAR_LIMIT;
  const stepDone: [boolean, boolean, boolean] = [
    !dirty && markdown.trim().length > 0,
    detail.diagrams.some((d) => d.review_state === "approved") || detail.diagrams.length > 0,
    detail.variants.length > 0,
  ];

  return (
    <main className="page">
      <header className="topbar">
        <Link to="/" className="small" style={{ color: "var(--text-muted)" }}>← All projects</Link>
        <div className="wordmark small">Flow<span>ToFeed</span></div>
      </header>

      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
        style={{ border: "none", background: "transparent", fontSize: "1.9rem", fontWeight: 800, padding: 0, letterSpacing: "-0.01em" }}
        placeholder="Untitled explanation"
      />
      <div className="row" style={{ marginTop: "0.4rem", marginBottom: "0.5rem" }}>
        <input
          value={sourceUrl}
          onChange={(e) => { setSourceUrl(e.target.value); setDirty(true); }}
          style={{ border: "none", background: "transparent", padding: 0, color: "var(--text-muted)", fontSize: "0.95rem" }}
          placeholder="source URL (optional)"
        />
      </div>

      {/* steps */}
      <nav className="steps">
        {STEPS.map((label, i) => {
          const reachable = i === 0 || stepDone.slice(0, i).every(Boolean) || i <= step;
          return (
            <button
              key={label}
              type="button"
              className={`step ${step === i ? "active" : ""} ${stepDone[i] && step !== i ? "done" : ""}`}
              onClick={() => reachable && setStep(i as 0 | 1 | 2)}
              disabled={!reachable}
            >
              <span className="num">{stepDone[i] && step !== i ? "✓" : i + 1}</span> {label}
            </button>
          );
        })}
      </nav>

      {/* ---------------- STEP 1 — SOURCE ---------------- */}
      {step === 0 && (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0 }}>Paste your explanation</h2>
            <span className="small muted">
              {markdown.length.toLocaleString()} / {SOURCE_CHAR_LIMIT.toLocaleString()}
              {dirty && " · unsaved"}
            </span>
          </div>

          <div className="grid-2">
            <section>
              <textarea
                ref={textareaRef}
                value={markdown}
                onChange={(e) => { setMarkdown(e.target.value); setDirty(true); }}
                onSelect={captureSelection}
                rows={18}
                spellCheck={false}
                placeholder="Paste or write your technical explanation in Markdown…"
              />
              <div className="row" style={{ marginTop: "0.75rem" }}>
                <label className="small">
                  Import .md
                  <input
                    type="file"
                    accept=".md,text/markdown,text/plain"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }}
                  />
                </label>
                <span className="grow" />
                <button className="ghost small" onClick={() => setStep(1)}>Preview</button>
              </div>
            </section>

            <section>
              <h3 className="small muted" style={{ marginTop: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Preview</h3>
              <div className="card" style={{ maxHeight: 480, overflowY: "auto" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
            </section>
          </div>

          <div className="step-actions">
            <span className="muted small">{passage ? "Passage selected — pick it again after edits." : "Tip: select a passage in step 2 to generate a diagram."}</span>
            <button onClick={async () => { if (await saveSource()) setStep(1); }} disabled={saving || !dirty || overLimit}>
              {saving ? "Saving…" : "Save & continue →"}
            </button>
          </div>
        </>
      )}

      {/* ---------------- STEP 2 — DIAGRAM ---------------- */}
      {step === 1 && (
        <>
          <h2 style={{ marginBottom: "0.5rem" }}>Generate a diagram</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            Select a passage from your saved source, choose a mode, and review the result before accepting it.
          </p>

          <div className="card">
            <h3 className="small muted" style={{ marginTop: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Selected passage</h3>
            {passage ? (
              <p style={{ margin: "0 0 0.75rem" }}>
                “{passage.text.slice(0, 140)}{passage.text.length > 140 ? "…" : ""}”
                <span className="chip" style={{ marginLeft: "0.75rem" }}>{passage.text.length.toLocaleString()} chars</span>
              </p>
            ) : (
              <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                Go back to step 1 and select a passage in the source (8+ characters). Selected text carries over automatically.
              </p>
            )}
            <div className="row">
              <select value={mode} onChange={(e) => setMode(e.target.value as DiagramMode)} style={{ width: "auto" }}>
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="grow"
                placeholder="Optional instruction — e.g. 'show the read path only'"
              />
              <button onClick={generate} disabled={!passage || generating || overLimit}>
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>

            {activeJob && (
              <div className="panel" style={{ marginTop: "1rem" }}>
                {activeJob.state === "queued" || activeJob.state === "running" ? (
                  <span className="status-warn">Working — stage: {activeJob.stage ?? "…"} (attempt {activeJob.attempts})</span>
                ) : activeJob.state === "succeeded" ? (
                  <div className="row">
                    <span className="status-ok">Diagram ready{activeJob.model ? ` · ${activeJob.model}` : ""}</span>
                    <button onClick={saveDiagramFromJob}>Add to project</button>
                  </div>
                ) : (
                  <span className="status-danger">Failed: {activeJob.error?.message ?? "unknown error"}</span>
                )}
              </div>
            )}
          </div>

          <h3 style={{ margin: "2.5rem 0 0.75rem" }}>Your diagrams <span className="chip">{detail.diagrams.length}</span></h3>
          {detail.diagrams.map((d) => (
            <DiagramReview key={d.id} diagram={d} onSave={(patch) => patchDiagram(d, patch)} />
          ))}
          {detail.diagrams.length === 0 && <p className="muted">Nothing here yet.</p>}

          <div className="step-actions">
            <button className="ghost" onClick={() => setStep(0)}>← Source</button>
            <button className="ghost" onClick={() => setStep(2)}>Channel lessons →</button>
          </div>
        </>
      )}

      {/* ---------------- STEP 3 — LESSONS ---------------- */}
      {step === 2 && (
        <>
          <h2 style={{ marginBottom: "0.5rem" }}>Channel lessons</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            The same passage, reshaped for each platform — edit freely, then export postable images.
          </p>
          <VariantsSection
            projectId={detail.project.id}
            passage={passage?.text || markdown.slice(0, 4000)}
            variants={detail.variants}
            diagrams={detail.diagrams}
            onChanged={() => void load()}
          />
          <div className="step-actions">
            <button className="ghost" onClick={() => setStep(1)}>← Diagram</button>
            <span />
          </div>
        </>
      )}

      {notice && (
        <p className="small muted" style={{ marginTop: "1rem" }}>{notice}</p>
      )}
    </main>
  );
}
