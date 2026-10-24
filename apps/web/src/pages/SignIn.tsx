import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

export default function SignIn() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUp(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 380, margin: "5rem auto", padding: "0 1rem" }}>
      <h1>FlowToFeed</h1>
      <p style={{ color: "var(--text-muted)" }}>Owner sign-in</p>
      <form onSubmit={submit} className="card" style={{ display: "grid", gap: "0.75rem" }}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={inputStyle}
        />
        {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
        <button type="submit" disabled={busy}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          style={{ fontSize: "0.85rem" }}
        >
          {mode === "signin"
            ? "No account yet? Create one"
            : "Have an account? Sign in"}
        </a>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.5rem 0.75rem",
};
