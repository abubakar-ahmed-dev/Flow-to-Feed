import { useEffect, useState } from "react";
import mermaid from "mermaid";
import type { DiagramRow } from "../types";

mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "dark" });

interface Props {
  diagram: DiagramRow;
  onSave: (patch: { mermaid: string; render_state: "rendered" | "failed"; review_state?: "draft" | "approved" | "rejected" }) => Promise<void>;
}

let renderSeq = 0;

/** Renders Mermaid client-side; a failed render keeps the draft and shows the parser error. */
export default function DiagramReview({ diagram, onSave }: Props) {
  const [code, setCode] = useState(diagram.mermaid ?? "");
  const [editing, setEditing] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        <span style={{ flex: 1 }} />
        <button onClick={() => setEditing(!editing)} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {editing ? "Preview" : "Edit source"}
        </button>
        {diagram.review_state !== "approved" && (
          <button onClick={() => save("approved")} disabled={saving || !!renderError}>
            Approve
          </button>
        )}
      </div>

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
          <div style={{ background: "#fff", borderRadius: 8, padding: 8, overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: svg }} />
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
