import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { supabase } from "../lib/supabase";

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
      if (mode === "signin") {
        // supabase returns {user: null, session: null} with NO error when the
        // address is unconfirmed — surface that instead of failing silently.
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) {
          throw new Error("Email not confirmed. Check your inbox — or turn off 'Confirm email' in Supabase (Authentication → Sign In / Providers).");
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          throw new Error("Account created — but email confirmation is still required. Check your inbox, or disable 'Confirm email' in Supabase (Authentication → Sign In / Providers).");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page-narrow" style={{ marginTop: "6rem" }}>
      <div className="wordmark" style={{ marginBottom: "2.5rem" }}>
        Flow<span>ToFeed</span>
      </div>
      <h1>{mode === "signin" ? "Welcome back" : "Create your studio"}</h1>
      <p className="muted" style={{ marginTop: "0.75rem", marginBottom: "2rem" }}>
        {mode === "signin"
          ? "Sign in to your content studio."
          : "One account. Your explanations stay yours."}
      </p>

      <form onSubmit={submit} className="card" style={{ display: "grid", gap: "1rem" }}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        {error && <span className="status-danger">{error}</span>}
        <button type="submit" disabled={busy}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          className="small"
        >
          {mode === "signin" ? "No account yet? Create one" : "Have an account? Sign in"}
        </a>
      </form>
    </main>
  );
}
