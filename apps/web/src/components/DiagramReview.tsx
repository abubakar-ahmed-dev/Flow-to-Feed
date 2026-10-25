import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { api, ApiError } from "../lib/api";
import type { DiagramRow, JobResponse } from "../types";

mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "dark" });

interface Props {
  diagram: DiagramRow;
  onSave: (patch: {
    mermaid: string;
    render_state: "rendered" | "failed";
    review_state?: "draft" | "approved" | "rejected";
  }) => Promise<void>;
}

const MAX_COMPONENTS = 12;

function countComponents(mermaid: string): number {
  return (mermaid.match(/^(?:\s{4})?(?:service |participant )/gm) || []).length
    || (mermaid.match(/^\s{4}\w+\[[^\]]+\]/gm) || []).length;
}

let renderSeq = 0;

/** Renders Mermaid client-side; failed render keeps the draft and offers one bounded AI repair. */
export default function DiagramReview({ diagram, onSave }: Props) {
  const [code, setCode] = useState(diagram.mermaid ?? "");
  const [editing, setEditing] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [repairState, setRepairState] = useState<"idle" | "working" | "applied" | "failed">("idle");
  const [repairNote, setRepairNote] = useState<string | null>(null);
  const svgWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCode(diagram.mermaid ?? "");
  }, [diagram.id, diagram.mermaid]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!code.trim()) {
        setSvg(null);
        setRenderError("No Mermaid source yet");
        return;
      }
      try {
        const { svg } = await mermaid.render(`mmd-${++renderSeq}`, code);
        if (!cancelled) {
          setSvg(svg);
          setRenderError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSvg(null);
          setRenderError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const components = countComponents(code);

  async function save(reviewState?: "approved" | "rejected") {
    setSaving(true);
    try {
      await onSave({
        mermaid: code,
        render_state: renderError ? "failed" : "rendered",
        ...(reviewState ? { review_state: reviewState } : {}),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function repair() {
    setRepairState("working");
    setRepairNote(null);
    try {
      const { job } = await api<JobResponse>(`/diagrams/${diagram.id}/repair`, {
        method: "POST",
        body: { renderError: (renderError || "manual repair requested").slice(0, 2000) },
      });
      let current = job;
      const deadline = Date.now() + 300_000;
      while (current && (current.state === "queued" || current.state === "running") && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        current = (await api<JobResponse>(`/jobs/${current.id}`)).job;
      }
      if (!current || current.state !== "succeeded") {
        throw new ApiError(500, "repair_failed", current?.error?.message ?? "Repair job did not succeed");
      }
      await api(`/diagrams/${diagram.id}/apply-repair`, { method: "POST", body: { jobId: current.id } });
      setRepairState("applied");
      setRepairNote("Repair applied — review the updated source below.");
    } catch (e) {
      setRepairState("failed");
      setRepairNote(e instanceof ApiError ? e.message : "Repair failed");
    }
  }

  function download(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSvg() {
    const el = svgWrap.current?.querySelector("svg");
    if (!el) return;
    download(`${diagram.mode}-diagram.svg`, new Blob([el.outerHTML], { type: "image/svg+xml" }));
  }

  function exportPng() {
    const el = svgWrap.current?.querySelector("svg");
    if (!el) return;
    const xml = new XMLSerializer().serializeToString(el);
    const img = new Image();
    const scale = 2;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => b && download(`${diagram.mode}-diagram.png`, b), "image/png");
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  }

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong>{diagram.title ?? diagram.mode}</strong>
        <span style={badge}>{diagram.mode}</span>
        <span style={{ ...badge, color: diagram.review_state === "approved" ? "var(--ok)" : "var(--warn)" }}>
          {diagram.review_state}
        </span>
        {diagram.stale && (
          <span style={{ ...badge, color: "var(--danger)" }} title="Source changed since this diagram was generated">
            stale
          </span>
        )}
        {components > 10 && (
          <span style={{ ...badge, color: "var(--warn)" }} title="Dense diagram — consider splitting the passage">
            {components} components
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={() => setEditing(!editing)} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {editing ? "Preview" : "Edit source"}
        </button>
        {svg && (
          <>
            <button onClick={exportSvg} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>SVG</button>
            <button onClick={exportPng} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>PNG</button>
          </>
        )}
        <button
          onClick={repair}
          disabled={repairState === "working"}
          title="One bounded AI repair using the render error"
        >
          {repairState === "working" ? "Repairing…" : "Repair"}
        </button>
        {diagram.review_state !== "approved" && (
          <button onClick={() => save("approved")} disabled={saving || !!renderError}>
            Approve
          </button>
        )}
      </div>

      {repairNote && (
        <p style={{ color: repairState === "applied" ? "var(--ok)" : "var(--danger)", margin: "0.5rem 0 0" }}>
          {repairNote}
        </p>
      )}

      <div style={{ marginTop: "0.75rem" }}>
        {editing ? (
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={12}
            spellCheck={false}
            style={codeStyle}
          />
        ) : svg ? (
          <div
            ref={svgWrap}
            style={{ background: "#ffffff", borderRadius: 8, padding: 8, overflowX: "auto" }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p style={{ color: "var(--danger)", whiteSpace: "pre-wrap" }}>Render error: {renderError}</p>
        )}
      </div>

      {diagram.explanation && (
        <p style={{ marginTop: "0.75rem", color: "var(--text-muted)" }}>{diagram.explanation}</p>
      )}
      {diagram.assumptions?.length > 0 && (
        <ul style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {diagram.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button onClick={() => save()} disabled={saving || !editing}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

const badge: React.CSSProperties = {
  fontSize: "0.75rem",
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "0.05rem 0.5rem",
};

const codeStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.5rem 0.75rem",
  fontFamily: "Consolas, monospace",
  fontSize: "0.85rem",
};
