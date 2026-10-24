import { useEffect, useState } from "react";

interface HealthResponse {
  ok: boolean;
  service: string;
  time: string;
}

/** Temporary skeleton shell. Replaced by the real workspace layout in later phases. */
export default function App() {
  const [api, setApi] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then(setApi)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "unknown error"));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>FlowToFeed</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Turn technical Markdown into editable diagrams and channel-specific visual lessons.
      </p>
      <div className="card">
        <strong>API status: </strong>
        {error ? (
          <span style={{ color: "var(--danger)" }}>unreachable ({error})</span>
        ) : api ? (
          <span style={{ color: "var(--ok)" }}>connected</span>
        ) : (
          <span style={{ color: "var(--warn)" }}>checking…</span>
        )}
      </div>
    </main>
  );
}
