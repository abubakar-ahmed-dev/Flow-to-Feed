import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../auth";
import type { ProjectSummary } from "../types";

export default function Dashboard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ projects: ProjectSummary[] }>("/projects")
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(e.message));
  }, []);

  async function createProject() {
    setCreating(true);
    try {
      const { project } = await api<{ project: ProjectSummary }>("/projects", {
        method: "POST",
        body: { title: "Untitled explanation", source_markdown: "# New explanation\n\nPaste your Markdown here." },
      });
      navigate(`/projects/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "2rem auto", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>FlowToFeed</h1>
        <button onClick={() => signOut()} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          Sign out
        </button>
      </header>

      <section style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
        <div className="card" style={{ flex: 1, padding: "0.6rem 1rem" }}>
          <strong>Channels</strong>
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 4 }}>
            Instagram · Facebook · X — connect via Buffer (distribution phase)
          </div>
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2rem" }}>
        <h2 style={{ margin: 0 }}>Projects</h2>
        <button onClick={createProject} disabled={creating}>
          {creating ? "Creating…" : "New project"}
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {projects === null && !error && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}
      {projects?.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          No projects yet — create one and paste a technical explanation.
        </p>
      )}

      <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
        {projects?.map((p) => (
          <a
            key={p.id}
            href={`/projects/${p.id}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/projects/${p.id}`);
            }}
            className="card"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <strong>{p.title}</strong>
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              updated {new Date(p.updated_at).toLocaleString()}
              {p.is_public_sample && " · public sample"}
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
