import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import SignIn from "./pages/SignIn";
import Dashboard from "./pages/Dashboard";
import ProjectEditor from "./pages/ProjectEditor";

function Guarded({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <main className="page page-narrow" style={{ marginTop: "4rem", color: "var(--text-muted)" }}>Loading…</main>;
  if (!session) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

/** Signed-in users should never sit on /signin. */
function SignInRoute() {
  const { session, loading } = useAuth();
  if (loading) return <main className="page page-narrow" style={{ marginTop: "4rem", color: "var(--text-muted)" }}>Loading…</main>;
  if (session) return <Navigate to="/" replace />;
  return <SignIn />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignInRoute />} />
          <Route
            path="/"
            element={
              <Guarded>
                <Dashboard />
              </Guarded>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <Guarded>
                <ProjectEditor />
              </Guarded>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
