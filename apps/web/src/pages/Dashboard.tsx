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
    <main className="page">
      <header className="topbar">
        <div className="wordmark">Flow<span>ToFeed</span></div>
        <button className="ghost small" onClick={() => signOut()}>Sign out</button>
      </header>

      <section className="hero">
        <h1>One explanation.<br />Every channel.</h1>
        <p>
          Paste a technical explanation once — get an editable diagram and
          ready-to-post lessons for Instagram, Facebook, and X.
        </p>
        <div style={{ marginTop: "2rem" }}>
          <button onClick={createProject} disabled={creating}>
            {creating ? "Creating…" : "New project"}
          </button>
        </div>
      </section>

      {error && <p className="status-danger">{error}</p>}

      {projects && projects.length > 0 && (
        <>
          <h2 style={{ margin: "3rem 0 1.25rem" }}>Your projects</h2>
          <div style={{ display: "grid", gap: "1rem" }}>
            {projects.map((p) => (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                onClick={(e) => { e.preventDefault(); navigate(`/projects/${p.id}`); }}
                className="card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "inherit" }}
              >
                <div>
                  <strong style={{ fontSize: "1.05rem" }}>{p.title}</strong>
                  <div className="small muted" style={{ marginTop: "0.2rem" }}>
                    updated {new Date(p.updated_at).toLocaleString()}
                    {p.is_public_sample && " · public sample"}
                  </div>
                </div>
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>→</span>
              </a>
            ))}
          </div>
        </>
      )}

      {projects && projects.length === 0 && !error && (
        <p className="muted" style={{ marginTop: "2rem" }}>
          No projects yet — create one above to start.
        </p>
      )}
    </main>
  );
}
